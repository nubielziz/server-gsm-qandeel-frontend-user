// Sign-in, sign-up and the email-link pages against the isolated demo backend (:3100) and Mailpit (:8025).
// Rules this file keeps (rate limits are real, handoff §3.9): wrong passwords only with throwaway emails, the shared demo
// accounts are never changed (passwords, settings): lifecycle tests create their own customer / merchant.
import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS } from "./helpers";

const DEV_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

/** Replaces Cloudflare's script with a stub that hands out the dev token at once (and again after `reset`). */
async function stubTurnstile(page: Page) {
  await page.route("**/challenges.cloudflare.com/turnstile/v0/api.js*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `var w={};window.turnstile={render:function(el,o){var id="w"+Math.random();w[id]=o;setTimeout(function(){o.callback("${DEV_TOKEN}")},30);return id},reset:function(id){var o=w[id];if(o)setTimeout(function(){o.callback("${DEV_TOKEN}")},30)},remove:function(id){delete w[id]}};`,
    }),
  );
}

// Staff side (admin API of the isolated backend; the seeded Owner's password and TOTP secret are public dev data,
// handoff §9.2). Only used to give a THROWAWAY customer a temporary password, which customers cannot ask for themselves.
const API_ORIGIN = process.env.E2E_API_ORIGIN ?? "http://localhost:3100";
function base32(text: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of text) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret: string, offsetMs = 0): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor((Date.now() + offsetMs) / 30_000)));
  const hmac = createHmac("sha1", base32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const code = (((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]) % 1_000_000;
  return String(code).padStart(6, "0");
}
async function ownerSession(page: Page) {
  const headers = { "Content-Type": "application/json", Origin: "http://localhost:5175" };
  const cookiesOf = (res: Awaited<ReturnType<Page["request"]["post"]>>) =>
    res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value.split(";")[0]).join("; ");
  const login = await page.request.post(`${API_ORIGIN}/admin/auth/login`, {
    headers,
    data: { email: "rami@gsm-supply.example", password: "demo-password" },
  });
  expect(login.status(), await login.text()).toBe(200);
  const second = await page.request.post(`${API_ORIGIN}/admin/auth/2fa`, {
    headers: { ...headers, Cookie: cookiesOf(login), "X-CSRF-Token": login.headers()["x-csrf-token"] },
    data: { code: totp("4DP3DBKM62TVFPNM5QE6OO4P6STUYM3J") },
  });
  expect(second.status(), await second.text()).toBe(204);
  return { ...headers, Cookie: cookiesOf(second), "X-CSRF-Token": second.headers()["x-csrf-token"] };
}

/** `page.goto`, then wait until the first form control is hydrated: React resets a controlled input that was filled before hydration. */
async function go(page: Page, url: string) {
  await page.goto(url);
  await page.waitForFunction(() => {
    const control = document.querySelector("form input, form textarea, form select");
    return !control || Object.keys(control).some((key) => key.startsWith("__reactProps"));
  });
}

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;
}

