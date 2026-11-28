// The sign-in form (renamed from the old smart sign-in spec): ONE form on `POST /client/auth/sign-in` for every account, the password
// step of a temporary password, the code step of two-step sign-in for both ranks, the email link with two-step on, and Turnstile
// on the forgot-password form. Nothing on these pages asks for an account type: the answer's `next` is the only thing that
// decides the next step, and one account area is where everyone lands.
// Runs against the isolated demo backend (:3100) and Mailpit (:8025) only.
// Rules (F03): the sign-in limit is 5 attempts per email and IP in 15 minutes, so every failure test uses a throwaway email (never a
// shared demo account); accounts that change data are throwaway; staff calls (temporary passwords) go straight to the API
// through e2e/admin.ts.
import type { Page } from "@playwright/test";
import { temporaryPassword, totp } from "./admin";
import { expect, test } from "./fixtures";
import {
  ACCOUNTS,
  DEV_TURNSTILE_TOKEN,
  SIGN_IN_LINK,
  freshAccount,
  go,
  signIn,
  stubTurnstile,
  tokenOf,
  uniqueEmail,
  waitForLink,
  type FreshAccount,
} from "./helpers";
import { FAMILY_ROUTES } from "../lib/account/routes";

const SIGN_IN_PATH = "/client/auth/sign-in";
const WRONG = "The email or password is incorrect.";
/** Strong enough for the API's password rules, and not a part of any name or email used here. */
const CHOSEN = "Willow-Anchor-7304";

const isPost = (path: string) => (request: { method(): string; url(): string }) =>
  request.method() === "POST" && new URL(request.url()).pathname === path;

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

/** The two-step routes of an account's family (a retail account keeps them on the shop routes, a merchant rank on the portal's). */
const twoStepRoutes = (account: FreshAccount) => FAMILY_ROUTES[account.rank === "merchant" ? "client" : "store"].twoFactor;

/** Turns two-step sign-in on for an account (it signs in through the API for that) and signs the page out again. @returns the secret */
async function enableTwoStep(page: Page, account: FreshAccount): Promise<string> {
  const csrf = await signIn(page, account);
  const routes = twoStepRoutes(account);
  const setup = await page.request.post(routes.setup, { headers: { "X-CSRF-Token": csrf } });
  expect(setup.status(), await setup.text()).toBe(200);
  const { secret } = (await setup.json()) as { secret: string };
  const enabled = await page.request.post(routes.enable, { headers: { "X-CSRF-Token": csrf }, data: { code: totp(secret) } });
  expect(enabled.status(), await enabled.text()).toBe(204);
  await page.context().clearCookies();
  return secret;
}

/** The code step: a short code is caught before any request, a wrong one is a field error, then a good one finishes the sign-in. */
async function passCodeStep(page: Page, secret: string) {
  await expect(page.getByRole("heading", { level: 2, name: "Two-step verification" })).toBeVisible();
  await expect(page).toHaveURL(/\/en\/sign-in/);
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
  // The code of the next 30-second step is accepted (one step either side) and was not used by the enable call.
  await code.fill(totp(secret, Date.now(), 1));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
}

test.beforeEach(async ({ page }) => stubTurnstile(page));

