// The language a merchant signed up in (plan D4, BH §5.3). `POST /client/auth/register` takes no language, so every
// merchant starts as `en` and the first emails are English. After an Arabic sign-up the register form leaves a marker
// `{ locale, at }` in localStorage (never an email), and the first merchant sign-in in that browser that reaches `done`
// reads `GET /client/auth/me`: when the account was created at or after the marker (10 minutes of slack for clock
// differences) and its `locale` differs, it sends `PATCH /client/profile { locale }`. The marker is removed after that
// one use. Signing in on the other language's page never changes a saved language, and every failure is ignored: this
// is a convenience, never a reason to stop a sign-in.
// The browser and the API calls are passed in, so the rules are unit-tested without either. Safe to import anywhere.
import { isLocale, type Locale } from "@/lib/i18n/config";

export const SIGNUP_LOCALE_KEY = "gsm.merchant.signup-locale";
/** An account may be this much older than the marker (the server clock and the browser clock differ). */
export const SIGNUP_LOCALE_SLACK_MS = 10 * 60_000;
/** A marker nobody used for this long is stale (a different account could be the one signing in now). */
export const SIGNUP_LOCALE_MAX_AGE_MS = 14 * 24 * 3_600_000;

type MarkerStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type SignupLocaleMarker = { locale: Locale; at: number };

/** `localStorage`, or null where it is missing or blocked (private window, blocked site data, server render). */
function browserStorage(): MarkerStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function forget(storage: MarkerStorage): void {
  try {
    storage.removeItem(SIGNUP_LOCALE_KEY);
  } catch {
    // nothing to do: the marker stays and is judged again next time
  }
}

/**
 * Leaves the marker after a successful merchant registration. Only a language other than English needs one: a
 * registration in English removes an older marker, so it can never be applied to the new account.
 */
export function rememberSignupLocale(
  locale: Locale,
  options: { storage?: MarkerStorage | null; now?: number } = {},
): void {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  if (!storage) return;
  try {
    if (locale === "en") storage.removeItem(SIGNUP_LOCALE_KEY);
    else storage.setItem(SIGNUP_LOCALE_KEY, JSON.stringify({ locale, at: options.now ?? Date.now() } satisfies SignupLocaleMarker));
  } catch {
    // storage full or blocked: the language is simply not saved
  }
}

/** The marker in a stored value, or null for anything that is not exactly `{ locale: "en" | "ar", at: <number> }`. */
export function parseSignupMarker(raw: string | null): SignupLocaleMarker | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { locale, at } = value as { locale?: unknown; at?: unknown };
    if (!isLocale(locale) || typeof at !== "number" || !Number.isFinite(at)) return null;
    return { locale, at };
  } catch {
    return null;
  }
}

/**
 * The language to save, or null when nothing should change: the account already has it, the account is older than the
 * marker minus the slack (so it is not the one that was just created), or the date is unreadable.
 */
export function signupLocaleToApply(
  marker: SignupLocaleMarker,
  account: { createdAt: string; locale: Locale },
): Locale | null {
  if (account.locale === marker.locale) return null;
  const createdAt = Date.parse(account.createdAt);
  if (!Number.isFinite(createdAt)) return null;
  if (createdAt < marker.at - SIGNUP_LOCALE_SLACK_MS) return null;
  return marker.locale;
}

export type ApplySignupLocaleResult =
  /** No marker: nothing was asked of the API. */
  | "none"
  /** The language was saved on the account. */
  | "applied"
  /** The marker was used up without a change (older account, same language, unreadable or stale marker). */
  | "skipped"
  /** A call failed: the marker stays for the next sign-in. */
  | "failed";

export type ApplySignupLocaleDeps = {
  /** `GET /client/auth/me` */
  getMe: () => Promise<{ createdAt: string; locale: Locale }>;
  /** `PATCH /client/profile { locale }` */
  setLocale: (locale: Locale) => Promise<unknown>;
  storage?: MarkerStorage | null;
  now?: () => number;
};

/** Runs the one-time language save of a merchant's first sign-in. Never throws. */
export async function applySignupLocale({ getMe, setLocale, storage: given, now = Date.now }: ApplySignupLocaleDeps): Promise<ApplySignupLocaleResult> {
  const storage = given === undefined ? browserStorage() : given;
  if (!storage) return "none";
  let raw: string | null;
  try {
    raw = storage.getItem(SIGNUP_LOCALE_KEY);
  } catch {
    return "none";
  }
  if (raw === null) return "none";

  const marker = parseSignupMarker(raw);
  if (!marker || now() - marker.at > SIGNUP_LOCALE_MAX_AGE_MS) {
    forget(storage);
    return "skipped";
  }

  let account: Awaited<ReturnType<ApplySignupLocaleDeps["getMe"]>>;
  try {
    account = await getMe();
  } catch {
    return "failed";
  }
  const locale = signupLocaleToApply(marker, account);
  if (locale) {
    try {
      await setLocale(locale);
    } catch {
      return "failed";
    }
  }
  forget(storage);
  return locale ? "applied" : "skipped";
}
