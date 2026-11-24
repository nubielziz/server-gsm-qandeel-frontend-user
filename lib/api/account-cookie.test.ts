import { describe, expect, it } from "vitest";
import { ACCOUNT_CSRF_COOKIES, accountCsrfFrom, accountFamilyFromCookies, hasAccountCookie } from "./account-cookie";

/** A cookie jar as a function pair, the way a request's cookies are read. */
function jar(cookies: Record<string, string>) {
  return {
    has: (name: string) => name in cookies,
    read: (name: string) => cookies[name],
  };
}

describe("ACCOUNT_CSRF_COOKIES", () => {
  it("lists the portal name first and the shop name second", () => {
    expect([...ACCOUNT_CSRF_COOKIES]).toEqual(["csrf_token_client", "csrf_token_store"]);
  });
});

describe("hasAccountCookie", () => {
  it("counts either name", () => {
    expect(hasAccountCookie(jar({ csrf_token_client: "a" }).has)).toBe(true);
    expect(hasAccountCookie(jar({ csrf_token_store: "b" }).has)).toBe(true);
    expect(hasAccountCookie(jar({ csrf_token_client: "a", csrf_token_store: "b" }).has)).toBe(true);
  });

  it("is false when neither exists, whatever else is in the jar", () => {
    expect(hasAccountCookie(jar({}).has)).toBe(false);
    expect(hasAccountCookie(jar({ gsm_session: "x", csrf_token: "y", other_csrf_token_client: "z" }).has)).toBe(false);
  });

  it("reads a cookie header string such as document.cookie", () => {
    expect(hasAccountCookie("a=1; csrf_token_store=tok; b=2")).toBe(true);
    expect(hasAccountCookie("csrf_token_client=tok")).toBe(true);
    expect(hasAccountCookie("a=1; b=2")).toBe(false);
    expect(hasAccountCookie("")).toBe(false);
    expect(hasAccountCookie("xcsrf_token_client=1; csrf_token_client_x=2")).toBe(false);
  });

  it("does not count a cookie header entry with an empty value", () => {
    expect(hasAccountCookie("csrf_token_client=; csrf_token_store=")).toBe(false);
  });
});

describe("accountCsrfFrom", () => {
  it("reads the shop name when it is the only one", () => {
    expect(accountCsrfFrom(jar({ csrf_token_store: "store-token" }).read)).toBe("store-token");
  });

  it("reads the portal name when it is the only one", () => {
    expect(accountCsrfFrom(jar({ csrf_token_client: "client-token" }).read)).toBe("client-token");
  });

  it("lets the portal name win when both exist", () => {
    expect(accountCsrfFrom(jar({ csrf_token_store: "store-token", csrf_token_client: "client-token" }).read)).toBe(
      "client-token",
    );
  });

  it("skips a portal cookie with an empty value", () => {
    expect(accountCsrfFrom(jar({ csrf_token_client: "", csrf_token_store: "store-token" }).read)).toBe("store-token");
  });

  it("gives undefined when there is no account cookie", () => {
    expect(accountCsrfFrom(jar({}).read)).toBeUndefined();
    expect(accountCsrfFrom(jar({ gsm_session: "x" }).read)).toBeUndefined();
    expect(accountCsrfFrom(() => null)).toBeUndefined();
  });

  it("reads a cookie header string, decoded, with the same order", () => {
    expect(accountCsrfFrom("a=1; csrf_token_store=s%2Fs")).toBe("s/s");
    expect(accountCsrfFrom("csrf_token_store=s; csrf_token_client=c")).toBe("c");
    expect(accountCsrfFrom("csrf_token_client=%E0%A4%A; csrf_token_store=s")).toBe("%E0%A4%A");
    expect(accountCsrfFrom("a=1")).toBeUndefined();
  });
});

describe("accountFamilyFromCookies", () => {
  it("names the portal family for the portal cookie and the shop family for the shop cookie", () => {
    expect(accountFamilyFromCookies(jar({ csrf_token_client: "a" }).has)).toBe("client");
    expect(accountFamilyFromCookies(jar({ csrf_token_store: "b" }).has)).toBe("store");
  });

  it("lets the portal cookie win when both exist", () => {
    expect(accountFamilyFromCookies(jar({ csrf_token_store: "b", csrf_token_client: "a" }).has)).toBe("client");
  });

  it("names no family without a cookie", () => {
    expect(accountFamilyFromCookies(jar({}).has)).toBeUndefined();
    expect(accountFamilyFromCookies("a=1")).toBeUndefined();
  });

  it("reads a cookie header string", () => {
    expect(accountFamilyFromCookies("x=1; csrf_token_store=t")).toBe("store");
    expect(accountFamilyFromCookies("csrf_token_client=t; csrf_token_store=t")).toBe("client");
  });
});
