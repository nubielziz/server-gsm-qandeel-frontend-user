// Sign-in, sign-up and the email-link pages against the isolated demo backend (:3100) and Mailpit (:8025).
// Rules this file keeps (rate limits are real, handoff §3.9): wrong passwords only with throwaway emails, the shared demo
// accounts are never changed (passwords, settings): lifecycle tests create their own accounts.
// There is one kind of account: the sign-in page is ONE form for every rank and nothing on these pages asks who the visitor is.
// The sign-in specifics (request shape, tokens, temporary passwords, two-step) live in e2e/sign-in.spec.ts.
import { expect, test } from "./fixtures";
import { accountIdByEmail, createAccount, temporaryPassword } from "./admin";
import {
  ACCOUNTS,
  DEV_TURNSTILE_TOKEN,
  SET_PASSWORD_LINK,
  SIGN_IN_LINK,
  VERIFY_EMAIL_LINK,
  freshAccount,
  go,
  signIn,
  signUpByLink,
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

test.describe("sign-in page", () => {
  test.beforeEach(async ({ page }) => stubTurnstile(page));

  test("one form for every account: no account-type choice, and every other way in is always shown", async ({ page }) => {
    await go(page, "/en/sign-in");
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/en/forgot-password");
    await expect(page.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/en/sign-up");
    await expect(page.getByRole("link", { name: "Need merchant prices?" })).toHaveAttribute("href", "/en/become-a-merchant");
  });

  test("an old ?as= value is ignored: the same form opens and its links carry no account type", async ({ page }) => {
    await go(page, "/en/sign-in?as=merchant");
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/en/forgot-password");
    await expect(page.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/en/sign-up");
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
    const email = uniqueEmail("magic");
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
      const email = uniqueEmail(ticked ? "claim" : "noclaim");
      expect(
        (
          await page.request.post("/store/v1/auth/magic-link", {
            headers: { "X-Turnstile-Token": DEV_TURNSTILE_TOKEN },
            data: { email },
          })
        ).status(),
      ).toBe(204);
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
      const email = uniqueEmail("told");
      expect(
        (
          await page.request.post("/store/v1/auth/magic-link", {
            headers: { "X-Turnstile-Token": DEV_TURNSTILE_TOKEN },
            data: { email },
          })
        ).status(),
      ).toBe(204);
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

  test("sign-up: an unknown email gets a link and lands on the account as a retail account", async ({ page }) => {
    const email = uniqueEmail("signup");
    await go(page, "/en/sign-up");
    await expect(page.getByRole("heading", { level: 1, name: "Create your account" })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0); // nothing to choose
    await page.locator('input[name="email"]').fill(email);
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page.getByText(`a link is on its way to ${email}`)).toBeVisible();
    const link = await waitForLink(page, email, SIGN_IN_LINK);

    await go(page, link);
    await page.getByRole("button", { name: "Sign in to IMEI-HUB" }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
    const me = (await (await page.request.get("/store/v1/me")).json()) as { email: string; rank: { kind: string } };
    expect(me).toMatchObject({ email, rank: { kind: "retail" } });
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
    // An account holder with no password yet: made by the email link, then signed out.
    const { email } = await signUpByLink(page);
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

// "Become a merchant" is not a form (2026-11-16): the page sends the visitor to the team's WhatsApp number. The number is
// a build-time value (NEXT_PUBLIC_MERCHANT_WHATSAPP, see .env.example): the tests read it from the env files of the site
// under test and are skipped when it is not set (the page then shows "Contact support" instead of a WhatsApp link).
const WHATSAPP_RAW = siteEnv("NEXT_PUBLIC_MERCHANT_WHATSAPP");
const WHATSAPP_NUMBER = normaliseWhatsAppNumber(WHATSAPP_RAW);
/** The number as the page shows it (the owner's own grouping when written with a plus, digits and spaces). */
const WHATSAPP_DISPLAY = WHATSAPP_NUMBER ? displayWhatsAppNumber(WHATSAPP_RAW, WHATSAPP_NUMBER) : "";
const WHATSAPP_MESSAGE_EN = "Hello, I would like to open a merchant account.";
const waLink = (text: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

test.describe("become a merchant page", () => {
  test.skip(!WHATSAPP_NUMBER, "NEXT_PUBLIC_MERCHANT_WHATSAPP is not set in the env files of the site under test");

  test("English: the heading, three steps, no form, and a WhatsApp link with the prefilled message and the number as text", async ({
    page,
  }) => {
    await go(page, "/en/become-a-merchant");
    await expect(page.getByRole("heading", { level: 1, name: "Become a merchant" })).toBeVisible();
    const main = page.locator("main");
    await expect(main.getByText("Merchant accounts are opened by our team.")).toBeVisible();

    const steps = main.getByRole("list", { name: "How to apply" }).getByRole("listitem");
    await expect(steps).toHaveCount(3);
    await expect(steps).toHaveText([
      /Message us on WhatsApp\.$/,
      /Tell us your name, company, country and email\.$/,
      /Our team reviews the request and sends you a link to set your password\.$/,
    ]);

    // Nothing to fill in or submit.
    await expect(main.locator("form, input, select, textarea")).toHaveCount(0);

    const chat = main.getByRole("link", { name: "Chat on WhatsApp" });
    await expect(chat).toBeVisible();
    await expect(chat).toHaveAttribute("href", waLink(WHATSAPP_MESSAGE_EN));
    await expect(chat).toHaveAttribute("target", "_blank");
    await expect(chat).toHaveAttribute("rel", /noopener/);
    await expect(chat).toHaveAccessibleName(/opens WhatsApp in a new tab/);

    await expect(main.getByText("Or message this number on WhatsApp:")).toBeVisible();
    await expect(main.locator('span[dir="ltr"]', { hasText: WHATSAPP_DISPLAY })).toBeVisible();

    await expect(
      page.locator("p", { hasText: "Already have an account?" }).getByRole("link", { name: "Sign in" }),
    ).toHaveAttribute("href", "/en/sign-in");
  });

  test("an old shared link that still carries a ?ref= value opens the same page: the plain message, no note, no request to the register route", async ({
    page,
  }) => {
    const registerRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/client/auth/register")
        registerRequests.push(`${request.method()} ${request.url()}`);
    });
    await go(page, "/en/become-a-merchant?ref=gsm0001");
    await expect(page.getByRole("heading", { level: 1, name: "Become a merchant" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Chat on WhatsApp" })).toHaveAttribute("href", waLink(WHATSAPP_MESSAGE_EN));
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
