// The smart sign-in (plan F10, BH §5.1 and §6): ONE form on `POST /client/auth/sign-in` for customers and merchants, the
// password step of a temporary password for both kinds, Turnstile on merchant register and forgot password, and the
// sign-up language of a merchant. Runs against the isolated demo backend (:3100) and Mailpit (:8025) only.
// Rules (F03): the sign-in limit is 5 attempts per email and IP in 15 minutes and the smart route charges BOTH old counters,
// so every failure test uses a throwaway email (never a shared demo account); accounts that change data are throwaway;
// staff calls (temporary passwords) go straight to the API through e2e/admin.ts.
import type { Page } from "@playwright/test";
import { customerIdByEmail, merchantIdByEmail, temporaryCustomerPassword, temporaryMerchantPassword, totp } from "./admin";
import { expect, test } from "./fixtures";
import { ACCOUNTS, DEV_TURNSTILE_TOKEN, FRESH_MERCHANT_PASSWORD, freshCustomer, freshMerchant, go, signInMerchant, stubTurnstile, uniqueEmail } from "./helpers";

const SIGN_IN_PATH = "/client/auth/sign-in";
const WRONG = "The email or password is incorrect.";
const SIGNUP_MARKER_KEY = "gsm.merchant.signup-locale";
/** Strong enough for the API's password rules, and not a part of any name or email used here. */
const CHOSEN = "Willow-Anchor-7304";

const isPost = (path: string) => (request: { method(): string; url(): string }) => request.method() === "POST" && new URL(request.url()).pathname === path;

async function fillAndSubmit(page: Page, email: string, password: string) {
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** The Turnstile stub of helpers.ts that also counts how often the widget was rendered and asked for a new token. */
async function countingTurnstile(page: Page) {
  await page.route("**/challenges.cloudflare.com/turnstile/v0/api.js*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `var w={};window.__ts={renders:0,resets:0};window.turnstile={render:function(el,o){var id="w"+Math.random();w[id]=o;window.__ts.renders++;setTimeout(function(){o.callback("${DEV_TURNSTILE_TOKEN}")},30);return id},reset:function(id){var o=w[id];window.__ts.resets++;if(o)setTimeout(function(){o.callback("${DEV_TURNSTILE_TOKEN}")},30)},remove:function(id){delete w[id]}};`,
    }),
  );
}
/** Null-safe: the stub script loads lazily after hydration, so `window.__ts` can still be missing right after `go()`. */
const widgetCounts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __ts?: { renders: number; resets: number } }).__ts ?? { renders: 0, resets: 0 });
const widgetResets = async (page: Page) => (await widgetCounts(page)).resets;

async function cookieNames(page: Page): Promise<string[]> {
  return (await page.context().cookies()).map((cookie) => cookie.name);
}

test.beforeEach(async ({ page }) => stubTurnstile(page));

test.describe("one form", () => {
  test("there is no account-type choice, and the email-link option stays one click away", async ({ page }) => {
    await go(page, "/en/sign-in");
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByText("One form for customers and merchants.")).toBeVisible();
    const magic = page.getByRole("button", { name: "Email me a sign-in link (customers)" });
    await expect(magic).toBeVisible();
    await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Apply as a merchant" })).toBeVisible();

    await magic.click();
    await expect(page.getByRole("button", { name: "Email me the link" })).toBeVisible();
    await page.getByRole("button", { name: "Use my password instead" }).click();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(magic).toBeVisible();
  });

  test("the request goes to /client/auth/sign-in with the Turnstile token and no CSRF header; a customer lands on the account", async ({ page }) => {
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") posts.push(new URL(request.url()).pathname);
    });
    await go(page, "/en/sign-in");
    const sent = page.waitForRequest(isPost(SIGN_IN_PATH));
    await fillAndSubmit(page, ACCOUNTS.customer.email, ACCOUNTS.customer.password);
    const request = await sent;
    expect(request.headers()["x-turnstile-token"]).toBe(DEV_TURNSTILE_TOKEN);
    expect(request.headers()["x-csrf-token"]).toBeUndefined();
    expect(request.postDataJSON()).toEqual({ email: ACCOUNTS.customer.email, password: ACCOUNTS.customer.password });
    await expect(page).toHaveURL(/\/en\/account$/);
    expect(posts).not.toContain("/store/v1/auth/login");
    expect(posts).not.toContain("/client/auth/login");
    // The answer's CSRF token belongs to the customer surface only.
    const names = await cookieNames(page);
    expect(names).toContain("csrf_token_store");
    expect(names).not.toContain("csrf_token_client");
  });

  test("the demo merchant lands on the portal, with the merchant token only", async ({ page }) => {
    await go(page, "/en/sign-in");
    await fillAndSubmit(page, ACCOUNTS.merchant.email, ACCOUNTS.merchant.password);
    await expect(page).toHaveURL(/\/en\/merchant$/);
    const names = await cookieNames(page);
    expect(names).toContain("csrf_token_client");
    expect(names).not.toContain("csrf_token_store");
  });

  test("a merchant who waits for approval lands on the portal too", async ({ page }) => {
    await go(page, "/en/sign-in");
    await fillAndSubmit(page, ACCOUNTS.pendingMerchant.email, ACCOUNTS.pendingMerchant.password);
    await expect(page).toHaveURL(/\/en\/merchant$/);
    expect((await page.request.get("/client/auth/me")).status()).toBe(200);
  });

  test("a customer signing in beside a merchant session keeps both sessions, each with its own token", async ({ page }) => {
    await signInMerchant(page);
    await go(page, "/en/sign-in");
    await fillAndSubmit(page, ACCOUNTS.customer.email, ACCOUNTS.customer.password);
    await expect(page).toHaveURL(/\/en\/account$/);
    expect((await page.request.get("/client/auth/me")).status()).toBe(200);
    expect((await page.request.get("/store/v1/me")).status()).toBe(200);
    const cookies = await page.context().cookies();
    const client = cookies.find((cookie) => cookie.name === "csrf_token_client")?.value;
    const store = cookies.find((cookie) => cookie.name === "csrf_token_store")?.value;
    expect(client).toBeTruthy();
    expect(store).toBeTruthy();
    expect(client).not.toBe(store);
  });
});