test.describe("one form", () => {
  test("there is no account-type choice, and the email-link option stays one click away", async ({ page }) => {
    await go(page, "/en/sign-in");
    await expect(page.getByRole("radio")).toHaveCount(0);
    const magic = page.getByRole("button", { name: "Email me a sign-in link" });
    await expect(magic).toBeVisible();
    await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create an account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Need merchant prices?" })).toBeVisible();

    await magic.click();
    await expect(page.getByRole("button", { name: "Email me the link" })).toBeVisible();
    await page.getByRole("button", { name: "Use my password instead" }).click();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(magic).toBeVisible();
  });

  test("the request goes to /client/auth/sign-in with the Turnstile token and no CSRF header; a retail account lands on the account", async ({
    page,
  }) => {
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") posts.push(new URL(request.url()).pathname);
    });
    await go(page, "/en/sign-in");
    const sent = page.waitForRequest(isPost(SIGN_IN_PATH));
    await fillAndSubmit(page, ACCOUNTS.retail.email, ACCOUNTS.retail.password);
    const request = await sent;
    expect(request.headers()["x-turnstile-token"]).toBe(DEV_TURNSTILE_TOKEN);
    expect(request.headers()["x-csrf-token"]).toBeUndefined();
    expect(request.postDataJSON()).toEqual({ email: ACCOUNTS.retail.email, password: ACCOUNTS.retail.password });
    await expect(page).toHaveURL(/\/en\/account$/);
    expect(posts).not.toContain("/store/v1/auth/login");
    expect(posts).not.toContain("/client/auth/login");
    // The session belongs to the account: the shop's own "me" route answers for a retail rank.
    const me = await page.request.get("/store/v1/me");
    expect(me.status()).toBe(200);
    expect(((await me.json()) as { rank: { kind: string } }).rank.kind).toBe("retail");
  });

  test("the demo merchant signs in on the same form and lands on the same account area", async ({ page }) => {
    await go(page, "/en/sign-in");
    await fillAndSubmit(page, ACCOUNTS.merchant.email, ACCOUNTS.merchant.password);
    await expect(page).toHaveURL(/\/en\/account$/);
    const me = await page.request.get("/client/auth/me");
    expect(me.status()).toBe(200);
    expect(((await me.json()) as { rank: { kind: string } }).rank.kind).toBe("merchant");
  });

  test("a suspended merchant rank is refused with its own sentence and stays on the form", async ({ page }) => {
    const account = await freshAccount(page, { rank: "merchant", suspended: true });
    await go(page, "/en/sign-in");
    await fillAndSubmit(page, account.email, account.password);
    await expect(page.getByRole("alert").filter({ hasText: "This account cannot be used right now." })).toBeVisible();
    await expect(page).toHaveURL(/\/en\/sign-in/);
  });
});

test.describe("where it lands (?next=)", () => {
  test("a visitor who followed an old portal link lands on the page that replaced it", async ({ page }) => {
    await go(page, "/en/sign-in?next=/en/merchant/orders");
    await fillAndSubmit(page, ACCOUNTS.merchant.email, ACCOUNTS.merchant.password);
    await expect(page).toHaveURL(/\/en\/account\/orders$/);
  });

  test("a merchant rank keeps an account path", async ({ page }) => {
    await go(page, "/en/sign-in?next=/en/account/orders");
    await fillAndSubmit(page, ACCOUNTS.merchant.email, ACCOUNTS.merchant.password);
    await expect(page).toHaveURL(/\/en\/account\/orders$/);
  });

  test("a retail account keeps an account path", async ({ page }) => {
    await go(page, "/en/sign-in?next=/en/account/orders");
    await fillAndSubmit(page, ACCOUNTS.retail.email, ACCOUNTS.retail.password);
    await expect(page).toHaveURL(/\/en\/account\/orders$/);
  });

  test("an address on another site is ignored", async ({ page }) => {
    await go(page, "/en/sign-in?next=https://evil.example/en/merchant");
    await fillAndSubmit(page, ACCOUNTS.retail.email, ACCOUNTS.retail.password);
    await expect(page).toHaveURL(/\/en\/account$/);
  });
});

