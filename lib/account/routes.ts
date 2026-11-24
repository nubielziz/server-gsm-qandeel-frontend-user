// Every API route the account area calls, in one table. Three groups:
// - ACCOUNT_ROUTES: the routes every account uses, whatever its rank (sign-in, the code step, sign-out, password links,
//   the email link, the privacy requests);
// - FAMILY_ROUTES.store: the routes of the shop family (`/store/v1`, the retail rank);
// - FAMILY_ROUTES.client: the routes of the portal family (`/client`, a merchant rank), which also has the routes only a
//   merchant rank has.
// A value is a path without a query. A route with sub-routes (the wallet, the notifications, the orders) is its base path:
// the caller adds the rest. Pure: this file holds strings and one lookup, nothing else.
import type { AccountFamily } from "./family";

/** The routes that serve every account. The first seven stay on the portal prefix whatever the rank. */
export const ACCOUNT_ROUTES = {
  /** One password form for every account. */
  signIn: "/client/auth/sign-in",
  /** The second step of a two-step sign-in. */
  totp: "/client/auth/2fa",
  /** The forced change of a temporary password. */
  forcedPasswordChange: "/client/auth/password/change",
  logout: "/client/auth/logout",
  forgotPassword: "/client/auth/password/forgot",
  /** Sets a password from an invitation or a reset link. */
  resetPassword: "/client/auth/password/reset",
  /** Marks the email as verified; never signs anyone in. */
  verifyEmail: "/client/auth/verify-email",
  /** Asks for a sign-in link by email. Only a retail rank gets a mail; every address gets the same answer. */
  linkRequest: "/store/v1/auth/magic-link",
  /** Exchanges the emailed link for a session. */
  linkSignIn: "/store/v1/auth/verify",
  /** Asks for a copy of the account's data (every rank). */
  dataExport: "/store/v1/me/data-export",
  /** Asks for the account to be erased (the retail rank; a merchant rank is refused with a message). */
  dataDelete: "/store/v1/me/data-delete",
} as const;

/** The routes both families have, under each family's own prefix. */
export type FamilyRoutes = {
  /** Reads the signed-in account (GET). */
  readonly me: string;
  /** Saves the account's profile (PATCH). */
  readonly profile: string;
  /** Changes the account's own password. */
  readonly password: string;
  /** Two-step sign-in set-up, switch on and switch off. */
  readonly twoFactor: { readonly setup: string; readonly enable: string; readonly disable: string };
  readonly notifications: string;
  /** The live stream of the inbox. */
  readonly stream: string;
  readonly tickets: string;
  /** File uploads for tickets. */
  readonly files: string;
  readonly wallet: string;
  readonly orders: string;
};

/** The routes only the portal family has: they serve merchant ranks. */
export type ClientRoutes = FamilyRoutes & {
  readonly dashboard: string;
  /** The invoice list; creating one is how funds are added. */
  readonly invoices: string;
  /** The account's own catalog at its own prices; `?ids=` reads the prices the shop shows it (decision 003). */
  readonly services: string;
  readonly apiKeys: string;
  readonly notificationPreferences: string;
};

/** The two path prefixes. A path under one of them is served by the API, never by a page of the site. */
export const FAMILY_PREFIX = { store: "/store/v1/", client: "/client/" } as const satisfies Record<AccountFamily, string>;

export const FAMILY_ROUTES: { readonly store: FamilyRoutes; readonly client: ClientRoutes } = {
  store: {
    me: "/store/v1/me",
    profile: "/store/v1/me",
    password: "/store/v1/me/password",
    twoFactor: {
      setup: "/store/v1/me/2fa/setup",
      enable: "/store/v1/me/2fa/enable",
      disable: "/store/v1/me/2fa/disable",
    },
    notifications: "/store/v1/me/notifications",
    stream: "/store/v1/me/stream",
    tickets: "/store/v1/me/tickets",
    files: "/store/v1/files",
    wallet: "/store/v1/me/wallet",
    orders: "/store/v1/me/orders",
  },
  client: {
    me: "/client/auth/me",
    profile: "/client/profile",
    password: "/client/security/password",
    twoFactor: {
      setup: "/client/security/2fa/setup",
      enable: "/client/security/2fa/enable",
      disable: "/client/security/2fa/disable",
    },
    notifications: "/client/notifications",
    stream: "/client/stream",
    tickets: "/client/tickets",
    files: "/client/files",
    wallet: "/client/wallet",
    orders: "/client/orders",
    dashboard: "/client/dashboard",
    invoices: "/client/invoices",
    services: "/client/services",
    apiKeys: "/client/api-keys",
    notificationPreferences: "/client/notification-preferences",
  },
};

/**
 * The family whose prefix a request path starts with, or null for any other path. The check is on the whole prefix with
 * its slashes, so "/clients" and "/store/v10" belong to no family.
 */
export function familyOfPath(path: string): AccountFamily | null {
  if (path.startsWith(FAMILY_PREFIX.client)) return "client";
  if (path.startsWith(FAMILY_PREFIX.store)) return "store";
  return null;
}