test.describe("where it lands (?next=)", () => {
  test("a customer who followed a portal link lands on the account, not the portal", async ({ page }) => {
    await go(page, "/en/sign-in?next=/en/merchant/orders");
    await fillAndSubmit(page, ACCOUNTS.customer.email, ACCOUNTS.customer.password);
    await expect(page).toHaveURL(/\/en\/account$/);
  });

  test("a merchant who followed an account link lands on the portal", async ({ page }) => {
    await go(page, "/en/sign-in?next=/en/account/orders");
    await fillAndSubmit(page, ACCOUNTS.merchant.email, ACCOUNTS.merchant.password);
    await expect(page).toHaveURL(/\/en\/merchant$/);
  });

  test("a merchant keeps a portal path", async ({ page }) => {
    await go(page, "/en/sign-in?as=merchant&next=/en/merchant/orders");
    await fillAndSubmit(page, ACCOUNTS.merchant.email, ACCOUNTS.merchant.password);
    await expect(page).toHaveURL(/\/en\/merchant\/orders$/);
  });

  test("an address on another site is ignored", async ({ page }) => {
    await go(page, "/en/sign-in?next=https://evil.example/en/merchant");
    await fillAndSubmit(page, ACCOUNTS.customer.email, ACCOUNTS.customer.password);
    await expect(page).toHaveURL(/\/en\/account$/);
  });
});