/** Waits for a Mailpit message to `address` whose text holds a link to `pathPattern`, and returns that link's path+query. */
async function waitForLink(page: Page, address: string, pathPattern: RegExp, skip: string[] = []): Promise<string> {
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

test.describe("sign-in page", () => {
  test.beforeEach(async ({ page }) => stubTurnstile(page));

  test("customer form by default, merchant switch hides the anti-bot step, links are present", async ({ page }) => {
    await go(page, "/en/sign-in");
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Customer" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("button", { name: "Email me a sign-in link instead" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/en/forgot-password?as=customer");
    await expect(page.getByRole("link", { name: "Create account" })).toHaveAttribute("href", /\/en\/sign-up/);

    await page.getByRole("radio", { name: "Merchant" }).click();
    await expect(page.getByRole("link", { name: "Apply as a merchant" })).toHaveAttribute("href", "/en/merchant/register");
    await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/en/forgot-password?as=merchant");
  });

  test("?as=merchant opens the merchant tab", async ({ page }) => {
    await go(page, "/en/sign-in?as=merchant");
    await expect(page.getByRole("radio", { name: "Merchant" })).toHaveAttribute("aria-checked", "true");
  });

  test("Arabic page is right-to-left with Arabic text", async ({ page }) => {
    await go(page, "/ar/sign-in");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1, name: "تسجيل الدخول" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "تاجر" })).toBeVisible();
  });

  test("a wrong password shows one generic message and keeps the page", async ({ page }) => {
    await go(page, "/en/sign-in");
    await page.locator('input[name="email"]').fill(uniqueEmail("nobody"));
    await page.locator('input[name="password"]').fill("definitely-wrong-123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "The email or password is incorrect." })).toBeVisible();
    await expect(page).toHaveURL(/\/en\/sign-in/);
  });

  test("empty fields show field errors and move focus to the first one", async ({ page }) => {
    await go(page, "/en/sign-in");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator('input[name="email"]')).toBeFocused();
    await expect(page.locator('input[name="email"]')).toHaveAttribute("aria-invalid", "true");
  });

  test("customer signs in with a password and lands on the account, then sees the orders", async ({ page }) => {
    await go(page, "/en/sign-in");
    await page.locator('input[name="email"]').fill(ACCOUNTS.customer.email);
    await page.locator('input[name="password"]').fill(ACCOUNTS.customer.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
    await expect(page.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();
    await go(page, "/en/account/orders"); // the rail is a drawer on phones: go straight to the page
    await expect(page).toHaveURL(/\/en\/account\/orders$/);
    await expect(page.getByRole("cell", { name: /SF-\d+$/ }).first()).toBeVisible();
  });

  test("?next= is honoured for same-site paths", async ({ page }) => {
    await go(page, "/en/sign-in?as=customer&next=/en/account/orders");
    await page.locator('input[name="email"]').fill(ACCOUNTS.customer.email);
    await page.locator('input[name="password"]').fill(ACCOUNTS.customer.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account\/orders$/);
  });

  test("?next= with another site falls back to the account", async ({ page }) => {
    await go(page, "/en/sign-in?as=customer&next=https://evil.example/en/account");
    await page.locator('input[name="email"]').fill(ACCOUNTS.customer.email);
    await page.locator('input[name="password"]').fill(ACCOUNTS.customer.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
  });

  test("an account page without a session sends the customer to sign-in and back", async ({ page }) => {
    await go(page, "/en/account/orders");
    await expect(page).toHaveURL(/\/en\/sign-in\?as=customer&next=%2Fen%2Faccount%2Forders/);
    await page.locator('input[name="email"]').fill(ACCOUNTS.customer.email);
    await page.locator('input[name="password"]').fill(ACCOUNTS.customer.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account\/orders$/);
  });

  test("merchant signs in (active) and lands on the portal", async ({ page }) => {
    await go(page, "/en/sign-in?as=merchant");
    await page.locator('input[name="email"]').fill(ACCOUNTS.merchant.email);
    await page.locator('input[name="password"]').fill(ACCOUNTS.merchant.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/merchant$/);
  });

  test("a pending merchant can sign in too", async ({ page }) => {
    await go(page, "/en/sign-in?as=merchant&next=/en/merchant/settings");
    await page.locator('input[name="email"]').fill(ACCOUNTS.pendingMerchant.email);
    await page.locator('input[name="password"]').fill(ACCOUNTS.pendingMerchant.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/merchant\/settings$/);
  });
});

test.describe("email-link pages", () => {
  test.beforeEach(async ({ page }) => stubTurnstile(page));

  test("customer magic link: request, mail, button, signed in; the link works once", async ({ page }) => {
    const email = uniqueEmail("magic");
    await go(page, "/en/sign-in");
    await page.getByRole("button", { name: "Email me a sign-in link instead" }).click();
    await page.locator('input[name="email"]').fill(email);
    await page.getByRole("button", { name: "Email me the link" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Check your email" })).toBeVisible();
    await expect(page.getByText(`a link is on its way to ${email}`)).toBeVisible();

    const link = await waitForLink(page, email, /\/sign-in\?token=/);
    await go(page, link); // proxy.ts adds the language
    await expect(page).toHaveURL(/\/en\/sign-in\?token=/);
    // Never signs in by itself (mail scanners): a button does.
    await expect(page.getByRole("button", { name: "Sign in to GSM Store" })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/en\/sign-in\?token=/);
    await page.getByRole("button", { name: "Sign in to GSM Store" }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
    expect(((await (await page.request.get("/store/v1/me")).json()) as { email: string }).email).toBe(email);

    // Used up: a second visit says expired and offers a new link.
    await page.context().clearCookies();
    await go(page, link);
    await page.getByRole("button", { name: "Sign in to GSM Store" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "This sign-in link has expired" })).toBeVisible();
    await page.getByRole("button", { name: "Request a new link" }).click();
    await expect(page.getByRole("button", { name: "Email me the link" })).toBeVisible();
  });

  test("sign-up as a customer sends the link and shows the neutral confirmation", async ({ page }) => {
    const email = uniqueEmail("signup");
    await go(page, "/en/sign-up");
    await expect(page.getByRole("radio", { name: /^Customer/ })).toBeChecked();
    await page.locator('input[name="email"]').fill(email);
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page.getByText(`a link is on its way to ${email}`)).toBeVisible();
    await waitForLink(page, email, /\/sign-in\?token=/);
  });

  test("sign-up: the merchant choice explains the difference and links to the application", async ({ page }) => {
    await go(page, "/en/sign-up?as=merchant");
    await expect(page.getByRole("radio", { name: /^Merchant/ })).toBeChecked();
    await expect(page.getByText("Every application is reviewed by our team")).toBeVisible();
    await expect(page.getByRole("link", { name: "Apply as a merchant" })).toHaveAttribute("href", "/en/merchant/register");
  });

  test("customer password lifecycle: forgot, set password (weak refused), sign in with it", async ({ page }) => {
    const email = uniqueEmail("pw");
    // An account holder: sign in once by magic link (API), then sign out.
    await page.request.post("/store/v1/auth/magic-link", { headers: { "X-Turnstile-Token": DEV_TOKEN }, data: { email } });
    const first = await waitForLink(page, email, /\/sign-in\?token=/);
    const verified = await page.request.post("/store/v1/auth/verify", { data: { token: new URL(first, "http://x").searchParams.get("token") } });
    expect(verified.status()).toBe(200);
    await page.context().clearCookies();

    await go(page, "/en/forgot-password");
    await page.locator('input[name="email"]').fill(email);
    await page.getByRole("button", { name: "Email me a reset link" }).click();
    await expect(page.getByText(`If an account exists for ${email}`)).toBeVisible();
    const link = await waitForLink(page, email, /\/set-password\?token=/);

    await go(page, link);
    await page.locator('input[name="password"]').fill("password123");
    await page.locator('input[name="confirmPassword"]').fill("password123");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.locator('input[name="password"]')).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText(/Use 10–128 characters/)).toBeVisible(); // WEAK_PASSWORD text under the field

    const good = "Orchard-Lantern-8841";
    await page.locator('input[name="password"]').fill(good);
    await page.locator('input[name="confirmPassword"]').fill("not-the-same-1");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByText("The two passwords do not match.")).toBeVisible();
    await page.locator('input[name="confirmPassword"]').fill(good);
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByText("Your password is saved")).toBeVisible();
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en\/sign-in\?as=customer/);

    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(good);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
  });

  test("set-password pages explain a missing or spent link", async ({ page }) => {
    await go(page, "/en/set-password");
    await expect(page.getByText("This page needs the link from your email")).toBeVisible();
    await go(page, "/en/merchant/set-password?token=" + "x".repeat(43));
    await page.locator('input[name="password"]').fill("Orchard-Lantern-8841");
    await page.locator('input[name="confirmPassword"]').fill("Orchard-Lantern-8841");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByText("This link has expired")).toBeVisible();
    await expect(page.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/en/forgot-password?as=merchant");
  });

  test("verify-email pages: a bad merchant link says expired, a customer link needs the button", async ({ page }) => {
    await go(page, "/en/merchant/verify-email?token=" + "y".repeat(43));
    await page.getByRole("button", { name: "Verify my email" }).click();
    await expect(page.getByText("This link has expired")).toBeVisible();

    await go(page, "/en/verify-email?token=" + "z".repeat(43));
    await page.getByRole("button", { name: "Confirm and sign in" }).click();
    await expect(page.getByText("This sign-in link has expired").or(page.getByText("This link has expired"))).toBeVisible();
  });

  test("merchant lifecycle: apply, verify the email, reset the password, sign in as pending", async ({ page }) => {
    const email = uniqueEmail("merchant");
    await go(page, "/en/merchant/register?ref=");
    await page.locator('input[name="name"]').fill("Test Merchant");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill("Orchard-Lantern-8841");
    await page.locator('select[name="country"]').selectOption("JO");
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect(page.getByText("Check your email")).toBeVisible();

    const verify = await waitForLink(page, email, /\/merchant\/verify-email\?token=/);
    await go(page, verify);
    await page.getByRole("button", { name: "Verify my email" }).click();
    await expect(page.getByText("Your email is verified")).toBeVisible();

    await go(page, "/en/forgot-password?as=merchant");
    await expect(page.getByRole("radio", { name: "Merchant" })).toHaveAttribute("aria-checked", "true");
    await page.locator('input[name="email"]').fill(email);
    await page.getByRole("button", { name: "Email me a reset link" }).click();
    await expect(page.getByText(`If an account exists for ${email}`)).toBeVisible();
    const reset = await waitForLink(page, email, /\/merchant\/set-password\?token=/);

    await go(page, reset);
    const fresh = "Meadow-Compass-5520";
    await page.locator('input[name="password"]').fill(fresh);
    await page.locator('input[name="confirmPassword"]').fill(fresh);
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByText("Your password is saved")).toBeVisible();
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page.getByRole("radio", { name: "Merchant" })).toHaveAttribute("aria-checked", "true");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(fresh);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/merchant$/);

    // Two-step verification on this account (a pending merchant may set it up): sign-in then asks for the code.
    const csrf = (await page.request.get("/client/auth/me")).headers()["x-csrf-token"];
    const setup = await page.request.post("/client/security/2fa/setup", { headers: { "X-CSRF-Token": csrf } });
    expect(setup.status(), await setup.text()).toBe(200);
    const { secret } = (await setup.json()) as { secret: string };
    const enabled = await page.request.post("/client/security/2fa/enable", { headers: { "X-CSRF-Token": csrf }, data: { code: totp(secret) } });
    expect(enabled.status(), await enabled.text()).toBe(204);
    await page.context().clearCookies();

    await go(page, "/en/sign-in?as=merchant");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(fresh);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Two-step verification" })).toBeVisible();
    const code = page.locator('input[name="code"]');
    await expect(code).toHaveAttribute("inputmode", "numeric");
    await expect(code).toHaveAttribute("autocomplete", "one-time-code");
    await code.fill("12ab34"); // only digits are kept
    await expect(code).toHaveValue("1234");
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(code).toHaveAttribute("aria-invalid", "true"); // too short: caught before any request
    await code.fill("000000");
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(page.getByText("That code is not right.")).toBeVisible(); // 422 on `code`, not a sign-out
    // The code of the next 30-second step is accepted (±1 step) and was not used by the enable call above.
    await code.fill(totp(secret, 30_000));
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(page).toHaveURL(/\/en\/merchant$/);
  });

  test("merchant register: a referral code that matches nobody is refused on its field", async ({ page }) => {
    await go(page, "/en/merchant/register?ref=NOSUCHCODE");
    await expect(page.locator('input[name="referralCode"]')).toHaveValue("NOSUCHCODE");
    await page.locator('input[name="name"]').fill("Test Merchant");
    await page.locator('input[name="email"]').fill(uniqueEmail("refcode"));
    await page.locator('input[name="password"]').fill("Orchard-Lantern-8841");
    await page.locator('select[name="country"]').selectOption("JO");
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect(page.locator('input[name="referralCode"]')).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("This referral code is not valid.")).toBeVisible();
    await expect(page.locator('input[name="referralCode"]')).toBeFocused();
  });
});

