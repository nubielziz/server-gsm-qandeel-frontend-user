// Sign-in, sign-up and the email-link pages against the isolated demo backend (:3100) and Mailpit (:8025).
// Rules this file keeps (rate limits are real, handoff §3.9): wrong passwords only with throwaway emails, the shared demo
// accounts are never changed (passwords, settings): lifecycle tests create their own accounts.
// There is one kind of account: the sign-in page is ONE form for every rank and nothing on these pages asks who the visitor is.
// The sign-in specifics (request shape, tokens, temporary passwords, two-step) live in e2e/sign-in.spec.ts.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { accountIdByEmail, createAccount, temporaryPassword } from "./admin";
import {
  chooseCountry,
  countryField,
  ACCOUNTS,
  BASE_URL,
  DEV_TURNSTILE_TOKEN,
  SET_PASSWORD_LINK,
  SIGN_IN_LINK,
  VERIFY_EMAIL_LINK,
  freshAccount,
  go,
  latestMailTo,
  openAnotherBrowser,
  signIn,
  signUpInAnotherBrowser,
  stubTurnstile,
  tokenOf,
  uniqueEmail,
  waitForLink,
} from "./helpers";
import { siteEnv } from "./site-env";
import { displayWhatsAppNumber, normaliseWhatsAppNumber } from "../lib/contact/whatsapp";

const VERIFY_PATH = "/store/v1/auth/verify";
const CLAIM_BOX = "Add the orders I placed as a guest with this email";
const isVerify = (request: { method(): string; url(): string }) =>
  request.method() === "POST" && new URL(request.url()).pathname === VERIFY_PATH;

/** Asks for the sign-in link of an address that HAS an account (the call the "Email me the link" button makes). */
async function askForLink(page: Page, email: string): Promise<void> {
  const asked = await page.request.post("/store/v1/auth/magic-link", { headers: { "X-Turnstile-Token": DEV_TURNSTILE_TOKEN }, data: { email } });
  expect(asked.status(), await asked.text()).toBe(204);
}