test.describe("errors", () => {
  test("a wrong password and an unknown email show the same sentence", async ({ page }) => {
    const email = await freshCustomer(page, CHOSEN);
    await page.context().clearCookies();
    const attempt = async (address: string) => {
      await go(page, "/en/sign-in");
      await fillAndSubmit(page, address, "definitely-wrong-123");
      const alert = page.getByRole("alert").filter({ hasText: WRONG });
      await expect(alert).toBeVisible();
      await expect(page).toHaveURL(/\/en\/sign-in/);
      return (await alert.innerText()).trim();
    };
    const unknown = await attempt(uniqueEmail("nobody"));
    const wrongPassword = await attempt(email);
    expect(unknown).toBe(WRONG);
    expect(wrongPassword).toBe(unknown);
  });

  test("every submit asks the widget for a fresh token", async ({ page }) => {
    await countingTurnstile(page); // registered last, so it answers instead of the plain stub
    const tokens: (string | undefined)[] = [];
    page.on("request", (request) => {
      if (isPost(SIGN_IN_PATH)(request)) tokens.push(request.headers()["x-turnstile-token"]);
    });
    await go(page, "/en/sign-in");
    await expect.poll(() => widgetCounts(page)).toEqual({ renders: 1, resets: 0 });
    const alert = page.getByRole("alert").filter({ hasText: WRONG });

    await fillAndSubmit(page, uniqueEmail("nobody"), "wrong-pass-1111");
    await expect(alert).toBeVisible();
    await expect.poll(() => widgetResets(page)).toBe(1);

    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect.poll(() => tokens.length).toBe(2);
    await expect(alert).toBeVisible();
    await expect.poll(() => widgetResets(page)).toBe(2);
    expect(tokens).toEqual([DEV_TURNSTILE_TOKEN, DEV_TURNSTILE_TOKEN]);
  });

  test("403 TURNSTILE_FAILED shows its text and asks the widget for a new token", async ({ page }) => {
    await countingTurnstile(page);
    await page.route(`**${SIGN_IN_PATH}`, (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/problem+json",
        body: JSON.stringify({ type: "about:blank", title: "Turnstile failed", status: 403, code: "TURNSTILE_FAILED", requestId: "req-turnstile" }),
      }),
    );
    await go(page, "/en/sign-in");
    await fillAndSubmit(page, uniqueEmail("nobody"), "wrong-pass-1111");
    await expect(page.getByRole("alert").filter({ hasText: "The anti-bot check failed." })).toBeVisible();
    await expect.poll(() => widgetResets(page)).toBe(1);
  });

  test("a 429 with Retry-After: 900 shows the wait in minutes", async ({ page }) => {
    await page.route(`**${SIGN_IN_PATH}`, (route) =>
      route.fulfill({
        status: 429,
        headers: { "Retry-After": "900" },
        contentType: "application/problem+json",
        body: JSON.stringify({ type: "about:blank", title: "Too many requests", status: 429, code: "RATE_LIMITED", requestId: "req-limit" }),
      }),
    );
    await go(page, "/en/sign-in");
    await fillAndSubmit(page, uniqueEmail("nobody"), "wrong-pass-1111");
    const alert = page.getByRole("alert").filter({ hasText: "Too many attempts." });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("about 15 min");
    await expect(page).toHaveURL(/\/en\/sign-in/);
  });

  test("empty fields are caught before any request", async ({ page }) => {
    const sent: string[] = [];
    page.on("request", (request) => {
      if (isPost(SIGN_IN_PATH)(request)) sent.push(request.url());
    });
    await go(page, "/en/sign-in");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator('input[name="email"]')).toBeFocused();
    await expect(page.locator('input[name="email"]')).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator('input[name="password"]')).toHaveAttribute("aria-invalid", "true");
    expect(sent).toEqual([]);
  });
});

