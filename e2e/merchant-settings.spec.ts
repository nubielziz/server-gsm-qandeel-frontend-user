// Settings of a merchant rank and of a retail rank: profile, security (password, two-step), notifications, API keys and
// privacy, all under /en/account/settings. Real browser -> Next -> the isolated demo backend.
// - The demo merchant is only read, except for harmless, restored changes (phone).
//   Password, two-step and privacy run on throwaway accounts that staff create (`freshAccount`).
import { createHmac } from "node:crypto";
import { expect, test } from "./fixtures";
import { type Request } from "@playwright/test";
import { ACCOUNTS, freshAccount, hydrated, signIn } from "./helpers";

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

// ── demo merchant ────────────────────────────────────────────────────────────────────────────────────────────

test.describe("settings (demo merchant)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.merchant);
  });

  test("the settings frame: navigation, summary, security shortcuts and help", async ({ page }) => {
    await page.goto("/en/account/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Account settings" })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Settings sections" });
    await expect(nav.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Security" })).not.toHaveAttribute("aria-current", "page");
    // A merchant rank has every section: profile, security, notifications, API keys and privacy.
    await expect(nav.getByRole("link")).toHaveText(["Profile", "Security", "Notifications", "API keys", "Privacy"]);
    await expect(nav.getByRole("link", { name: "Verification" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Account summary" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Account security" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Contact support" })).toHaveAttribute("href", "/en/account/support/new");

    await nav.getByRole("link", { name: "Security" }).click();
    await expect(page).toHaveURL(/\/en\/account\/settings\/security$/);
    await expect(nav.getByRole("link", { name: "Security" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Profile" })).not.toHaveAttribute("aria-current", "page");
  });

  test("profile: read-only email with its badge, editable fields, only changes are saved", async ({ page }) => {
    await page.goto("/en/account/settings");
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

  test("profile: the account details are read only and name the Dhru username and the rank", async ({ page }) => {
    await page.goto("/en/account/settings");
    const details = page.getByRole("region", { name: "Account details" });
    await expect(details).toBeVisible();
    await expect(details.getByText("Username", { exact: true })).toBeVisible();
    await expect(details.getByText("Rank", { exact: true })).toBeVisible();
    await expect(details.getByText("Member since", { exact: true })).toBeVisible();
    await expect(details.getByRole("textbox")).toHaveCount(0);
    // A merchant rank has no preferences card (that is the retail rank's currency and marketing choice).
    await expect(page.getByRole("heading", { name: "Preferences" })).toHaveCount(0);
  });

  test("profile: an empty name is refused in the browser and focus moves to it", async ({ page }) => {
    await page.goto("/en/account/settings");
    await page.getByLabel("Full name").fill("");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Enter your name.")).toBeVisible();
    await expect(page.getByLabel("Full name")).toBeFocused();
  });

  test("security: password and two-step cards only; the old #sessions address opens the page without an error", async ({ page }) => {
    // The per-device session list is retired; a bookmark or an old shortcut to its anchor still lands on the security page.
    const response = await page.goto("/en/account/settings/security#sessions");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Password" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Active sessions" })).toHaveCount(0);
    await expect(page.locator("section#sessions")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Active sessions" })).toHaveCount(0);
  });

  test("notifications: every event has one Email switch, the threshold is validated and discarding restores the form", async ({ page }) => {
    await page.goto("/en/account/settings/notifications");
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
    await page.goto("/en/account/settings/notifications");
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
    await expect(page).toHaveURL(/\/en\/account\/settings$/);
    await expect(page.getByRole("heading", { level: 1, name: "Account settings" })).toBeVisible();
    await expect(page.getByLabel("Full name")).toBeVisible();
  });

  test("the old referrals address opens the account home, a filtered bookmark too", async ({ page }) => {
    await page.goto("/en/merchant/referrals");
    await expect(page).toHaveURL(/\/en\/account$/);
    await page.goto("/en/merchant/referrals?status=approved&period=2026-11");
    await expect(page).toHaveURL(/\/en\/account(\?|$)/);
  });

  test("the old Webhooks addresses open the API keys page", async ({ page }) => {
    for (const path of ["/en/merchant/webhooks", "/en/merchant/webhooks/12"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/en\/account\/settings\/api-keys$/);
      await expect(page.getByRole("heading", { level: 1, name: "Account settings" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "API keys" })).toBeVisible();
    }
  });

  test("the settings pages open with their heading and do not scroll sideways", async ({ page }) => {
    for (const [path, heading] of [
      ["/en/account/settings", "Personal information"],
      ["/en/account/settings/security", "Password"],
      ["/en/account/settings/notifications", "Notifications"],
      ["/en/account/settings/api-keys", "API keys"],
      ["/en/account/settings/privacy", "Privacy and data"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: "Account settings" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: heading }).first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test("API keys are read only: no create, edit or revoke, and Contact us for any change (decision 005)", async ({ page }) => {
    await page.goto("/en/account/settings/api-keys");
    await expect(page.getByRole("heading", { level: 2, name: "API keys" })).toBeVisible();
    await expect(page.getByText(/Our team creates your keys/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Contact us/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /New API key|Edit|Revoke/ })).toHaveCount(0);
  });
});

// ── a retail account: the sections it has, and the ones it does not ──────────────────────────────────────────

test.describe("settings (retail account)", () => {
  test("the navigation lists Profile, Security and Privacy only", async ({ page }) => {
    await freshAccount(page, { signedIn: true });
    await page.goto("/en/account/settings");
    const nav = page.getByRole("navigation", { name: "Settings sections" });
    await expect(nav.getByRole("link")).toHaveText(["Profile", "Security", "Privacy"]);
    await expect(nav.getByRole("link", { name: "Notifications" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "API keys" })).toHaveCount(0);
  });

  test("the merchant-only pages send a retail account to the account home", async ({ page }) => {
    await freshAccount(page, { signedIn: true });
    for (const path of ["/en/account/settings/notifications", "/en/account/settings/api-keys"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/en\/account$/);
    }
  });

  test("privacy: a retail account can ask for a copy of its data and for erasure", async ({ page }) => {
    await freshAccount(page, { signedIn: true });
    await page.goto("/en/account/settings/privacy");
    await expect(page.getByRole("button", { name: "Request data export" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Request deletion" })).toBeVisible();
    await expect(page.getByText("This account has a merchant rank.")).toHaveCount(0);
  });
});

// ── a merchant that staff created (a throwaway account for each test) ────────────────────────────────────────

test.describe("settings (new merchant)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, await freshAccount(page, { rank: "merchant" }));
  });

  test("password: wrong current password and mismatch are reported on the right fields", async ({ page }) => {
    await page.goto("/en/account/settings/security");
    const form = page.locator("section#password");
    await form.getByLabel("Current password").fill("not-my-password-1");
    await form.getByLabel(/^New password/).fill("Marble-Orbit-71920");
    await form.getByLabel("Confirm new password").fill("Marble-Orbit-00000");
    await form.getByRole("button", { name: "Change password" }).click();
    await expect(form.getByText("The two passwords do not match.")).toBeVisible();

    await form.getByLabel("Confirm new password").fill("Marble-Orbit-71920");
    await form.getByRole("button", { name: "Change password" }).click();
    await expect(form.getByText("This is not your current password.")).toBeVisible();
    await expect(form.getByLabel("Current password")).toBeFocused();
  });

  test("two-step verification: set up → enable → disable, QR is an image", async ({ page, isMobile }) => {
    test.skip(isMobile, "same flow as desktop");
    await page.goto("/en/account/settings/security");
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

  test("privacy: a merchant rank can ask for its data and is told how to ask for erasure; no erasure is sent", async ({ page }) => {
    const sent: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (request.method() === "POST" && /\/store\/v1\/me\/data-(export|delete)$/.test(path)) sent.push(path);
    });
    await page.goto("/en/account/settings/privacy");
    const card = page.locator("section#privacy");
    await expect(card.getByText("This account has a merchant rank. Ask us to move it to the retail rank first; then you can ask for erasure.")).toBeVisible();
    await expect(card.getByRole("link", { name: "Contact support" })).toHaveAttribute("href", "/en/account/support/new");
    await expect(page.getByRole("button", { name: "Request deletion" })).toHaveCount(0);

    await hydrated(page);
    await card.getByRole("button", { name: "Request data export" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Request received: Data export" })).toBeVisible();
    expect(sent).toEqual(["/store/v1/me/data-export"]);
  });

  test("sign out: the account menu ends the session and goes to sign-in", async ({ page, isMobile }) => {
    test.skip(isMobile, "same flow as desktop");
    await page.goto("/en/account/settings/security");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/en\/sign-in(\?|$)/);
    await expect(async () => {
      const me = await page.request.get("/client/auth/me");
      expect(me.status()).toBe(401);
    }).toPass();
  });
});