test.describe("temporary password", () => {
  test.beforeEach(async ({ page }) => stubTurnstile(page));

  test("a customer whose password staff set must choose their own before continuing", async ({ page }) => {
    const email = uniqueEmail("temp");
    await page.request.post("/store/v1/auth/magic-link", { headers: { "X-Turnstile-Token": DEV_TOKEN }, data: { email } });
    const link = await waitForLink(page, email, /\/sign-in\?token=/);
    expect((await page.request.post("/store/v1/auth/verify", { data: { token: new URL(link, "http://x").searchParams.get("token") } })).status()).toBe(200);
    await page.context().clearCookies();

    const staff = await ownerSession(page);
    const found = await page.request.get(`${API_ORIGIN}/admin/customers?q=${encodeURIComponent(email)}`, { headers: staff });
    const id = ((await found.json()) as { id: number }[])[0].id;
    const made = await page.request.post(`${API_ORIGIN}/admin/customers/${id}/password`, { headers: staff, data: { mode: "temporary_password" } });
    expect(made.status(), await made.text()).toBe(200);
    const { temporaryPassword } = (await made.json()) as { temporaryPassword: string };

    await go(page, "/en/sign-in");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(temporaryPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Choose your own password" })).toBeVisible();
    await expect(page).toHaveURL(/\/en\/sign-in/); // not signed in yet: the pending session only allows this step

    await page.locator('input[name="newPassword"]').fill("password123");
    await page.locator('input[name="confirmPassword"]').fill("password123");
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page.locator('input[name="newPassword"]')).toHaveAttribute("aria-invalid", "true");

    const chosen = "Willow-Anchor-7304";
    await page.locator('input[name="newPassword"]').fill(chosen);
    await page.locator('input[name="confirmPassword"]').fill(chosen);
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
    expect((await page.request.get("/store/v1/me")).status()).toBe(200);

    await page.context().clearCookies();
    const again = await page.request.post("/store/v1/auth/login", { headers: { "X-Turnstile-Token": DEV_TOKEN }, data: { email, password: chosen } });
    expect((await again.json()).next).toBe("done");
  });
});