test.describe("errors", () => {
  test("a wrong password and an unknown email show the same sentence", async ({ page }) => {
    const { email } = await freshAccount(page);
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
        body: JSON.stringify({
          type: "about:blank",
          title: "Turnstile failed",
          status: 403,
          code: "TURNSTILE_FAILED",
          requestId: "req-turnstile",
        }),
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
        body: JSON.stringify({
          type: "about:blank",
          title: "Too many requests",
          status: 429,
          code: "RATE_LIMITED",
          requestId: "req-limit",
        }),
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
  test("a merchant rank chooses their own password with one request, then lands on the account", async ({ page }) => {
    const { email, id } = await freshAccount(page, { rank: "merchant" });
    const temporary = await temporaryPassword(id);
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

    // ...and a good one finishes the sign-in; the body holds the new password and nothing else.
    await first.fill(CHOSEN);
    await confirm.fill(CHOSEN);
    const sent = page.waitForRequest(isPost("/client/auth/password/change"));
    await choose.click();
    expect((await sent).postDataJSON()).toEqual({ password: CHOSEN });
    await expect(page).toHaveURL(/\/en\/account$/);
    const me = await page.request.get("/client/auth/me");
    expect(me.status()).toBe(200);
    expect(((await me.json()) as { mustChangePassword: boolean }).mustChangePassword).toBe(false);

    // The chosen password works through the same form.
    await page.context().clearCookies();
    await go(page, "/en/sign-in");
    await fillAndSubmit(page, email, CHOSEN);
    await expect(page).toHaveURL(/\/en\/account$/);
  });

  test("a retail account chooses their own through the same form", async ({ page }) => {
    const { email, id } = await freshAccount(page);
    const temporary = await temporaryPassword(id);
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
    const me = await page.request.get("/store/v1/me");
    expect(me.status()).toBe(200);
    expect(((await me.json()) as { rank: { kind: string } }).rank.kind).toBe("retail");
  });
});

test.describe("two-step sign-in", () => {
  for (const rank of ["merchant", "retail"] as const) {
    test(`a ${rank} account: the code step follows the password step`, async ({ page }) => {
      const account = await freshAccount(page, { rank });
      const secret = await enableTwoStep(page, account);
      await go(page, "/en/sign-in");
      await fillAndSubmit(page, account.email, account.password);
      await passCodeStep(page, secret);
      expect((await page.request.get(rank === "merchant" ? "/client/auth/me" : "/store/v1/me")).status()).toBe(200);
    });
  }

  test("a temporary password, then the new password, then the code", async ({ page }) => {
    const account = await freshAccount(page, { rank: "merchant" });
    const secret = await enableTwoStep(page, account);
    const temporary = await temporaryPassword(account.id);
    await go(page, "/en/sign-in");
    await fillAndSubmit(page, account.email, temporary);
    await expect(page.getByRole("heading", { level: 2, name: "Choose your own password" })).toBeVisible();
    await page.locator('input[name="newPassword"]').fill(CHOSEN);
    await page.locator('input[name="confirmPassword"]').fill(CHOSEN);
    await page.getByRole("button", { name: "Save and continue" }).click();
    await passCodeStep(page, secret);
    expect((await page.request.get("/client/auth/me")).status()).toBe(200);
  });

  test("a code that comes too late goes back to the form with its sentence", async ({ page }) => {
    const account = await freshAccount(page);
    await enableTwoStep(page, account);
    await go(page, "/en/sign-in");
    await fillAndSubmit(page, account.email, account.password);
    await expect(page.getByRole("heading", { level: 2, name: "Two-step verification" })).toBeVisible();
    // The pending session is gone (10 minutes passed): the code route answers 401.
    await page.route("**/client/auth/2fa", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/problem+json",
        body: JSON.stringify({
          type: "about:blank",
          title: "Unauthorized",
          status: 401,
          code: "UNAUTHORIZED",
          requestId: "req-expired",
        }),
      }),
    );
    await page.locator('input[name="code"]').fill("123456");
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Your sign-in expired. Start again." })).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test("the email link of a retail account with two-step on asks for the code", async ({ page }) => {
    const account = await freshAccount(page);
    const secret = await enableTwoStep(page, account);
    const asked = await page.request.post("/store/v1/auth/magic-link", {
      headers: { "X-Turnstile-Token": DEV_TURNSTILE_TOKEN },
      data: { email: account.email },
    });
    expect(asked.status(), await asked.text()).toBe(204);
    const link = await waitForLink(page, account.email, SIGN_IN_LINK);
    expect(tokenOf(link)).not.toBe("");

    await go(page, link);
    await page.getByRole("button", { name: "Sign in to IMEI-HUB" }).click();
    await passCodeStep(page, secret);
    expect((await page.request.get("/store/v1/me")).status()).toBe(200);
  });
});

test.describe("Turnstile on the forgot-password form", () => {
  test("one form for every account: it posts to the shared route with the Turnstile token and has no account-type switch", async ({
    page,
  }) => {
    await go(page, "/en/forgot-password");
    await expect(page.getByRole("radio")).toHaveCount(0);
    const email = uniqueEmail("nobody");
    await page.locator('input[name="email"]').fill(email);
    const forgot = page.waitForRequest(isPost("/client/auth/password/forgot"));
    await page.getByRole("button", { name: "Email me a reset link" }).click();
    const request = await forgot;
    expect(request.headers()["x-turnstile-token"]).toBe(DEV_TURNSTILE_TOKEN);
    expect(request.postDataJSON()).toEqual({ email });
    await expect(page.getByText(`If an account exists for ${email}`)).toBeVisible();
  });

  test("the forgot form asks the widget for a new token after every submit", async ({ page }) => {
    await countingTurnstile(page);
    const turnstileFailed = {
      status: 403,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "about:blank",
        title: "Turnstile failed",
        status: 403,
        code: "TURNSTILE_FAILED",
        requestId: "req-turnstile",
      }),
    };

    // A refused submit keeps the form, and the same widget is asked for a new token.
    await page.route("**/client/auth/password/forgot", (route) => route.fulfill(turnstileFailed), { times: 1 });
    await go(page, "/en/forgot-password");
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
  });
});
