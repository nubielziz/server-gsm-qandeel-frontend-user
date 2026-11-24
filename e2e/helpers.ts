// Shared e2e helpers. Sign-in goes through the site's own origin (the /client and /store/v1 rewrites), so the
// session cookies land in the browser context exactly as after a real sign-in. There is one kind of account: a rank tells a
// retail account from a merchant (its own prices in the shop, wallet invoices, API); the helpers take the rank as an option.
import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { FIXTURES_FILE, changeAccountEmail, createAccount, setAccountStatus, type E2eFixtures, type RankKind } from "./admin";

/** Credentials of an account. */
export interface Credentials {
  email: string;
  password: string;
}

/** Demo accounts on the isolated backend (scripts/dev-backend.sh; see PROGRESS.md). */
export const ACCOUNTS = {
  retail: { email: "daniel.whitmore@mail.example", password: "demo-password" },
  merchant: { email: "ops@zainmobilehub.example", password: "Storefront-Test-4821" },
} as const satisfies Record<RankKind, Credentials>;

/** The token the backend's dev Turnstile verifier accepts (handoff §3.10). */
export const DEV_TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

/** Same base URL as playwright.config.ts. */
export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5175";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function origin(_page: Page): string {
  return new URL(BASE_URL).origin;
}

/**
 * Signs an account of either rank in: `POST /client/auth/sign-in` with the site's Origin and the dev Turnstile token, as the
 * browser would. One route, one form: the answer's `rank` decides which family of routes the session reaches.
 *
 * A page that already holds a session of the other rank should clear its cookies first (`page.context().clearCookies()`).
 *
 * @param account the credentials; only the email and the password are sent, so a `FreshAccount` can be passed as it is
 * @param options `next`: the step the answer must name (default `"done"`; a temporary password answers `"password"`, two-step `"totp"`)
 * @returns the CSRF token of the new session (the answer's `X-CSRF-Token`), for specs that call the API with `page.request`
 */
export async function signIn(page: Page, account: Credentials = ACCOUNTS.retail, options: { next?: "done" | "password" | "totp" } = {}): Promise<string> {
  const res = await page.request.post("/client/auth/sign-in", {
    headers: { Origin: origin(page), "X-Turnstile-Token": DEV_TURNSTILE_TOKEN, "Content-Type": "application/json" },
    data: { email: account.email, password: account.password },
  });
  expect(res.status(), await res.text()).toBe(200);
  expect((await res.json()).next).toBe(options.next ?? "done");
  return res.headers()["x-csrf-token"] ?? "";
}

/** Latest Mailpit message to an address (the isolated backend sends all mail to Mailpit). */
export async function latestMailTo(page: Page, address: string): Promise<{ subject: string; text: string } | null> {
  const list = await page.request.get(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${address}`)}&limit=1`);
  const body = (await list.json()) as { messages?: { ID: string; Subject: string }[] };
  const first = body.messages?.[0];
  if (!first) return null;
  const message = (await (await page.request.get(`http://localhost:8025/api/v1/message/${first.ID}`)).json()) as {
    Text?: string;
    HTML?: string;
  };
  return { subject: first.Subject, text: `${message.Text ?? ""}\n${message.HTML ?? ""}` };
}

/** Replaces Cloudflare's script with a stub that hands out the dev token at once (and again after `reset`). */
export async function stubTurnstile(page: Page) {
  await page.route("**/challenges.cloudflare.com/turnstile/v0/api.js*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `var w={};window.turnstile={render:function(el,o){var id="w"+Math.random();w[id]=o;setTimeout(function(){o.callback("${DEV_TURNSTILE_TOKEN}")},30);return id},reset:function(id){var o=w[id];if(o)setTimeout(function(){o.callback("${DEV_TURNSTILE_TOKEN}")},30)},remove:function(id){delete w[id]}};`,
    }),
  );
}

/** `page.goto`, then wait until the first form control is hydrated: React resets a controlled input that was filled before hydration. */
export async function go(page: Page, url: string) {
  await page.goto(url);
  await page.waitForFunction(() => {
    const control = document.querySelector("form input, form textarea, form select");
    return !control || Object.keys(control).some((key) => key.startsWith("__reactProps"));
  });
}

/**
 * Waits until every form control on the page is hydrated. `go` waits for the first one only, and on a page with the
 * workspace header that is the header's search box: the page's own form sits in a later Suspense boundary and hydrates a
 * moment after it. Call this before typing into such a form, and after `page.reload()`. It is not part of `go`: some specs
 * read what the server rendered before the page's effects run (the top-up return notice).
 */
export async function hydrated(page: Page) {
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("form input, form textarea, form select")).every((control) =>
      Object.keys(control).some((key) => key.startsWith("__reactProps")),
    ),
  );
}

/** A made-up address nobody owns; the isolated backend sends its mail to Mailpit. */
export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;
}

/** The mailed link that sets a password (an invitation or a reset): `/set-password` at the root of the shop, for every rank. */
export const SET_PASSWORD_LINK = /^\/set-password\?token=/;
/** The mailed link that verifies an address: `/verify-email` at the root of the shop, for every rank. */
export const VERIFY_EMAIL_LINK = /^\/verify-email\?token=/;
/** The mailed link that signs a retail account in (or makes it: the email link). */
export const SIGN_IN_LINK = /\/sign-in\?token=/;

/**
 * Waits for a Mailpit message to `address` whose text holds a link to `pathPattern`, and returns that link's path+query.
 * Links in mail point at the dev site (http://localhost:5175): use the path and query on the site under test.
 * `skip` lists links already used (a second mail of the same kind).
 */
