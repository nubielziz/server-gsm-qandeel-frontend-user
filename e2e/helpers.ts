// Shared e2e helpers. Sign-in goes through the site's own origin (the /client and /store/v1 rewrites), so the
// session cookies land in the browser context exactly as after a real sign-in.
import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { FIXTURES_FILE, changeMerchantEmail, inviteMerchant, type E2eFixtures } from "./admin";

/** Demo accounts on the isolated backend (scripts/dev-backend.sh; see PROGRESS.md). */
export const ACCOUNTS = {
  customer: { email: "daniel.whitmore@mail.example", password: "demo-password" },
  merchant: { email: "ops@zainmobilehub.example", password: "Storefront-Test-4821" },
  pendingMerchant: { email: "ops@algiersservice.example", password: "Storefront-Test-4821" },
} as const;

/** The token the backend's dev Turnstile verifier accepts (handoff §3.10). */
export const DEV_TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

/** Same base URL as playwright.config.ts. */
export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5175";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function origin(_page: Page): string {
  return new URL(BASE_URL).origin;
}

/**
 * Signs a merchant in (POST /client/auth/login with the site's Origin and the dev Turnstile token, as the browser would).
 * Returns the CSRF token of the new session (the answer's `X-CSRF-Token`), for specs that call the API with `page.request`.
 */
export async function signInMerchant(page: Page, account: { email: string; password: string } = ACCOUNTS.merchant): Promise<string> {
  const res = await page.request.post("/client/auth/login", {
    headers: { Origin: origin(page), "X-Turnstile-Token": DEV_TURNSTILE_TOKEN, "Content-Type": "application/json" },
    data: account,
  });
  expect(res.status(), await res.text()).toBe(200);
  expect((await res.json()).next).toBe("done");
  return res.headers()["x-csrf-token"] ?? "";
}

/**
 * Signs a customer in (POST /store/v1/auth/login with the dev Turnstile token).
 * Returns the CSRF token of the new session, for specs that call the API with `page.request`.
 */
export async function signInCustomer(page: Page, account: { email: string; password: string } = ACCOUNTS.customer): Promise<string> {
  const res = await page.request.post("/store/v1/auth/login", {
    headers: { "X-Turnstile-Token": DEV_TURNSTILE_TOKEN, "Content-Type": "application/json" },
    data: account,
  });
  expect(res.status(), await res.text()).toBe(200);
  expect((await res.json()).next).toBe("done");
  return res.headers()["x-csrf-token"] ?? "";
}

/** Latest Mailpit message to an address (the isolated backend sends all mail to Mailpit). */
export async function latestMailTo(page: Page, address: string): Promise<{ subject: string; text: string } | null> {
  const list = await page.request.get(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${address}`)}&limit=1`);
  const body = (await list.json()) as { messages?: { ID: string; Subject: string }[] };
  const first = body.messages?.[0];
  if (!first) return null;
  const message = (await (await page.request.get(`http://localhost:8025/api/v1/message/${first.ID}`)).json()) as {
    Text?: string;
    HTML?: string;
  };
  return { subject: first.Subject, text: `${message.Text ?? ""}\n${message.HTML ?? ""}` };
}

/** Replaces Cloudflare's script with a stub that hands out the dev token at once (and again after `reset`). */
export async function stubTurnstile(page: Page) {
  await page.route("**/challenges.cloudflare.com/turnstile/v0/api.js*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `var w={};window.turnstile={render:function(el,o){var id="w"+Math.random();w[id]=o;setTimeout(function(){o.callback("${DEV_TURNSTILE_TOKEN}")},30);return id},reset:function(id){var o=w[id];if(o)setTimeout(function(){o.callback("${DEV_TURNSTILE_TOKEN}")},30)},remove:function(id){delete w[id]}};`,
    }),
  );
}

/** `page.goto`, then wait until the first form control is hydrated: React resets a controlled input that was filled before hydration. */
export async function go(page: Page, url: string) {
  await page.goto(url);
  await page.waitForFunction(() => {
    const control = document.querySelector("form input, form textarea, form select");
    return !control || Object.keys(control).some((key) => key.startsWith("__reactProps"));
  });
}

/**
 * Waits until every form control on the page is hydrated. `go` waits for the first one only, and on a page with the
 * workspace header that is the header's search box: the page's own form sits in a later Suspense boundary and hydrates a
 * moment after it. Call this before typing into such a form, and after `page.reload()`. It is not part of `go`: some specs
 * read what the server rendered before the page's effects run (the top-up return notice).
 */