test.describe("sign-in page", () => {
  test.beforeEach(async ({ page }) => stubTurnstile(page));

  test("one form for every account: no account-type choice, and every other way in is always shown", async ({ page }) => {
    await go(page, "/en/sign-in");
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/en/forgot-password");
    await expect(page.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/en/sign-up");
    await expect(page.getByRole("link", { name: "Need merchant prices?" })).toHaveAttribute("href", "/en/become-a-merchant");
  });

  test("an old ?as= value is ignored: the same form opens and its links carry no account type", async ({ page }) => {
    await go(page, "/en/sign-in?as=merchant");
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/en/forgot-password");
    await expect(page.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/en/sign-up");
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

  test("a retail account signs in with a password and lands on the account, then sees its orders", async ({ page }) => {
    await go(page, "/en/sign-in");
    await page.locator('input[name="email"]').fill(ACCOUNTS.retail.email);
    await page.locator('input[name="password"]').fill(ACCOUNTS.retail.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
    await expect(page.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();
    await go(page, "/en/account/orders"); // the rail is a drawer on phones: go straight to the page
    await expect(page).toHaveURL(/\/en\/account\/orders$/);
    await expect(page.getByRole("cell", { name: /SF-\d+$/ }).first()).toBeVisible();
  });

  test("a merchant rank signs in through the same form and lands on the same account area", async ({ page }) => {
    await go(page, "/en/sign-in");
    await page.locator('input[name="email"]').fill(ACCOUNTS.merchant.email);
    await page.locator('input[name="password"]').fill(ACCOUNTS.merchant.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
    const me = await page.request.get("/client/auth/me");
    expect(me.status()).toBe(200);
    expect(((await me.json()) as { rank: { kind: string } }).rank.kind).toBe("merchant");
  });

  test("?next= is honoured for same-site paths", async ({ page }) => {
    await go(page, "/en/sign-in?next=/en/account/orders");
    await page.locator('input[name="email"]').fill(ACCOUNTS.retail.email);
    await page.locator('input[name="password"]').fill(ACCOUNTS.retail.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account\/orders$/);
  });

  test("?next= with another site falls back to the account", async ({ page }) => {
    await go(page, "/en/sign-in?next=https://evil.example/en/account");
    await page.locator('input[name="email"]').fill(ACCOUNTS.retail.email);
    await page.locator('input[name="password"]').fill(ACCOUNTS.retail.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
  });

  test("an account page without a session sends the visitor to sign-in and back", async ({ page }) => {
    await go(page, "/en/account/orders");
    await expect(page).toHaveURL(/\/en\/sign-in\?next=%2Fen%2Faccount%2Forders$/);
    await page.locator('input[name="email"]').fill(ACCOUNTS.retail.email);
    await page.locator('input[name="password"]').fill(ACCOUNTS.retail.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account\/orders$/);
  });

  test("a suspended account cannot sign in and is told so", async ({ page }) => {
    const account = await freshAccount(page, { suspended: true });
    await go(page, "/en/sign-in");
    await page.locator('input[name="email"]').fill(account.email);
    await page.locator('input[name="password"]').fill(account.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "This account cannot be used right now." })).toBeVisible();
    await expect(page).toHaveURL(/\/en\/sign-in/);
  });
});

test.describe("email-link pages", () => {
  test.beforeEach(async ({ page }) => stubTurnstile(page));

  test("sign-in link: request, mail, button, signed in; the link works once", async ({ page }) => {
    // A link signs in an account that exists (staff made this one): it never makes an account.
    const { email } = await freshAccount(page);
    await go(page, "/en/sign-in");
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await page.locator('input[name="email"]').fill(email);
    await page.getByRole("button", { name: "Email me the link" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Check your email" })).toBeVisible();
    await expect(page.getByText(`a link is on its way to ${email}`)).toBeVisible();

    const link = await waitForLink(page, email, SIGN_IN_LINK);
    await go(page, link); // proxy.ts adds /en
    await expect(page).toHaveURL(/\/en\/sign-in\?token=/);
    // Never signs in by itself (mail scanners): a button does.
    await expect(page.getByRole("button", { name: "Sign in to IMEI-HUB" })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/en\/sign-in\?token=/);
    await page.getByRole("button", { name: "Sign in to IMEI-HUB" }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
    await expect(page.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();
    expect(((await (await page.request.get("/store/v1/me")).json()) as { email: string }).email).toBe(email);

    // Used up: a second visit says expired and offers a new link.
    await page.context().clearCookies();
    await go(page, link);
    await page.getByRole("button", { name: "Sign in to IMEI-HUB" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "This sign-in link has expired" })).toBeVisible();
    await page.getByRole("button", { name: "Request a new link" }).click();
    await expect(page.getByRole("button", { name: "Email me the link" })).toBeVisible();
  });

  test("the sign-in link page has the claim box ticked, and the box is what the exchange sends", async ({ page }) => {
    for (const ticked of [true, false]) {
      const { email } = await freshAccount(page); // an address with an account: it is what gets a sign-in link
      await askForLink(page, email);
      const link = await waitForLink(page, email, SIGN_IN_LINK);
      await page.context().clearCookies();
      await go(page, link);
      const box = page.getByRole("checkbox", { name: CLAIM_BOX });
      await expect(box).toBeChecked();
      if (!ticked) await box.uncheck();
      const sent = page.waitForRequest(isVerify);
      await page.getByRole("button", { name: "Sign in to IMEI-HUB" }).click();
      expect((await sent).postDataJSON()).toEqual({ token: tokenOf(link), claimGuestOrders: ticked });
      await expect(page).toHaveURL(/\/en\/account$/);
    }
  });

  test("what the claim did is told before the page goes on: orders added, or the busy line", async ({ page }) => {
    // The claim itself is the backend's (its own tests move real orders). Here the answer of the exchange is changed on its way
    // to the page, so the page's two lines can be read; the session cookies of the real answer are kept.
    const answers = [
      { patch: { claimedOrders: 2 }, line: "2 guest orders were added to your account." },
      { patch: { claimedOrders: 1 }, line: "1 guest order was added to your account." },
      {
        patch: { claimedOrders: 0, claimSkipped: "busy" },
        line: "Your guest orders could not be added just now. Ask for a new sign-in link later to try again.",
      },
    ];
    for (const { patch, line } of answers) {
      const { email } = await freshAccount(page);
      await askForLink(page, email);
      const link = await waitForLink(page, email, SIGN_IN_LINK);
      await page.context().clearCookies();
      await page.route(`**${VERIFY_PATH}`, async (route) => {
        const response = await route.fetch();
        await route.fulfill({ response, json: { ...((await response.json()) as object), ...patch } });
      });
      await go(page, link);
      await page.getByRole("button", { name: "Sign in to IMEI-HUB" }).click();
      await expect(page.getByText(line)).toBeVisible();
      await expect(page).toHaveURL(/\/en\/sign-in\?token=/); // the page waits for the person
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page).toHaveURL(/\/en\/account$/);
      await page.unroute(`**${VERIFY_PATH}`);
    }
  });

  test("sign-up: the full details get a link, and the link opened here signs the new retail account in with its password", async ({
    page,
  }) => {
    const email = uniqueEmail("signup");
    const password = "Orchard-Lantern-8841";
    await go(page, "/en/sign-up");
    await expect(page.getByRole("heading", { level: 1, name: "Create your account" })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0); // nothing to choose

    // Nothing is sent while a detail is missing: the sentences sit under the fields and the focus goes to the first one.
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.locator('input[name="firstName"]')).toBeFocused();
    await expect(page.getByText("This field is required.").first()).toBeVisible();

    await page.locator('input[name="firstName"]').fill("Sam");
    await page.locator('input[name="lastName"]').fill("Hamdan");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="phone"]').fill("+1 202 555 0100");
    const country = await chooseCountry(countryField(page)); // the first country of the list, whichever the demo shop offers
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(`a link is on its way to ${email}`)).toBeVisible();
    await expect(
      page.getByText("Open the link on this device to finish at once. On another device you will be asked to confirm your details."),
    ).toBeVisible();
    const link = await waitForLink(page, email, SIGN_IN_LINK);

    // This browser sent the form (it holds the asking cookie): the link makes the account and applies everything at once.
    await go(page, link);
    await page.getByRole("button", { name: "Sign in to IMEI-HUB" }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
    const me = (await (await page.request.get("/store/v1/me")).json()) as { email: string; name: string; phone: string; country: string; hasPassword: boolean; rank: { kind: string } };
    expect(me).toMatchObject({ email, name: "Sam Hamdan", phone: "+12025550100", country, hasPassword: true, rank: { kind: "retail" } });
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back, Sam Hamdan" })).toBeVisible();

    // The password of the form was set because the link was opened in the browser that filled the form.
    await page.context().clearCookies();
    await signIn(page, { email, password });
  });

  test("sign-up: a link opened in another browser signs in with nothing applied and asks to finish the account (details to confirm, a password to choose)", async ({
    page,
    browser,
  }) => {
    const email = uniqueEmail("other");
    const password = "Orchard-Lantern-8841";
    await go(page, "/en/sign-up");
    await page.locator('input[name="firstName"]').fill("Sam");
    await page.locator('input[name="lastName"]').fill("Hamdan");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="phone"]').fill("+1 202 555 0100");
    const country = await chooseCountry(countryField(page));
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(`a link is on its way to ${email}`)).toBeVisible();
    const link = await waitForLink(page, email, SIGN_IN_LINK);

    // The link is opened in ANOTHER browser (a context of its own: it never held the asking cookie), as a phone's mail app does.
    const phone = await openAnotherBrowser(browser);
    try {
      await go(phone, link);
      await phone.getByRole("button", { name: "Sign in to IMEI-HUB" }).click();

      // The page stops at the finish form: the details as typed, a password box that is empty.
      await expect(phone.getByRole("heading", { level: 2, name: "Finish creating your account" })).toBeVisible();
      await expect(phone.getByText("Check these details. If they are not yours, change them.")).toBeVisible();
      await expect(phone).toHaveURL(/\/en\/sign-in\?token=/);
      await expect(phone.locator('input[name="firstName"]')).toHaveValue("Sam");
      await expect(phone.locator('input[name="lastName"]')).toHaveValue("Hamdan");
      await expect(phone.locator('input[name="phone"]')).toHaveValue("+12025550100");
      await expect(phone.locator('select[name="country"]')).toHaveValue(country);
      await expect(phone.locator('input[name="password"]')).toHaveValue("");
      await expect(phone.locator('input[name="email"]')).toHaveCount(0);
      // The account is signed in and holds nothing of the form: no name, no phone, no password.
      const before = (await (await phone.request.get("/store/v1/me")).json()) as { email: string; name: string; phone: string; hasPassword: boolean };
      expect(before.email).toBe(email);
      expect(before.hasPassword).toBe(false);
      expect(before.name || "").toBe("");
      expect(before.phone || "").toBe("");

      // A weak password is refused under its field and the form stays; the details are editable.
      await phone.locator('input[name="lastName"]').fill("Ali");
      await phone.locator('input[name="password"]').fill("password123");
      await phone.getByRole("button", { name: "Finish creating account" }).click();
      await expect(phone.locator('input[name="password"]')).toHaveAttribute("aria-invalid", "true");
      await expect(phone.getByRole("heading", { level: 2, name: "Finish creating your account" })).toBeVisible();

      const chosen = "Willow-Anchor-7304";
      await phone.locator('input[name="password"]').fill(chosen);
      const sent = phone.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === "/store/v1/auth/sign-up/finish");
      await phone.getByRole("button", { name: "Finish creating account" }).click();
      expect((await sent).postDataJSON()).toEqual({ firstName: "Sam", lastName: "Ali", country, phone: "+12025550100", password: chosen });
      await expect(phone).toHaveURL(/\/en\/account$/);
      const after = (await (await phone.request.get("/store/v1/me")).json()) as { name: string; phone: string; country: string; hasPassword: boolean };
      expect(after).toMatchObject({ name: "Sam Ali", phone: "+12025550100", country, hasPassword: true });

      // The password the stranger-proof form took is the one chosen on the finish form; the one typed on the sign-up form never worked.
      await phone.context().clearCookies();
      await signIn(phone, { email, password: chosen });
      await phone.context().clearCookies();
      const refused = await phone.request.post("/client/auth/sign-in", {
        headers: { Origin: new URL(BASE_URL).origin, "X-Turnstile-Token": DEV_TURNSTILE_TOKEN, "Content-Type": "application/json" },
        data: { email, password },
      });
      expect(refused.status()).toBe(401);
    } finally {
      await phone.context().close();
    }
  });

  test("an address with no account asks for a sign-in link and gets a note with the sign-up address, never a link", async ({ page }) => {
    const email = uniqueEmail("nobody");
    await go(page, "/en/sign-in");
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await page.locator('input[name="email"]').fill(email);
    await page.getByRole("button", { name: "Email me the link" }).click();
    // The page says the same for every address.
    await expect(page.getByText(`a link is on its way to ${email}`)).toBeVisible();
    const note = await waitForLink(page, email, /^\/en\/sign-up$/);
    expect(note).toBe("/en/sign-up");
    const mail = await latestMailTo(page, email);
    expect(mail?.text ?? "").not.toMatch(/\/sign-in\?token=/);
  });

  test("sign-up: one quiet line says merchant accounts are opened by the team, and links to the page that explains it", async ({
    page,
  }) => {
    await go(page, "/en/sign-up");
    await expect(page.getByText("Merchant accounts are opened by our team.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Become a merchant" })).toHaveAttribute("href", "/en/become-a-merchant");
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/en/sign-in");
  });

  test("password lifecycle of a link-only account: forgot, set password (weak refused), sign in with it", async ({ page }) => {
    // An account holder with no password yet: its sign-up link was opened in another browser (nothing applied), then signed out.
    const { email } = await signUpInAnotherBrowser(page);
    await page.context().clearCookies();

    await go(page, "/en/forgot-password");
    await expect(page.getByRole("radio")).toHaveCount(0); // one form for every account
    await page.locator('input[name="email"]').fill(email);
    await page.getByRole("button", { name: "Email me a reset link" }).click();
    await expect(page.getByText(`If an account exists for ${email}`)).toBeVisible();
    const link = await waitForLink(page, email, SET_PASSWORD_LINK);

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
    await expect(page).toHaveURL(/\/en\/sign-in$/);

    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(good);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
  });

  test("set-password page explains a missing or spent link and asks for a new one at the one forgot page", async ({ page }) => {
    await go(page, "/en/set-password");
    await expect(page.getByText("This page needs the link from your email")).toBeVisible();
    await go(page, "/en/set-password?token=" + "x".repeat(43));
    await page.locator('input[name="password"]').fill("Orchard-Lantern-8841");
    await page.locator('input[name="confirmPassword"]').fill("Orchard-Lantern-8841");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByText("This link has expired")).toBeVisible();
    await expect(page.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/en/forgot-password");
  });

  test("verify-email: a missing or bad link is explained, and the page leads to sign-in only", async ({ page }) => {
    await go(page, "/en/verify-email");
    await expect(page.getByText("This page needs the link from your email")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/en/sign-in");

    await go(page, "/en/verify-email?token=" + "y".repeat(43));
    await page.getByRole("button", { name: "Verify my email" }).click();
    await expect(page.getByText("This link has expired")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/en/sign-in");
  });

  test("a verification link confirms the address and never signs the person in", async ({ page }) => {
    // Staff change the address of an account: its verification is cleared and a link goes to the new address.
    const { email } = await freshAccount(page, { unverified: true });
    const verify = await waitForLink(page, email, VERIFY_EMAIL_LINK);
    await go(page, verify);
    await page.getByRole("button", { name: "Verify my email" }).click();
    await expect(page.getByText("Your email is verified")).toBeVisible();
    await expect(page).toHaveURL(/\/en\/verify-email/); // it stays here: nothing opens the account
    expect((await page.request.get("/store/v1/me")).status()).toBe(401);
    expect((await page.request.get("/client/auth/me")).status()).toBe(401);
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/en/sign-in");
  });

  test("merchant invitation: staff create the account, the mailed link sets the password, and signing in lands on the account", async ({
    page,
  }) => {
    // The site has no application form (merchants ask on WhatsApp and staff create the account), so the account comes from
    // the admin API: it is active at once, has no password, and an invitation link is mailed to it.
    const email = uniqueEmail("invited");
    await createAccount({ email, rank: "merchant" });

    const invitation = await waitForLink(page, email, SET_PASSWORD_LINK);
    await go(page, invitation);
    const chosen = "Meadow-Compass-5520";
    await page.locator('input[name="password"]').fill(chosen);
    await page.locator('input[name="confirmPassword"]').fill(chosen);
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByText("Your password is saved")).toBeVisible();
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en\/sign-in$/);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(chosen);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    // The invitation proves the mailbox: the account is active, its email is verified and it has a merchant rank.
    const me = await page.request.get("/client/auth/me");
    expect(await me.json()).toMatchObject({ status: "active", emailVerifiedAt: expect.any(String), rank: { kind: "merchant" } });
  });

  test("merchant rank after a staff change of the address: verify the email, reset the password, sign in", async ({ page }) => {
    // The account is made the way the product makes one (staff create it, the invitation sets the password); then staff change
    // the address, which clears the verification and mails a verification link to the new address.
    const { email } = await freshAccount(page, { rank: "merchant", unverified: true });

    const verify = await waitForLink(page, email, VERIFY_EMAIL_LINK);
    await go(page, verify);
    await page.getByRole("button", { name: "Verify my email" }).click();
    await expect(page.getByText("Your email is verified")).toBeVisible();

    await go(page, "/en/forgot-password");
    await page.locator('input[name="email"]').fill(email);
    await page.getByRole("button", { name: "Email me a reset link" }).click();
    await expect(page.getByText(`If an account exists for ${email}`)).toBeVisible();
    const reset = await waitForLink(page, email, SET_PASSWORD_LINK);

    await go(page, reset);
    const fresh = "Meadow-Compass-5520";
    await page.locator('input[name="password"]').fill(fresh);
    await page.locator('input[name="confirmPassword"]').fill(fresh);
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByText("Your password is saved")).toBeVisible();
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en\/sign-in$/);
    await expect(page.getByRole("radio")).toHaveCount(0); // one form: a merchant rank signs in on it like everyone
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(fresh);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
  });
});

