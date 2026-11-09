// Merchant settings and integrations: profile, security (password, 2FA, sessions), notifications + Telegram,
// verification (KYC), API keys, webhooks and referrals. Real browser → Next → the isolated demo backend.
// - Active merchant m1 is only read, except for harmless, restored changes (phone, one API key that ends revoked,
//   one webhook that is deleted). Password, 2FA and KYC run on a freshly registered (pending) merchant.
// - Mutating integration tests (API keys, webhooks) run on the desktop project only.
import { createHmac } from "node:crypto";
import { expect, test } from "./fixtures";
import { type APIRequestContext } from "@playwright/test";
import { ACCOUNTS, BASE_URL, signInMerchant } from "./helpers";

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────────────────

const STRONG_PASSWORD = "Quartz-Lamp-58203";

/**
 * Registers a new merchant (it stays `pending`). Registration is rate limited per IP (a few per 10 minutes), so do it
 * once per suite; when the limit is hit, wait for the `Retry-After` the API gives and try again (up to 3 times).
 */
async function registerPendingMerchant(request: APIRequestContext) {
  const email = `settings-e2e-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.test`;
  const send = () =>
    request.post("/client/auth/register", {
      headers: { Origin: new URL(BASE_URL).origin, "Content-Type": "application/json" },
      data: { name: "E2E Check", email, password: STRONG_PASSWORD, country: "JO" },
    });
  let res = await send();
  for (let attempt = 0; attempt < 3 && res.status() === 429; attempt++) {
    const wait = Math.min(Number(res.headers()["retry-after"] ?? 60), 600);
    await new Promise((resolve) => setTimeout(resolve, (wait + 1) * 1000));
    res = await send();
  }
  expect(res.status(), await res.text()).toBe(204);
  return { email, password: STRONG_PASSWORD };
}

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

  test("security: sessions list marks this device", async ({ page }) => {
    await page.goto("/en/merchant/settings/security");
    await expect(page.getByRole("heading", { name: "Active sessions" })).toBeVisible();
    const sessions = page.locator("section#sessions");
    await expect(sessions.getByText("This device", { exact: true })).toHaveCount(1);
    await expect(sessions.getByRole("button", { name: "Sign out" })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Password" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
  });

  test("notifications: Telegram says it is not available, the threshold is validated, switches stay off", async ({ page }) => {
    await page.goto("/en/merchant/settings/notifications");
    await expect(page.getByText("ops@zainmobilehub.example")).toBeVisible();
    await expect(page.getByRole("switch", { name: "Telegram" }).first()).toBeDisabled();

    await page.getByRole("button", { name: "Link Telegram" }).click();
    await expect(page.getByText("Telegram notifications are not available yet.")).toBeVisible();

    await page.getByLabel(/Alert me when my available balance/).fill("abc");
    await page.getByRole("switch", { name: "Email" }).nth(4).check();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(/Enter an amount like 50/)).toBeVisible();
    await expect(page.getByLabel(/Alert me when my available balance/)).toBeFocused();
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(page.getByRole("switch", { name: "Email" }).nth(4)).not.toBeChecked();
  });

  test("notifications: saving sends only what changed, and the change is restored", async ({ page }) => {
    await page.goto("/en/merchant/settings/notifications");
    const put = page.waitForRequest((r) => r.url().endsWith("/client/notification-preferences") && r.method() === "PUT");
    await page.getByLabel(/Alert me when my available balance/).fill("12.5");
    await page.getByRole("button", { name: "Save changes" }).click();
    expect((await put).postDataJSON()).toEqual({ lowBalanceThreshold: "12.5" });
    await expect(page.getByText("Notification settings saved").first()).toBeVisible();

    // Empty = remove the alert.
    const clear = page.waitForRequest((r) => r.url().endsWith("/client/notification-preferences") && r.method() === "PUT");
    await page.getByLabel(/Alert me when my available balance/).fill("");
    await page.getByRole("button", { name: "Save changes" }).click();
    expect((await clear).postDataJSON()).toEqual({ lowBalanceThreshold: null });
  });

  test("verification: an approved merchant sees the status and no form", async ({ page }) => {
    await page.goto("/en/merchant/settings/verification");
    await expect(page.getByText("Your documents were approved. Nothing more to do.")).toBeVisible();
    await expect(page.getByText("Verification is informational.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit for review" })).toHaveCount(0);
  });

  test("referrals: link, plan, referred merchants and commission filters", async ({ page }) => {
    await page.goto("/en/merchant/referrals");
    await expect(page.getByLabel("Referral code", { exact: true })).toHaveValue("GSM0001");
    await expect(page.getByLabel("Referral link", { exact: true })).toHaveValue(/register\?ref=GSM0001$/);
    await expect(page.getByRole("heading", { name: "Your commission plan" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Merchants you referred" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Commissions" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Commissions" }).locator("tbody tr").first()).toBeVisible();

    // Status tab and month filter live in the URL and keep each other.
    await page.getByRole("link", { name: "Approved" }).click();
    await expect(page).toHaveURL(/status=approved/);
    await page.getByLabel("Month").fill("1999-01");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/status=approved&period=1999-01|period=1999-01&status=approved/);
    await expect(page.getByText("No commissions match these filters")).toBeVisible();
  });

  test("webhook deliveries: an unknown endpoint is a not-found page", async ({ page }) => {
    await page.goto("/en/merchant/webhooks/999999");
    await expect(page.getByText(/not found/i).first()).toBeVisible();
  });

  test("Arabic pages are right-to-left and translated", async ({ page }) => {
    for (const [path, heading] of [
      ["/ar/merchant/settings", "إعدادات الحساب"],
      ["/ar/merchant/api-keys", "مفاتيح API"],
      ["/ar/merchant/referrals", "الإحالات"],
    ] as const) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
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
    await expect(create.getByText("Choose at least one permission.")).toBeVisible();
    await create.getByLabel(/^Name/).fill(keyName);
    await create.getByLabel(/Read orders/).check();
    await create.getByLabel(/Allowed IP addresses/).fill("203.0.113.9\nnot-an-ip");
    await create.getByRole("button", { name: "Create key" }).click();
    await expect(create.getByText(/not-an-ip: This is not a valid IP/)).toBeVisible();

    await create.getByLabel(/Allowed IP addresses/).fill("203.0.113.9");
    await create.getByRole("button", { name: "Create key" }).click();
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

  test("webhooks: create → secret shown once → test → deliveries → delete", async ({ page, isMobile }) => {
    test.skip(isMobile, "mutating integration test: desktop project only");
    const hookUrl = `https://example.com/e2e-${Date.now()}`;
    await page.goto("/en/merchant/webhooks");
    await page.getByRole("button", { name: "New endpoint" }).first().click();
    const create = page.getByRole("dialog", { name: "New webhook endpoint" });

    await create.getByLabel("Endpoint URL").fill("http://insecure.example/x");
    await create.getByRole("button", { name: "Create endpoint" }).click();
    await expect(create.getByText("The address must start with https://.")).toBeVisible();
    await expect(create.getByText("Choose at least one event.")).toBeVisible();

    await create.getByLabel("Endpoint URL").fill(hookUrl);
    await create.getByLabel(/Invoice paid/).check();
    await create.getByRole("button", { name: "Create endpoint" }).click();
    const secretDialog = page.getByRole("dialog", { name: "Copy your signing secret now" });
    await expect(secretDialog).toBeVisible();
    expect((await secretDialog.locator("code").innerText()).trim()).toMatch(/^whsec_/);
    await secretDialog.getByRole("button", { name: "I have copied the secret" }).click();

    const card = () => page.locator("article", { has: page.getByRole("heading", { name: hookUrl }) });
    await expect(card()).toBeVisible();

    // A paused endpoint refuses a test (409); an active one accepts it (202).
    await card().getByRole("switch").uncheck();
    await expect(card().getByText("Paused").first()).toBeVisible();
    await card().getByRole("button", { name: "Send test" }).click();
    await expect(page.getByText("This endpoint is paused. Turn it on first.").first()).toBeVisible();
    await card().getByRole("switch").check();
    await expect(card().getByText("Active", { exact: true }).first()).toBeVisible();
    await card().getByRole("button", { name: "Send test" }).click();
    await expect(page.getByText("Test event sent").first()).toBeVisible();

    await card().getByRole("link", { name: "Deliveries" }).click();
    await expect(page).toHaveURL(/\/en\/merchant\/webhooks\/\d+$/);
    await expect(page.getByRole("table", { name: "Webhook deliveries" }).locator("tbody tr").first()).toContainText("Test event");

    await page.getByRole("link", { name: "All webhooks" }).click();
    await card().getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog", { name: "Delete this endpoint?" }).getByRole("button", { name: "Delete endpoint" }).click();
    await expect(page.getByText("Endpoint deleted").first()).toBeVisible();
    await expect(card()).toHaveCount(0);
  });
});

// ── pending merchant (a fresh registration) ─────────────────────────────────────────────────────────────────

test.describe("settings (pending merchant)", () => {
  test.describe.configure({ mode: "serial" });
  let pending: { email: string; password: string };

  test.beforeAll(async ({ playwright }) => {
    test.setTimeout(25 * 60_000); // may have to wait out the registration rate limit
    const request = await playwright.request.newContext({ baseURL: BASE_URL });
    pending = await registerPendingMerchant(request);
    await request.dispose();
  });

  test.beforeEach(async ({ page }) => {
    await signInMerchant(page, pending);
  });

  test("API keys, webhooks, referrals and notifications show the approval notice, never a sign-out", async ({ page }) => {
    for (const path of ["/en/merchant/api-keys", "/en/merchant/webhooks", "/en/merchant/referrals", "/en/merchant/settings/notifications"]) {
      await page.goto(path);
      await expect(page.getByText("This page opens once your merchant account is approved.")).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    }
    // Profile, security and verification work.
    await page.goto("/en/merchant/settings");
    await expect(page.getByLabel("Full name")).toHaveValue("E2E Check");
    await expect(page.getByText("Pending approval").first()).toBeVisible();
  });

  test("verification: files are validated, uploaded and submitted for review", async ({ page }) => {
    await page.goto("/en/merchant/settings/verification");
    await expect(page.getByText("You have not sent any documents yet.")).toBeVisible();

    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText("Add at least one document.")).toBeVisible();

    const input = page.locator('input[type="file"]');
    await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await expect(page.getByText("Only PDF, JPEG or PNG files are accepted.")).toBeVisible();

    await input.setInputFiles({ name: "company-registration.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
    await expect(page.getByText("company-registration.pdf")).toBeVisible();
    await page.getByLabel(/^Note/).fill("Company registration");
    await page.getByRole("button", { name: "Submit for review" }).click();

    await expect(page.getByText("Our team is reviewing your documents.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit for review" })).toHaveCount(0);
    const download = page.getByRole("link", { name: /Download company-registration\.pdf/ });
    await expect(download).toHaveAttribute("href", /^\/client\/files\/\d+$/);
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

  test("sessions: ending the current session goes to sign-in", async ({ page, isMobile }) => {
    test.skip(isMobile, "same flow as desktop");
    await page.goto("/en/merchant/settings/security");
    await page.locator("section#sessions").getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("dialog", { name: "Sign out of this device?" }).getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/en\/sign-in\?as=merchant/);
    await expect(async () => {
      const me = await page.request.get("/client/auth/me");
      expect(me.status()).toBe(401);
    }).toPass();
  });
});
