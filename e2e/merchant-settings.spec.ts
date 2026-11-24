// Merchant settings and integrations: profile, security (password, 2FA), notifications,
// API keys. Real browser → Next → the isolated demo backend.
// - Active merchant m1 is only read, except for harmless, restored changes (phone, one API key that ends revoked).
//   Password and 2FA run on a throwaway merchant that staff invite (`freshMerchant`); the approval notice is read on the demo's
//   own pending account.
// - Mutating integration tests (API keys) run on the desktop project only.
import { createHmac } from "node:crypto";
import { expect, test } from "./fixtures";
import { type Request } from "@playwright/test";
import { ACCOUNTS, freshMerchant, hydrated, signInMerchant } from "./helpers";

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────────────────

function base32Decode(text: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of text.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits). `step` 1 = the next window (the server accepts ±1). */
function totp(secret: string, step = 0): string {
  const counter = Math.floor(Date.now() / 30_000) + step;
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = hash[hash.length - 1] & 15;
  const value = ((hash[offset] & 0x7f) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3];
  return String(value % 1_000_000).padStart(6, "0");
}

// ── active merchant ──────────────────────────────────────────────────────────────────────────────────────────

test.describe("settings (active merchant)", () => {
  test.beforeEach(async ({ page }) => {
    await signInMerchant(page);
  });

  test("the settings frame: navigation, summary, security shortcuts and help", async ({ page }) => {
    await page.goto("/en/merchant/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Account settings" })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Settings sections" });
    await expect(nav.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Security" })).not.toHaveAttribute("aria-current", "page");
    // The page of verification documents is gone: three tabs are left.
    await expect(nav.getByRole("link")).toHaveCount(3);
    await expect(nav.getByRole("link", { name: "Verification" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Account summary" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Account security" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Contact support" })).toHaveAttribute("href", "/en/help");

    await nav.getByRole("link", { name: "Security" }).click();
    await expect(page).toHaveURL(/\/en\/merchant\/settings\/security$/);
    await expect(nav.getByRole("link", { name: "Security" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Profile" })).not.toHaveAttribute("aria-current", "page");
  });

  test("profile: read-only email with its badge, editable fields, only changes are saved", async ({ page }) => {
    await page.goto("/en/merchant/settings");
    await expect(page.getByLabel("Email address")).toHaveValue(ACCOUNTS.merchant.email);
    await expect(page.getByLabel("Email address")).toHaveJSProperty("readOnly", true);
    await expect(page.getByText("Verified", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("To change your email address, contact support.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();

    const phone = page.getByLabel("Phone number");
    const before = await phone.inputValue();
    await phone.fill("+962 79 555 0100");
    await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();

    // Only the changed key goes to the API.
    const patch = page.waitForRequest((r) => r.url().endsWith("/client/profile") && r.method() === "PATCH");
    await page.getByRole("button", { name: "Save changes" }).click();
    expect((await patch).postDataJSON()).toEqual({ phone: "+962 79 555 0100" });
    await expect(page.getByText("Profile updated").first()).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Phone number")).toHaveValue("+962 79 555 0100");

    // Restore.
    await page.getByLabel("Phone number").fill(before);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Profile updated").first()).toBeVisible();
  });

  test("profile: an empty name is refused in the browser and focus moves to it", async ({ page }) => {
    await page.goto("/en/merchant/settings");
    await page.getByLabel("Full name").fill("");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Enter your name.")).toBeVisible();
    await expect(page.getByLabel("Full name")).toBeFocused();
  });

  test("security: password and two-step cards only; the old #sessions address opens the page without an error", async ({ page }) => {
    // The per-device session list is retired; a bookmark or an old shortcut to its anchor still lands on the security page.
    const response = await page.goto("/en/merchant/settings/security#sessions");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Password" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Active sessions" })).toHaveCount(0);
    await expect(page.locator("section#sessions")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Active sessions" })).toHaveCount(0);
  });

  test("notifications: every event has one Email switch, the threshold is validated and discarding restores the form", async ({ page }) => {
    await page.goto("/en/merchant/settings/notifications");
    await expect(page.getByText("ops@zainmobilehub.example")).toBeVisible();

    // Announcements (`broadcast.announcement`): one switch, Email (the account is only read here, e2e/merchant-account.spec.ts
    // saves on a throwaway one).
    const announcements = page.getByRole("group", { name: "Announcements" });
    await expect(announcements.getByRole("switch")).toHaveCount(1);
    const announcementsOn = await announcements.getByRole("switch", { name: "Email" }).isChecked();

    await page.getByLabel(/Alert me when my available balance/).fill("abc");
    await page.getByRole("switch", { name: "Email" }).nth(4).check();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(/Enter an amount like 50/)).toBeVisible();
    await expect(page.getByLabel(/Alert me when my available balance/)).toBeFocused();
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(page.getByRole("switch", { name: "Email" }).nth(4)).not.toBeChecked();
    // Discarding leaves Announcements as the API showed it.
    expect(await announcements.getByRole("switch", { name: "Email" }).isChecked()).toBe(announcementsOn);
  });

  test("notifications: saving sends only what changed, and the change is restored", async ({ page }) => {
    const isSave = (r: Request) => r.url().endsWith("/client/notification-preferences") && r.method() === "PUT";
    /** Saves the form and waits for the API's answer: a request that is only sent can still be dropped when the test ends. */
    const save = async () => {
      const sent = page.waitForRequest(isSave);
      await page.getByRole("button", { name: "Save changes" }).click();
      const request = await sent;
      expect((await request.response())?.ok(), "the API saved it").toBe(true);
      await expect(page.getByText("Notification settings saved").first()).toBeVisible();
      return request.postDataJSON() as unknown;
    };
    await page.goto("/en/merchant/settings/notifications");
    await hydrated(page);
    const alert = page.getByLabel(/Alert me when my available balance/);
    // Start from "no alert": a run that ended before its last save was answered left 12.5 behind (seen 2026-11-17), and
    // typing the stored value changes nothing, so the button stayed disabled for every later run.
    if ((await alert.inputValue()) !== "") {
      await alert.fill("");
      await save();
      await page.reload();
      await hydrated(page);
    }

    await alert.fill("12.5");
    expect(await save()).toEqual({ lowBalanceThreshold: "12.5" });

    // Empty = remove the alert.
    await alert.fill("");
    expect(await save()).toEqual({ lowBalanceThreshold: null });
  });

  test("the old verification address opens the profile page", async ({ page }) => {
    await page.goto("/en/merchant/settings/verification");
    await expect(page).toHaveURL(/\/en\/merchant\/settings$/);
    await expect(page.getByRole("heading", { level: 1, name: "Account settings" })).toBeVisible();
    await expect(page.getByLabel("Full name")).toBeVisible();
  });

  test("the old referrals address opens the merchant overview", async ({ page }) => {
    await page.goto("/en/merchant/referrals");
    await expect(page).toHaveURL(/\/en\/merchant$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome back,");
    await page.goto("/en/merchant/referrals?status=approved&period=2026-11"); // a filtered bookmark ends on the same page
    await expect(page).toHaveURL(/\/en\/merchant(\?|$)/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome back,");
  });

  test("the old Webhooks addresses open the API keys page", async ({ page }) => {
    for (const path of ["/en/merchant/webhooks", "/en/merchant/webhooks/12"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/en\/merchant\/api-keys$/);
      await expect(page.getByRole("heading", { level: 1, name: "API keys" })).toBeVisible();
    }
  });

  test("the settings and API keys pages open with their heading and do not scroll sideways", async ({ page }) => {
    for (const [path, heading] of [
      ["/en/merchant/settings", "Account settings"],
      ["/en/merchant/api-keys", "API keys"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });

  test("API keys: create → secret shown once → edit IPs → revoke", async ({ page, isMobile }) => {
    test.skip(isMobile, "mutating integration test: desktop project only");
    const keyName = `E2E key ${Date.now()}`;
    await page.goto("/en/merchant/api-keys");
    await page.getByRole("button", { name: "New API key" }).click();
    const create = page.getByRole("dialog", { name: "New API key" });

    // Browser validation first, then a server-side IP error that names the bad entry.
    await create.getByRole("button", { name: "Create key" }).click();
    await expect(create.getByText("Name the key.")).toBeVisible();
    // A key is a Dhru credential: no list of permissions to choose from.
    await expect(create.getByText("Permissions")).toHaveCount(0);
    await create.getByLabel(/^Name/).fill(keyName);
    await create.getByLabel(/Allowed IP addresses/).fill("203.0.113.9\nnot-an-ip");
    await create.getByRole("button", { name: "Create key" }).click();
    await expect(create.getByText(/not-an-ip: This is not a valid IP/)).toBeVisible();

    await create.getByLabel(/Allowed IP addresses/).fill("203.0.113.9");
    const post = page.waitForRequest((r) => r.url().endsWith("/client/api-keys") && r.method() === "POST");
    await create.getByRole("button", { name: "Create key" }).click();
    expect((await post).postDataJSON()).toEqual({ name: keyName, scopes: ["dhru"], allowedIps: ["203.0.113.9"] });
    const secretDialog = page.getByRole("dialog", { name: "Copy your API key now" });
    await expect(secretDialog).toBeVisible();
    await expect(secretDialog.getByText(/only time the key is shown/)).toBeVisible();
    const secret = (await secretDialog.locator("code").innerText()).trim();
    expect(secret).toMatch(/^gsm_/);
    await secretDialog.getByRole("button", { name: "I have copied the key" }).click();
    await expect(secretDialog).toBeHidden();
    await expect(page.locator("body")).not.toContainText(secret);

    const card = () => page.locator("article", { has: page.getByRole("heading", { name: keyName }) });
    await expect(card()).toContainText("203.0.113.9");
    await expect(card().getByText("Permissions")).toHaveCount(0);
    await card().getByRole("button", { name: /Edit/ }).click();
    const edit = page.getByRole("dialog", { name: "Edit API key" });
    await edit.getByLabel(/Allowed IP addresses/).fill("203.0.113.77");
    await edit.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("API key updated").first()).toBeVisible();
    await expect(card()).toContainText("203.0.113.77");

    await card().getByRole("button", { name: /Revoke/ }).click();
    await page.getByRole("dialog", { name: "Revoke this key?" }).getByRole("button", { name: "Revoke key" }).click();
    await expect(page.getByText("API key revoked").first()).toBeVisible();
    await expect(card().getByText("Revoked")).toBeVisible();
    await expect(card().getByRole("button", { name: /Revoke/ })).toHaveCount(0);
  });
});

// ── merchant waiting for approval (the demo's pending account, only read) ───────────────────────────────────
// Staff-made accounts are active at once, so the waiting state is no longer made by a test: the demo's own pending account is read.

test.describe("settings (merchant waiting for approval)", () => {
  test.beforeEach(async ({ page }) => {
    await signInMerchant(page, ACCOUNTS.pendingMerchant);
  });

  test("API keys and notifications show the approval notice, never a sign-out", async ({ page }) => {
    for (const path of ["/en/merchant/api-keys", "/en/merchant/settings/notifications"]) {
      await page.goto(path);
      await expect(page.getByText("This page opens once your merchant account is approved.")).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    }
    // Profile and security work.
    await page.goto("/en/merchant/settings");
    await expect(page.getByLabel("Full name")).not.toHaveValue("");
    await expect(page.getByText("Pending approval").first()).toBeVisible();
  });
});

// ── a merchant that staff invited (a throwaway account for each test) ───────────────────────────────────────

test.describe("settings (invited merchant)", () => {
  test.beforeEach(async ({ page }) => {
    await signInMerchant(page, await freshMerchant(page));
  });

  test("password: wrong current password and mismatch are reported on the right fields", async ({ page }) => {
    await page.goto("/en/merchant/settings/security");
    const form = page.locator("section#password");
    await form.getByLabel("Current password").fill("not-my-password-1");
    await form.getByLabel(/^New password/).fill("Marble-Orbit-71920");
    await form.getByLabel("Confirm new password").fill("Marble-Orbit-00000");
    await form.getByRole("button", { name: "Change password" }).click();
    await expect(form.getByText("The two passwords do not match.")).toBeVisible();

    await form.getByLabel("Confirm new password").fill("Marble-Orbit-71920");
    await form.getByRole("button", { name: "Change password" }).click();
    await expect(form.getByText("That is not your current password.")).toBeVisible();
    await expect(form.getByLabel("Current password")).toBeFocused();
  });

  test("two-step verification: set up → enable → disable, QR is an image", async ({ page, isMobile }) => {
    test.skip(isMobile, "same flow as desktop");
    await page.goto("/en/merchant/settings/security");
    const card = page.locator("section#two-factor");
    await card.getByRole("button", { name: "Set up" }).click();

    // The QR is only ever an <img> with a data URI (the API's SVG is never injected as markup).
    const qr = card.getByAltText(/QR code/);
    await expect(qr).toBeVisible();
    expect(await qr.getAttribute("src")).toMatch(/^data:image\/svg\+xml;utf8,/);
    await expect(card.locator("svg:not([aria-hidden])")).toHaveCount(0);

    const secret = (await card.locator("code").first().innerText()).trim();
    expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
    await card.getByLabel(/6-digit code/).fill("000000");
    await card.getByRole("button", { name: "Turn on" }).click();
    await expect(card.getByText("That code is not correct")).toBeVisible();

    await card.getByLabel(/6-digit code/).fill(totp(secret));
    await card.getByRole("button", { name: "Turn on" }).click();
    await expect(page.getByText("Two-step verification is on").first()).toBeVisible();
    await expect(card.getByText("On", { exact: true })).toBeVisible();

    // The next 30-second window's code is accepted (±1) and differs from the one just used.
    await card.getByRole("button", { name: "Turn off" }).click();
    await card.getByLabel(/6-digit code/).fill(totp(secret, 1));
    await card.getByRole("button", { name: "Turn off" }).click();
    await expect(page.getByText("Two-step verification is off").first()).toBeVisible();
    await expect(card.getByText("Off", { exact: true })).toBeVisible();
  });

  test("sign out: the account menu ends the merchant session and goes to sign-in", async ({ page, isMobile }) => {
    test.skip(isMobile, "same flow as desktop");
    await page.goto("/en/merchant/settings/security");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/en\/sign-in\?as=merchant/);
    await expect(async () => {
      const me = await page.request.get("/client/auth/me");
      expect(me.status()).toBe(401);
    }).toPass();
  });
});
