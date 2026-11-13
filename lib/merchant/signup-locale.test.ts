import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/lib/i18n/config";
import {
  SIGNUP_LOCALE_KEY,
  SIGNUP_LOCALE_MAX_AGE_MS,
  SIGNUP_LOCALE_SLACK_MS,
  applySignupLocale,
  parseSignupMarker,
  rememberSignupLocale,
  signupLocaleToApply,
} from "./signup-locale";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(SIGNUP_LOCALE_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    values,
  };
}

const NOW = Date.parse("2026-11-13T12:00:00.000Z");
const marker = (extra: Record<string, unknown> = {}) => JSON.stringify({ locale: "ar", at: NOW, ...extra });
const created = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe("rememberSignupLocale", () => {
  it("writes { locale, at } and nothing else for Arabic", () => {
    const storage = memoryStorage();
    rememberSignupLocale("ar", { storage, now: NOW });
    expect(JSON.parse(storage.values.get(SIGNUP_LOCALE_KEY)!)).toEqual({ locale: "ar", at: NOW });
  });

  it("removes an older marker when the sign-up is in English", () => {
    const storage = memoryStorage(marker());
    rememberSignupLocale("en", { storage, now: NOW });
    expect(storage.values.has(SIGNUP_LOCALE_KEY)).toBe(false);
  });

  it("survives a missing or throwing storage", () => {
    expect(() => rememberSignupLocale("ar", { storage: null })).not.toThrow();
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => rememberSignupLocale("ar", { storage: broken })).not.toThrow();
    expect(() => rememberSignupLocale("en", { storage: broken })).not.toThrow();
  });
});

describe("parseSignupMarker", () => {
  it("accepts exactly a language and a number", () => {
    expect(parseSignupMarker(marker())).toEqual({ locale: "ar", at: NOW });
  });

  it("ignores everything else", () => {
    for (const raw of [null, "", "not json", "null", "[]", "42", '"ar"', '{"locale":"fr","at":1}', '{"locale":"ar"}', '{"locale":"ar","at":"1"}', '{"at":1}']) {
      expect(parseSignupMarker(raw)).toBeNull();
    }
  });
});

describe("signupLocaleToApply", () => {
  const m = { locale: "ar", at: NOW } as const;

  it("applies when the account was created after the marker and has another language", () => {
    expect(signupLocaleToApply(m, { createdAt: created(-5_000), locale: "en" })).toBe("ar");
    expect(signupLocaleToApply(m, { createdAt: created(+5_000), locale: "en" })).toBe("ar");
  });

  it("allows 10 minutes of slack and not a second more", () => {
    expect(signupLocaleToApply(m, { createdAt: created(-SIGNUP_LOCALE_SLACK_MS), locale: "en" })).toBe("ar");
    expect(signupLocaleToApply(m, { createdAt: created(-SIGNUP_LOCALE_SLACK_MS - 1_000), locale: "en" })).toBeNull();
  });

  it("does not apply to an older account", () => {
    expect(signupLocaleToApply(m, { createdAt: created(-3 * 24 * 3_600_000), locale: "en" })).toBeNull();
  });

  it("does not apply when the language already matches", () => {
    expect(signupLocaleToApply(m, { createdAt: created(0), locale: "ar" })).toBeNull();
  });

  it("does not apply on an unreadable date", () => {
    expect(signupLocaleToApply(m, { createdAt: "yesterday-ish", locale: "en" })).toBeNull();
  });
});

describe("applySignupLocale", () => {
  const deps = (storage: ReturnType<typeof memoryStorage> | null, account: { createdAt: string; locale: Locale } = { createdAt: created(-2_000), locale: "en" }) => {
    const getMe = vi.fn(async () => account);
    const setLocale = vi.fn(async () => ({}));
    return { getMe, setLocale, storage, now: () => NOW + 60_000 };
  };

  it("does nothing, and calls nothing, without a marker", async () => {
    const d = deps(memoryStorage());
    expect(await applySignupLocale(d)).toBe("none");
    expect(d.getMe).not.toHaveBeenCalled();
    expect(d.setLocale).not.toHaveBeenCalled();
  });

  it("does nothing without storage", async () => {
    const d = deps(null);
    expect(await applySignupLocale(d)).toBe("none");
    expect(d.getMe).not.toHaveBeenCalled();
  });

  it("saves the language once and removes the marker", async () => {
    const storage = memoryStorage(marker());
    const d = deps(storage);
    expect(await applySignupLocale(d)).toBe("applied");
    expect(d.setLocale).toHaveBeenCalledExactlyOnceWith("ar");
    expect(storage.values.has(SIGNUP_LOCALE_KEY)).toBe(false);
    // The marker is gone: a second sign-in asks nothing.
    expect(await applySignupLocale(d)).toBe("none");
    expect(d.getMe).toHaveBeenCalledTimes(1);
  });

  it("uses the marker up without a change for an older account", async () => {
    const storage = memoryStorage(marker());
    const d = deps(storage, { createdAt: created(-3 * 24 * 3_600_000), locale: "en" });
    expect(await applySignupLocale(d)).toBe("skipped");
    expect(d.setLocale).not.toHaveBeenCalled();
    expect(storage.values.has(SIGNUP_LOCALE_KEY)).toBe(false);
  });

  it("uses the marker up when the account already has the language", async () => {
    const storage = memoryStorage(marker());
    const d = deps(storage, { createdAt: created(-2_000), locale: "ar" });
    expect(await applySignupLocale(d)).toBe("skipped");
    expect(d.setLocale).not.toHaveBeenCalled();
    expect(storage.values.has(SIGNUP_LOCALE_KEY)).toBe(false);
  });

  it("ignores a malformed marker without calling the API", async () => {
    for (const raw of ["not json", '{"locale":"fr","at":1}', "[]"]) {
      const storage = memoryStorage(raw);
      const d = deps(storage);
      expect(await applySignupLocale(d)).toBe("skipped");
      expect(d.getMe).not.toHaveBeenCalled();
      expect(d.setLocale).not.toHaveBeenCalled();
    }
  });

  it("drops a marker that is too old", async () => {
    const storage = memoryStorage(marker());
    const d = { ...deps(storage), now: () => NOW + SIGNUP_LOCALE_MAX_AGE_MS + 1 };
    expect(await applySignupLocale(d)).toBe("skipped");
    expect(d.getMe).not.toHaveBeenCalled();
    expect(storage.values.has(SIGNUP_LOCALE_KEY)).toBe(false);
  });

  it("keeps the marker when a call fails, and never throws", async () => {
    const readFails = memoryStorage(marker());
    const failingRead = { ...deps(readFails), getMe: vi.fn(async () => Promise.reject(new Error("offline"))) };
    expect(await applySignupLocale(failingRead)).toBe("failed");
    expect(readFails.values.has(SIGNUP_LOCALE_KEY)).toBe(true);

    const writeFails = memoryStorage(marker());
    const failingWrite = { ...deps(writeFails), setLocale: vi.fn(async () => Promise.reject(new Error("500"))) };
    expect(await applySignupLocale(failingWrite)).toBe("failed");
    expect(writeFails.values.has(SIGNUP_LOCALE_KEY)).toBe(true);
  });

  it("survives a storage that throws on read", async () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(await applySignupLocale({ ...deps(null), storage })).toBe("none");
  });
});