export async function hydrated(page: Page) {
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("form input, form textarea, form select")).every((control) =>
      Object.keys(control).some((key) => key.startsWith("__reactProps")),
    ),
  );
}

/** A made-up address nobody owns; the isolated backend sends its mail to Mailpit. */
export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;
}

/**
 * Waits for a Mailpit message to `address` whose text holds a link to `pathPattern`, and returns that link's path+query.
 * Links in mail point at the dev site (http://localhost:5175): use the path and query on the site under test.
 * `skip` lists links already used (a second mail of the same kind).
 */
export async function waitForLink(page: Page, address: string, pathPattern: RegExp, skip: string[] = []): Promise<string> {
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

/** The `token` query parameter of an emailed link (the path+query `waitForLink` returns). */
export function tokenOf(link: string): string {
  return new URL(link, "http://x").searchParams.get("token") ?? "";
}

/**
 * A brand-new customer, signed in through the magic link (API calls through the site). `withPassword` also gives them a
 * password and signs in with it (setting a password ends every session). Returns the email.
 */
export async function freshCustomer(page: Page, withPassword?: string): Promise<string> {
  const email = uniqueEmail("acct");
  const asked = await page.request.post("/store/v1/auth/magic-link", { headers: { "X-Turnstile-Token": DEV_TURNSTILE_TOKEN }, data: { email } });
  expect(asked.status(), await asked.text()).toBe(204);
  const link = await waitForLink(page, email, /\/sign-in\?token=/);
  const verified = await page.request.post("/store/v1/auth/verify", { data: { token: tokenOf(link) } });
  expect(verified.status(), await verified.text()).toBe(200);
  if (withPassword) {
    const forgot = await page.request.post("/store/v1/auth/password/forgot", { headers: { "X-Turnstile-Token": DEV_TURNSTILE_TOKEN }, data: { email } });
    expect(forgot.status(), await forgot.text()).toBe(204);
    const reset = await waitForLink(page, email, /\/set-password\?token=/);
    const set = await page.request.post("/store/v1/auth/password/set", { data: { token: tokenOf(reset), password: withPassword } });
    expect(set.status(), await set.text()).toBe(204);
    // Setting a password ends every session: sign in again.
    await signInCustomer(page, { email, password: withPassword });
  }
  return email;
}

/** The password `freshMerchant` gives a new merchant (the one e2e/auth.spec.ts sets from the invitation). */
export const FRESH_MERCHANT_PASSWORD = "Orchard-Lantern-8841";

/**
 * A brand-new merchant, made the way the product makes one: staff create the account through the admin API (`inviteMerchant`)
 * and the merchant sets a password from the invitation mailed to it (`POST /client/auth/password/reset` with the link's token,
 * the call the set-password page makes). The account is active, its email is verified (an invitation proves the mailbox) and
 * nobody is signed in.
 *
 * With `unverified`, staff then change the address (`changeMerchantEmail`): the verification is cleared and a verification
 * link is mailed to the NEW address, which is the one returned. It is the only way left to get an unverified merchant.
 *
 * @returns the credentials
 */
export async function freshMerchant(page: Page, options: { unverified?: boolean } = {}): Promise<{ email: string; password: string }> {
  const invited = uniqueEmail("merchant");
  const id = await inviteMerchant(invited);
  const invitation = await waitForLink(page, invited, /\/merchant\/set-password\?token=/);
  const set = await page.request.post("/client/auth/password/reset", {
    headers: { Origin: origin(page), "Content-Type": "application/json" },
    data: { token: tokenOf(invitation), password: FRESH_MERCHANT_PASSWORD },
  });
  expect(set.status(), await set.text()).toBe(204);
  if (!options.unverified) return { email: invited, password: FRESH_MERCHANT_PASSWORD };
  const email = uniqueEmail("merchant");
  await changeMerchantEmail(id, email);
  return { email, password: FRESH_MERCHANT_PASSWORD };
}

/** What the global setup wrote to e2e/.auth/fixtures.json (see e2e/global-setup.ts). */
export function fixtures(): E2eFixtures {
  try {
    return JSON.parse(readFileSync(FIXTURES_FILE, "utf8")) as E2eFixtures;
  } catch {
    throw new Error("e2e/.auth/fixtures.json is missing: run Playwright without E2E_SKIP_SETUP=1 once so the global setup writes it.");
  }
}
