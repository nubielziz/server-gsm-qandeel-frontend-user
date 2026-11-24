import { describe, expect, it } from "vitest";
import { ACCOUNT_ROUTES, FAMILY_PREFIX, FAMILY_ROUTES, familyOfPath } from "./routes";

/** Every path string in a routes object, with the name it sits under. */
function pathsOf(routes: object, prefix = ""): [string, string][] {
  return Object.entries(routes).flatMap(([name, value]): [string, string][] =>
    typeof value === "string" ? [[prefix + name, value]] : pathsOf(value as object, `${prefix}${name}.`),
  );
}

describe("FAMILY_ROUTES", () => {
  it("starts every shop path with /store/v1/", () => {
    for (const [name, path] of pathsOf(FAMILY_ROUTES.store)) expect(path.startsWith("/store/v1/"), name).toBe(true);
  });

  it("starts every portal path with /client/", () => {
    for (const [name, path] of pathsOf(FAMILY_ROUTES.client)) expect(path.startsWith("/client/"), name).toBe(true);
  });

  it("gives both families every route the account area uses", () => {
    const shared = Object.keys(FAMILY_ROUTES.store).sort();
    expect(shared).toEqual(
      ["files", "me", "notifications", "orders", "password", "profile", "stream", "tickets", "twoFactor", "wallet"].sort(),
    );
    for (const name of shared) expect(FAMILY_ROUTES.client, name).toHaveProperty(name);
  });

  it("keeps the merchant-only routes in the portal family alone", () => {
    const merchantOnly = ["dashboard", "invoices", "services", "apiKeys", "notificationPreferences"];
    for (const name of merchantOnly) {
      expect(FAMILY_ROUTES.client, name).toHaveProperty(name);
      expect(FAMILY_ROUTES.store, name).not.toHaveProperty(name);
    }
  });

  it("reads the account from the route of its own family", () => {
    expect(FAMILY_ROUTES.store.me).toBe("/store/v1/me");
    expect(FAMILY_ROUTES.client.me).toBe("/client/auth/me");
  });

  it("saves a profile to the route of its own family", () => {
    expect(FAMILY_ROUTES.store.profile).toBe("/store/v1/me");
    expect(FAMILY_ROUTES.client.profile).toBe("/client/profile");
  });

  it("keeps two-step sign-in for the retail rank on the shop routes", () => {
    expect(FAMILY_ROUTES.store.twoFactor).toEqual({
      setup: "/store/v1/me/2fa/setup",
      enable: "/store/v1/me/2fa/enable",
      disable: "/store/v1/me/2fa/disable",
    });
    expect(FAMILY_ROUTES.client.twoFactor).toEqual({
      setup: "/client/security/2fa/setup",
      enable: "/client/security/2fa/enable",
      disable: "/client/security/2fa/disable",
    });
  });

  it("puts the inbox, the stream, the tickets and the files of each family under its own prefix", () => {
    expect(FAMILY_ROUTES.store).toMatchObject({
      notifications: "/store/v1/me/notifications",
      stream: "/store/v1/me/stream",
      tickets: "/store/v1/me/tickets",
      files: "/store/v1/files",
    });
    expect(FAMILY_ROUTES.client).toMatchObject({
      notifications: "/client/notifications",
      stream: "/client/stream",
      tickets: "/client/tickets",
      files: "/client/files",
    });
  });

  it("puts the wallet and the orders of each family under its own prefix, and adds funds by invoice for the portal family", () => {
    expect(FAMILY_ROUTES.store.wallet).toBe("/store/v1/me/wallet");
    expect(FAMILY_ROUTES.store.orders).toBe("/store/v1/me/orders");
    expect(FAMILY_ROUTES.client.wallet).toBe("/client/wallet");
    expect(FAMILY_ROUTES.client.orders).toBe("/client/orders");
    expect(FAMILY_ROUTES.client.invoices).toBe("/client/invoices");
  });

  it("has no path with a query, a fragment, a space or a trailing slash", () => {
    for (const family of ["store", "client"] as const) {
      for (const [name, path] of pathsOf(FAMILY_ROUTES[family])) {
        expect(path, `${family}.${name}`).toMatch(/^\/[A-Za-z0-9/_-]*[A-Za-z0-9_-]$/);
      }
    }
  });

  it("has no two routes of the portal family on one path, and none of the shop family but the account and its profile", () => {
    const duplicates = (routes: object) => {
      const seen = new Map<string, string>();
      const found: string[] = [];
      for (const [name, path] of pathsOf(routes)) {
        const before = seen.get(path);
        if (before) found.push(`${before}=${name}`);
        else seen.set(path, name);
      }
      return found;
    };
    expect(duplicates(FAMILY_ROUTES.client)).toEqual([]);
    expect(duplicates(FAMILY_ROUTES.store)).toEqual(["me=profile"]);
  });
});

describe("ACCOUNT_ROUTES", () => {
  it("serves sign-in, the code step, the forced change and sign-out on the portal prefix for every account", () => {
    expect(ACCOUNT_ROUTES.signIn).toBe("/client/auth/sign-in");
    expect(ACCOUNT_ROUTES.totp).toBe("/client/auth/2fa");
    expect(ACCOUNT_ROUTES.forcedPasswordChange).toBe("/client/auth/password/change");
    expect(ACCOUNT_ROUTES.logout).toBe("/client/auth/logout");
  });

  it("serves the forgot, set-password and verify-email steps on the portal prefix for every account", () => {
    expect(ACCOUNT_ROUTES.forgotPassword).toBe("/client/auth/password/forgot");
    expect(ACCOUNT_ROUTES.resetPassword).toBe("/client/auth/password/reset");
    expect(ACCOUNT_ROUTES.verifyEmail).toBe("/client/auth/verify-email");
  });

  it("keeps the email link on the shop prefix", () => {
    expect(ACCOUNT_ROUTES.linkRequest).toBe("/store/v1/auth/magic-link");
    expect(ACCOUNT_ROUTES.linkSignIn).toBe("/store/v1/auth/verify");
  });

  it("keeps both privacy requests on the shop prefix, one route each for every rank", () => {
    expect(ACCOUNT_ROUTES.dataExport).toBe("/store/v1/me/data-export");
    expect(ACCOUNT_ROUTES.dataDelete).toBe("/store/v1/me/data-delete");
  });

  it("names a path under one of the two API prefixes, once", () => {
    const paths = pathsOf(ACCOUNT_ROUTES).map(([, path]) => path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(familyOfPath(path), path).not.toBeNull();
  });
});

describe("familyOfPath", () => {
  it("names the family of a path under its prefix", () => {
    expect(familyOfPath("/client/auth/me")).toBe("client");
    expect(familyOfPath("/client/orders/7")).toBe("client");
    expect(familyOfPath("/store/v1/me")).toBe("store");
    expect(familyOfPath("/store/v1/services?x=1")).toBe("store");
  });

  it("names no family for a path that only looks like a prefix", () => {
    for (const path of ["/clients", "/client", "/store", "/store/v10/me", "/store/v1", "/en/account", "/", "", "client/x"]) {
      expect(familyOfPath(path), path).toBeNull();
    }
  });

  it("agrees with the prefix table", () => {
    expect(FAMILY_PREFIX).toEqual({ store: "/store/v1/", client: "/client/" });
  });
});
