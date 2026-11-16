import { describe, expect, it } from "vitest";
import { MAX_RECENT, RECENT_KEY, createRecentSearches } from "./recent";

/** An in-memory Storage stand-in; `blocked` makes every call throw (a private window, blocked site data). */
function memoryStorage(initial: Record<string, string> = {}, blocked = false) {
  const data = new Map(Object.entries(initial));
  const guard = () => {
    if (blocked) throw new DOMException("blocked", "SecurityError");
  };
  return {
    data,
    getItem: (key: string) => (guard(), data.get(key) ?? null),
    setItem: (key: string, value: string) => (guard(), void data.set(key, value)),
    removeItem: (key: string) => (guard(), void data.delete(key)),
  };
}

describe("recent searches", () => {
  it("keeps the newest first, once whatever the case, at most 8", () => {
    const storage = memoryStorage();
    const recent = createRecentSearches(() => storage);
    for (let i = 1; i <= 10; i++) recent.add(`search ${i}`);
    expect(recent.list()).toHaveLength(MAX_RECENT);
    expect(recent.list()[0]).toBe("search 10");
    recent.add("SEARCH 5");
    expect(recent.list()[0]).toBe("SEARCH 5");
    expect(recent.list().filter((item) => item.toLowerCase() === "search 5")).toHaveLength(1);
    expect(JSON.parse(storage.data.get(RECENT_KEY) ?? "[]")).toEqual(recent.list());
  });

  it("tidies the text and never keeps an IMEI, a phone number or an email", () => {
    const storage = memoryStorage();
    const recent = createRecentSearches(() => storage);
    recent.add("  samsung    frp ");
    recent.add("356938035643809");
    recent.add("+962791234567");
    recent.add("me@mail.example");
    recent.add(" ");
    expect(recent.list()).toEqual(["samsung frp"]);
  });

  it("clear forgets everything and removes the key", () => {
    const storage = memoryStorage();
    const recent = createRecentSearches(() => storage);
    recent.add("icloud");
    recent.clear();
    expect(recent.list()).toEqual([]);
    expect(storage.data.has(RECENT_KEY)).toBe(false);
  });

  it("reads a damaged or foreign value as an empty list", () => {
    for (const raw of ["not json", '{"a":1}', "[1,2,null]", '["ok", 5, ""]']) {
      const storage = memoryStorage({ [RECENT_KEY]: raw });
      const recent = createRecentSearches(() => storage);
      expect(recent.list().every((item) => typeof item === "string" && item !== "")).toBe(true);
    }
    expect(createRecentSearches(() => memoryStorage({ [RECENT_KEY]: '["ok", 5, ""]' })).list()).toEqual(["ok"]);
  });

  it("still works for the page when storage is blocked or missing", () => {
    for (const storage of [() => memoryStorage({}, true), () => null]) {
      const recent = createRecentSearches(storage);
      expect(recent.list()).toEqual([]);
      recent.add("icloud");
      expect(recent.list()).toEqual(["icloud"]);
      recent.clear();
      expect(recent.list()).toEqual([]);
    }
  });
});