// "Become a merchant" sends the visitor to the team's WhatsApp number (2026-11-16); since shop decision 011 a short form (no password)
// writes the visitor's details into the message first, and nothing goes to our API. The number is a build-time value (NEXT_PUBLIC_MERCHANT_WHATSAPP, see .env.example): the tests read it from the env files of the site
// under test and are skipped when it is not set (the page then shows "Contact support" instead of a WhatsApp link).
const WHATSAPP_RAW = siteEnv("NEXT_PUBLIC_MERCHANT_WHATSAPP");
const WHATSAPP_NUMBER = normaliseWhatsAppNumber(WHATSAPP_RAW);
/** The number as the page shows it (the owner's own grouping when written with a plus, digits and spaces). */
const WHATSAPP_DISPLAY = WHATSAPP_NUMBER ? displayWhatsAppNumber(WHATSAPP_RAW, WHATSAPP_NUMBER) : "";
const WHATSAPP_MESSAGE_EN = "Hello, I would like to open a merchant account.";
const waLink = (text: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
/** The message the chat opens with after the form below was filled: the plain sentence, then one line per detail. */
const messageWithDetails = (country: string) =>
  [
    WHATSAPP_MESSAGE_EN,
    "First name: Sam",
    "Last name: Hamdan",
    "Email address: sam@example.com",
    "Phone number: +1 202 555 0100",
    `Country: ${country}`,
  ].join("\n");

test.describe("become a merchant page", () => {
  test.skip(!WHATSAPP_NUMBER, "NEXT_PUBLIC_MERCHANT_WHATSAPP is not set in the env files of the site under test");

  test("English: the heading, three steps, a short form with no password, and a WhatsApp button that writes the details into the message", async ({
    page,
  }) => {
    await go(page, "/en/become-a-merchant");
    await expect(page.getByRole("heading", { level: 1, name: "Become a merchant" })).toBeVisible();
    const main = page.locator("main");
    await expect(main.getByText("Merchant accounts are opened by our team.")).toBeVisible();

    const steps = main.getByRole("list", { name: "How to apply" }).getByRole("listitem");
    await expect(steps).toHaveCount(3);
    await expect(steps).toHaveText([
      /Fill in your details below\.$/,
      /Press the WhatsApp button: your details are already written in the message\. Send it\.$/,
      /Our team reviews the request and sends you a link to set your password\.$/,
    ]);

    // The short form: five details, no password.
    for (const name of ["firstName", "lastName", "email", "phone"]) await expect(main.locator(`input[name="${name}"]`)).toBeVisible();
    await expect(countryField(main)).toBeVisible();
    await expect(main.locator('input[type="password"]')).toHaveCount(0);

    const chat = main.getByRole("button", { name: "Chat on WhatsApp" });
    await expect(chat).toHaveAccessibleName(/opens WhatsApp in a new tab/);

    // A form with a missing detail opens nothing: the sentences sit under the fields.
    await chat.click();
    await expect(main.locator('input[name="firstName"]')).toBeFocused();
    await expect(main.getByText("This field is required.").first()).toBeVisible();

    // Filled in, the button opens the chat in a new tab with the details after the plain sentence. The tab is answered here, not by WhatsApp.
    await page.context().route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "chat" }));
    await main.locator('input[name="firstName"]').fill("Sam");
    await main.locator('input[name="lastName"]').fill("Hamdan");
    await main.locator('input[name="email"]').fill("sam@example.com");
    await main.locator('input[name="phone"]').fill("+1 202 555 0100");
    // The menu is the shop's tax-rate countries (every country when it has none): the first one, whichever the demo shop offers.
    await chooseCountry(countryField(main));
    const countryName = ((await main.locator('select[name="country"] option:checked').textContent()) ?? "").trim();
    const [chatTab] = await Promise.all([page.context().waitForEvent("page"), chat.click()]);
    expect(chatTab.url()).toBe(waLink(messageWithDetails(countryName)));

    await expect(main.getByText("Or message this number on WhatsApp:")).toBeVisible();
    await expect(main.locator('span[dir="ltr"]', { hasText: WHATSAPP_DISPLAY })).toBeVisible();

    await expect(
      page.locator("p", { hasText: "Already have an account?" }).getByRole("link", { name: "Sign in" }),
    ).toHaveAttribute("href", "/en/sign-in");
  });

  test("an old shared link that still carries a ?ref= value opens the same page: the form, no note, no request to the register route", async ({
    page,
  }) => {
    const registerRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/client/auth/register")
        registerRequests.push(`${request.method()} ${request.url()}`);
    });
    await go(page, "/en/become-a-merchant?ref=gsm0001");
    await expect(page.getByRole("heading", { level: 1, name: "Become a merchant" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Chat on WhatsApp" })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("GSM0001");
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    expect(registerRequests).toEqual([]);
  });
});

test.describe("temporary password", () => {
  test.beforeEach(async ({ page }) => stubTurnstile(page));

  test("an account whose password staff set must choose their own before continuing", async ({ page }) => {
    const { email } = await freshAccount(page);
    const temporary = await temporaryPassword(await accountIdByEmail(email));

    await go(page, "/en/sign-in");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(temporary);
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
    await signIn(page, { email, password: chosen }); // the chosen password works, and nothing more is asked
  });
});
