// Sign-in, sign-up and the email-link pages against the isolated demo backend (:3100) and Mailpit (:8025).
// Rules this file keeps (rate limits are real, handoff §3.9): wrong passwords only with throwaway emails, the shared demo
// accounts are never changed (passwords, settings): lifecycle tests create their own customer / merchant.
// The sign-in page is ONE form for customers and merchants (plan F10): the radios are gone. The smart-sign-in specifics
// (request shape, tokens, temporary passwords, language marker) live in e2e/smart-sign-in.spec.ts.
import { expect, test } from "./fixtures";
import { customerIdByEmail, temporaryCustomerPassword, totp } from "./admin";
import { ACCOUNTS, DEV_TURNSTILE_TOKEN, go, stubTurnstile, uniqueEmail, waitForLink } from "./helpers";

test.describe("sign-in page", () => {
  test.beforeEach(async ({ page }) => stubTurnstile(page));

  test("one form for both kinds: no account-type choice, and every other way in is always shown", async ({ page }) => {
    await go(page, "/en/sign-in");
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Email me a sign-in link (customers)" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/en/forgot-password");
    await expect(page.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/en/sign-up");
    await expect(page.getByRole("link", { name: "Apply as a merchant" })).toHaveAttribute("href", "/en/merchant/register");
  });

  test("an old ?as=merchant link still opens the page, and only carries its hint to the forgot and sign-up pages", async ({ page }) => {
    await go(page, "/en/sign-in?as=merchant");
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/en/forgot-password?as=merchant");
    await expect(page.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/en/sign-up?as=merchant");
  });

  test("Arabic page is right-to-left with Arabic text", async ({ page }) => {
    await go(page, "/ar/sign-in");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1, name: "تسجيل الدخول" })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "أرسل لي رابط دخول (للعملاء)" })).toBeVisible();
    await expect(page.getByRole("link", { name: "قدّم طلبًا كتاجر" })).toHaveAttribute("href", "/ar/merchant/register");
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

  test("merchant signs in (active) through the same form and lands on the portal", async ({ page }) => {
    await go(page, "/en/sign-in");
    await page.locator('input[name="email"]').fill(ACCOUNTS.merchant.email);
    await page.locator('input[name="password"]').fill(ACCOUNTS.merchant.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/merchant$/);
  });

  test("a pending merchant can sign in too", async ({ page }) => {
    await go(page, "/en/sign-in?next=/en/merchant/settings");
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
    await page.getByRole("button", { name: "Email me a sign-in link (customers)" }).click();
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
    await page.request.post("/store/v1/auth/magic-link", { headers: { "X-Turnstile-Token": DEV_TURNSTILE_TOKEN }, data: { email } });
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
    await expect(page).toHaveURL(/\/en\/sign-in/);
    await expect(page.getByRole("radio")).toHaveCount(0); // one form: the merchant signs in on it like everyone
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

    await go(page, "/en/sign-in");
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
    await code.fill(totp(secret, Date.now(), 1));
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
    await page.request.post("/store/v1/auth/magic-link", { headers: { "X-Turnstile-Token": DEV_TURNSTILE_TOKEN }, data: { email } });
    const link = await waitForLink(page, email, /\/sign-in\?token=/);
    expect((await page.request.post("/store/v1/auth/verify", { data: { token: new URL(link, "http://x").searchParams.get("token") } })).status()).toBe(200);
    await page.context().clearCookies();

    const temporaryPassword = await temporaryCustomerPassword(await customerIdByEmail(email));

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
    const again = await page.request.post("/store/v1/auth/login", { headers: { "X-Turnstile-Token": DEV_TURNSTILE_TOKEN }, data: { email, password: chosen } });
    expect((await again.json()).next).toBe("done");
  });
});
