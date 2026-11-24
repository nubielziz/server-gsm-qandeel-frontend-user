// The sections of the settings area and which of them an account has. One area for every account; its rank decides the
// list: everyone has Profile, Security and Privacy; a merchant rank adds Notifications (the portal's email switches) and
// API keys. The server pages and the navigation both read this file, so a link is never shown for a page the account
// cannot open. Pure and import-free beyond the capabilities type: safe in server and client files.
import type { AccountCapabilities } from "./capabilities";

/** The five sections, in the order the navigation lists them. */
export type SettingsSection = "profile" | "security" | "notifications" | "api-keys" | "privacy";

/** One entry of the settings navigation. */
export type SettingsNavItem = {
  readonly section: SettingsSection;
  /** The page's path without the language prefix (`sitePath` adds it). */
  readonly href: string;
  /** `exact`: current only on that page; `prefix`: also on every page below it. */
  readonly match: "exact" | "prefix";
};

/** Where each section lives. The profile is the area's own address, so it is matched exactly. */
export const SETTINGS_PATHS: Readonly<Record<SettingsSection, string>> = {
  profile: "/account/settings",
  security: "/account/settings/security",
  notifications: "/account/settings/notifications",
  "api-keys": "/account/settings/api-keys",
  privacy: "/account/settings/privacy",
};

/** The part of the capabilities the navigation reads. */
export type SettingsNavSource = Pick<AccountCapabilities, "notificationPreferences" | "apiKeys" | "dataExport">;

/**
 * The sections an account has, in navigation order. Profile and Security are open to every account (a link-only account
 * is offered a password on the Security page); Privacy follows the data-export capability; Notifications and API keys
 * follow their own merchant-only capabilities. A signed-out visitor (no capability) gets Profile and Security only, and
 * the pages send that visitor to sign in before showing anything.
 */
export function settingsNav(caps: SettingsNavSource): SettingsNavItem[] {
  const items: SettingsNavItem[] = [
    { section: "profile", href: SETTINGS_PATHS.profile, match: "exact" },
    { section: "security", href: SETTINGS_PATHS.security, match: "prefix" },
  ];
  if (caps.notificationPreferences) items.push({ section: "notifications", href: SETTINGS_PATHS.notifications, match: "prefix" });
  if (caps.apiKeys) items.push({ section: "api-keys", href: SETTINGS_PATHS["api-keys"], match: "prefix" });
  if (caps.dataExport) items.push({ section: "privacy", href: SETTINGS_PATHS.privacy, match: "prefix" });
  return items;
}