test.describe("temporary password", () => {
  test("a merchant chooses their own password, then lands in the portal", async ({ page }) => {
    const { email } = await freshMerchant(page);
    const temporary = await temporaryMerchantPassword(await merchantIdByEmail(email));
    await go(page, "/en/sign-in");
    await fillAndSubmit(page, email, temporary);
    await expect(page.getByRole("heading", { level: 2, name: "Choose your own password" })).toBeVisible();
    await expect(page).toHaveURL(/\/en\/sign-in/); // not signed in yet: the pending session only allows this step
    const choose = page.getByRole("button", { name: "Save and continue" });
    const first = page.locator('input[name="newPassword"]');
    const confirm = page.locator('input[name="confirmPassword"]');

    // Two different passwords are caught on the second field, before any request.
    await first.fill(CHOSEN);
    await confirm.fill("not-the-same-1");
    await choose.click();
    await expect(page.getByText("The two passwords do not match.")).toBeVisible();

    // A weak password is refused on the field (422 WEAK_PASSWORD on `password`)...
    for (const weak of ["password123", temporary]) {
      await first.fill(weak);
      await confirm.fill(weak);
      const refused = page.waitForResponse((response) => new URL(response.url()).pathname === "/client/auth/password/change");
      await choose.click();
      expect((await refused).status()).toBe(422);
      await expect(first).toHaveAttribute("aria-invalid", "true");
      await expect(page.getByText(/Use 10–128 characters/)).toBeVisible();
    }

    // ...and a good one finishes the sign-in.
    await first.fill(CHOSEN);
    await confirm.fill(CHOSEN);
    await choose.click();
    await expect(page).toHaveURL(/\/en\/merchant$/);
    const me = await page.request.get("/client/auth/me");
    expect(me.status()).toBe(200);
    expect(((await me.json()) as { mustChangePassword: boolean }).mustChangePassword).toBe(false);

    // The chosen password works through the same form.
    await page.context().clearCookies();
    await go(page, "/en/sign-in");
    await fillAndSubmit(page, email, CHOSEN);
    await expect(page).toHaveURL(/\/en\/merchant$/);
  });

  test("with two-step verification on, the code step follows the password step", async ({ page }) => {
    const { email, password } = await freshMerchant(page);
    const csrf = await signInMerchant(page, { email, password });
    const setup = await page.request.post("/client/security/2fa/setup", { headers: { "X-CSRF-Token": csrf } });
    expect(setup.status(), await setup.text()).toBe(200);
    const { secret } = (await setup.json()) as { secret: string };
    const enabled = await page.request.post("/client/security/2fa/enable", { headers: { "X-CSRF-Token": csrf }, data: { code: totp(secret) } });
    expect(enabled.status(), await enabled.text()).toBe(204);
    await page.context().clearCookies();

    const temporary = await temporaryMerchantPassword(await merchantIdByEmail(email));
    await go(page, "/en/sign-in");
    await fillAndSubmit(page, email, temporary);
    await expect(page.getByRole("heading", { level: 2, name: "Choose your own password" })).toBeVisible();
    await page.locator('input[name="newPassword"]').fill(CHOSEN);
    await page.locator('input[name="confirmPassword"]').fill(CHOSEN);
    await page.getByRole("button", { name: "Save and continue" }).click();

    await expect(page.getByRole("heading", { level: 2, name: "Two-step verification" })).toBeVisible();
    await expect(page).toHaveURL(/\/en\/sign-in/);
    const code = page.locator('input[name="code"]');
    await code.fill("000000");
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(page.getByText("That code is not right.")).toBeVisible(); // 422 on `code`: no sign-out
    // The code of the next 30-second step is accepted (one step either side) and was not used by the enable call above.
    await code.fill(totp(secret, Date.now(), 1));
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(page).toHaveURL(/\/en\/merchant$/);
    expect((await page.request.get("/client/auth/me")).status()).toBe(200);
  });

  test("a customer with a temporary password chooses their own through the same form", async ({ page }) => {
    const email = await freshCustomer(page);
    const temporary = await temporaryCustomerPassword(await customerIdByEmail(email));
    await page.context().clearCookies();
    await go(page, "/en/sign-in");
    await fillAndSubmit(page, email, temporary);
    await expect(page.getByRole("heading", { level: 2, name: "Choose your own password" })).toBeVisible();
    await expect(page).toHaveURL(/\/en\/sign-in/);

    await page.locator('input[name="newPassword"]').fill("password123");
    await page.locator('input[name="confirmPassword"]').fill("password123");
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page.locator('input[name="newPassword"]')).toHaveAttribute("aria-invalid", "true");

    await page.locator('input[name="newPassword"]').fill(CHOSEN);
    await page.locator('input[name="confirmPassword"]').fill(CHOSEN);
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
    expect((await page.request.get("/store/v1/me")).status()).toBe(200);
    expect(await cookieNames(page)).not.toContain("csrf_token_client");
  });
});