export async function waitForLink(page: Page, address: string, pathPattern: RegExp, skip: string[] = []): Promise<string> {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const list = await page.request.get(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${address}`)}&limit=10`);
    const body = (await list.json()) as { messages?: { ID: string }[] };
    for (const { ID } of body.messages ?? []) {
      const message = (await (await page.request.get(`http://localhost:8025/api/v1/message/${ID}`)).json()) as { Text?: string; HTML?: string };
      const text = `${message.Text ?? ""}\n${message.HTML ?? ""}`.replace(/&amp;/g, "&");
      for (const match of text.matchAll(/https?:\/\/localhost:5175(\/[^\s"'<>)\]]+)/g)) {
        if (pathPattern.test(match[1]) && !skip.includes(match[1])) return match[1];
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`no mail to ${address} with a link matching ${pathPattern}`);
}

/** The `token` query parameter of an emailed link (the path+query `waitForLink` returns). */
export function tokenOf(link: string): string {
  return new URL(link, "http://x").searchParams.get("token") ?? "";
}

/**
 * A brand-new retail account made the way a visitor makes one: the email link (`POST /store/v1/auth/magic-link`, then the link's
 * token to `POST /store/v1/auth/verify`). The page is signed in afterwards, the account has no password and its address is proven.
 * Use `freshAccount` for an account with a password or a merchant rank.
 *
 * @param options `email`: the address to sign up (default: a new one); `claimGuestOrders`: tick the box that adds the orders a guest
 *   placed with this address (the account's address is proven by the link)
 * @returns the address, how many guest orders the exchange added, and `claimSkipped` when it could not just now
 */
export async function signUpByLink(
  page: Page,
  options: { email?: string; claimGuestOrders?: boolean } = {},
): Promise<{ email: string; claimedOrders: number; claimSkipped?: "busy" }> {
  const email = options.email ?? uniqueEmail("acct");
  const asked = await page.request.post("/store/v1/auth/magic-link", { headers: { "X-Turnstile-Token": DEV_TURNSTILE_TOKEN }, data: { email } });
  expect(asked.status(), await asked.text()).toBe(204);
  const link = await waitForLink(page, email, SIGN_IN_LINK);
  const verified = await page.request.post("/store/v1/auth/verify", {
    data: { token: tokenOf(link), ...(options.claimGuestOrders ? { claimGuestOrders: true } : {}) },
  });
  expect(verified.status(), await verified.text()).toBe(200);
  const answer = (await verified.json()) as { next?: string; claimedOrders?: number; claimSkipped?: "busy" };
  expect(answer.next).toBe("done");
  return { email, claimedOrders: answer.claimedOrders ?? 0, ...(answer.claimSkipped ? { claimSkipped: answer.claimSkipped } : {}) };
}

/** The password `freshAccount` gives a new account (the one e2e/auth.spec.ts sets from the invitation). */
export const FRESH_ACCOUNT_PASSWORD = "Orchard-Lantern-8841";

/** An account `freshAccount` made: its credentials, staff id and rank kind. */
export interface FreshAccount extends Credentials {
  id: number;
  rank: RankKind;
}

/**
 * A brand-new account, made the way the product makes one: staff create it through the admin API (`createAccount`: a retail
 * account unless `rank: "merchant"`, which the Owner gives) and the person sets a password from the invitation mailed to it
 * (`POST /client/auth/password/reset` with the link's token, the call the set-password page makes). The account is active, its
 * email is verified (an invitation proves the mailbox) and nobody is signed in unless `signedIn` is set.
 *
 * With `unverified`, staff then change the address (`changeAccountEmail`): the verification is cleared and a verification link
 * is mailed to the NEW address, which is the one returned (match it with `VERIFY_EMAIL_LINK`). With `suspended`, staff then
 * suspend the account (it cannot sign in: 403 `ACCOUNT_SUSPENDED`). With `signedIn`, the page signs in with `signIn`.
 *
 * @returns the credentials, the staff id and the rank kind
 */
export async function freshAccount(
  page: Page,
  options: { rank?: RankKind; name?: string; unverified?: boolean; suspended?: boolean; signedIn?: boolean } = {},
): Promise<FreshAccount> {
  if (options.signedIn && (options.suspended || options.unverified)) throw new Error("A page can sign in only to an active account with a proven address.");
  const rank = options.rank ?? "retail";
  const invited = uniqueEmail(rank === "retail" ? "acct" : "merchant");
  const id = await createAccount({ email: invited, name: options.name, rank });
  const invitation = await waitForLink(page, invited, SET_PASSWORD_LINK);
  const set = await page.request.post("/client/auth/password/reset", {
    headers: { Origin: origin(page), "Content-Type": "application/json" },
    data: { token: tokenOf(invitation), password: FRESH_ACCOUNT_PASSWORD },
  });
  expect(set.status(), await set.text()).toBe(204);

  let email = invited;
  if (options.unverified) {
    email = uniqueEmail(rank === "retail" ? "acct" : "merchant");
    await changeAccountEmail(id, email);
  }
  if (options.suspended) await setAccountStatus(id, "suspended");
  const account = { email, password: FRESH_ACCOUNT_PASSWORD, id, rank };
  if (options.signedIn) await signIn(page, account);
  return account;
}

/** What the global setup wrote to e2e/.auth/fixtures.json (see e2e/global-setup.ts). */
export function fixtures(): E2eFixtures {
  try {
    return JSON.parse(readFileSync(FIXTURES_FILE, "utf8")) as E2eFixtures;
  } catch {
    throw new Error("e2e/.auth/fixtures.json is missing: run Playwright without E2E_SKIP_SETUP=1 once so the global setup writes it.");
  }
}