test.describe("Turnstile on the other merchant routes", () => {
  test("merchant register, merchant forgot password and customer forgot password carry x-turnstile-token", async ({ page }) => {
    const registerEmail = uniqueEmail("merchant");
    await go(page, "/en/merchant/register");
    await page.locator('input[name="name"]').fill("Test Merchant");
    await page.locator('input[name="email"]').fill(registerEmail);
    await page.locator('input[name="password"]').fill(FRESH_MERCHANT_PASSWORD);
    await page.locator('select[name="country"]').selectOption("JO");
    const register = page.waitForRequest(isPost("/client/auth/register"));
    await page.getByRole("button", { name: "Submit application" }).click();
    expect((await register).headers()["x-turnstile-token"]).toBe(DEV_TURNSTILE_TOKEN);
    await expect(page.getByText("Check your email")).toBeVisible();

    await go(page, "/en/forgot-password?as=merchant");
    await page.locator('input[name="email"]').fill(registerEmail);
    const merchantForgot = page.waitForRequest(isPost("/client/auth/password/forgot"));
    await page.getByRole("button", { name: "Email me a reset link" }).click();
    expect((await merchantForgot).headers()["x-turnstile-token"]).toBe(DEV_TURNSTILE_TOKEN);
    await expect(page.getByText(`If an account exists for ${registerEmail}`)).toBeVisible();

    await go(page, "/en/forgot-password");
    await page.locator('input[name="email"]').fill(uniqueEmail("nobody"));
    const customerForgot = page.waitForRequest(isPost("/store/v1/auth/password/forgot"));
    await page.getByRole("button", { name: "Email me a reset link" }).click();
    expect((await customerForgot).headers()["x-turnstile-token"]).toBe(DEV_TURNSTILE_TOKEN);
  });

  test("the register and forgot forms ask the widget for a new token after every submit", async ({ page }) => {
    await countingTurnstile(page);
    const turnstileFailed = { status: 403, contentType: "application/problem+json", body: JSON.stringify({ type: "about:blank", title: "Turnstile failed", status: 403, code: "TURNSTILE_FAILED", requestId: "req-turnstile" }) };

    // Forgot (merchant): a refused submit keeps the form, and the same widget is asked for a new token.
    await page.route("**/client/auth/password/forgot", (route) => route.fulfill(turnstileFailed), { times: 1 });
    await go(page, "/en/forgot-password?as=merchant");
    await expect.poll(() => widgetCounts(page)).toEqual({ renders: 1, resets: 0 });
    await page.locator('input[name="email"]').fill(uniqueEmail("nobody"));
    const send = page.getByRole("button", { name: "Email me a reset link" });
    await send.click();
    await expect(page.getByRole("alert").filter({ hasText: "The anti-bot check failed." })).toBeVisible();
    await expect.poll(async () => (await widgetCounts(page)).resets).toBe(1);
    // The next submit carries the new token; a success replaces the form, so the spent widget goes with it...
    const sent = page.waitForRequest(isPost("/client/auth/password/forgot"));
    await send.click();
    expect((await sent).headers()["x-turnstile-token"]).toBe(DEV_TURNSTILE_TOKEN);
    await expect(page.getByText(/If an account exists for/)).toBeVisible();
    // ...and the form that comes back renders a new one.
    await page.getByRole("button", { name: "Use a different email" }).click();
    await expect.poll(async () => (await widgetCounts(page)).renders).toBe(2);

    // Register: the same after a refused submit.
    await page.route("**/client/auth/register", (route) => route.fulfill(turnstileFailed), { times: 1 });
    await go(page, "/en/merchant/register");
    await page.locator('input[name="name"]').fill("Test Merchant");
    await page.locator('input[name="email"]').fill(uniqueEmail("merchant"));
    await page.locator('input[name="password"]').fill(FRESH_MERCHANT_PASSWORD);
    await page.locator('select[name="country"]').selectOption("JO");
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "The anti-bot check failed." })).toBeVisible();
    await expect.poll(async () => (await widgetCounts(page)).resets).toBe(1);
    const registered = page.waitForRequest(isPost("/client/auth/register"));
    await page.getByRole("button", { name: "Submit application" }).click();
    expect((await registered).headers()["x-turnstile-token"]).toBe(DEV_TURNSTILE_TOKEN);
    await expect(page.getByText("Check your email")).toBeVisible();
  });
});

test.describe("sign-up language of a merchant", () => {
  test("an Arabic sign-up leaves a marker without the email; the first sign-in saves the language and uses the marker up", async ({ page }) => {
    const email = uniqueEmail("merchant-ar");
    await go(page, "/ar/merchant/register");
    await page.locator('input[name="name"]').fill("تاجر تجريبي");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(FRESH_MERCHANT_PASSWORD);
    await page.locator('select[name="country"]').selectOption("JO");
    await page.getByRole("button", { name: "أرسل الطلب" }).click();
    await expect(page.getByText("تحقّق من بريدك الإلكتروني").first()).toBeVisible();

    const marker = await page.evaluate((key) => localStorage.getItem(key), SIGNUP_MARKER_KEY);
    expect(marker).not.toBeNull();
    expect(marker).not.toContain(email);
    expect(JSON.parse(marker!)).toEqual({ locale: "ar", at: expect.any(Number) });

    await go(page, "/ar/sign-in");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(FRESH_MERCHANT_PASSWORD);
    await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
    await expect(page).toHaveURL(/\/ar\/merchant$/);

    const me = await page.request.get("/client/auth/me");
    expect(((await me.json()) as { locale: string }).locale).toBe("ar");
    expect(await page.evaluate((key) => localStorage.getItem(key), SIGNUP_MARKER_KEY)).toBeNull();
  });

  test("signing in on the Arabic page never changes the language of an account that has no marker", async ({ page }) => {
    const { email, password } = await freshMerchant(page);
    await go(page, "/ar/sign-in");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
    await expect(page).toHaveURL(/\/ar\/merchant$/);
    const me = await page.request.get("/client/auth/me");
    expect(((await me.json()) as { locale: string }).locale).toBe("en");
  });

  test("an English sign-up clears an older Arabic marker", async ({ page }) => {
    await go(page, "/en/merchant/register");
    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ locale: "ar", at: Date.now() })), SIGNUP_MARKER_KEY);
    await page.locator('input[name="name"]').fill("Test Merchant");
    await page.locator('input[name="email"]').fill(uniqueEmail("merchant-en"));
    await page.locator('input[name="password"]').fill(FRESH_MERCHANT_PASSWORD);
    await page.locator('select[name="country"]').selectOption("JO");
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect(page.getByText("Check your email")).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), SIGNUP_MARKER_KEY)).toBeNull();
  });
});
