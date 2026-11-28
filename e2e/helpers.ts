// Shared e2e helpers. Sign-in goes through the site's own origin (the /client and /store/v1 rewrites), so the
// session cookies land in the browser context exactly as after a real sign-in. There is one kind of account: a rank tells a
// retail account from a merchant (its own prices in the shop, wallet invoices, API); the helpers take the rank as an option.
import { readFileSync } from "node:fs";
import { expect, request as playwrightRequest, type APIRequestContext, type Browser, type Locator, type Page } from "@playwright/test";
import { FIXTURES_FILE, changeAccountEmail, createAccount, setAccountStatus, type E2eFixtures, type RankKind } from "./admin";

/**
 * The country field of a form: the button a person uses (a combobox named by the field's label). The `<select name="country">`
 * next to it is hidden: it carries the field's value and options (read them from it), and nobody clicks it.
 * @param name the field's label (default "Country")
 */
export function countryField(scope: Page | Locator, name = "Country"): Locator {
  return scope.getByRole("combobox", { name, exact: true });
}

/**
 * Chooses a country the way a person does: opens the field's list and takes the row of `code`, or the first row of the list when
 * no code is given (whichever the demo shop offers first).
 *
 * @param field the country field (`countryField`)
 * @param code an ISO 3166-1 alpha-2 code the list offers
 * @returns the chosen code, read from the field's hidden select
 */
export async function chooseCountry(field: Locator, code?: string): Promise<string> {
  // The button names its panel only once the page's script runs: a click before that would be lost.
  await expect(field).toHaveAttribute("popovertarget", /.+/);
  await field.click();
  await expect(field).toHaveAttribute("aria-expanded", "true");
  const listId = await field.getAttribute("aria-controls");
  const list = field.page().locator(`[id="${listId}"]`);
  await (code ? list.locator(`[id="${listId}-${code}"]`) : list.getByRole("option").first()).click();
  await expect(field).toHaveAttribute("aria-expanded", "false");
  return field.locator("xpath=following-sibling::select").inputValue();
}

/** Credentials of an account. */
export interface Credentials {
  email: string;
  password: string;
}

/** Demo accounts on the isolated backend (scripts/dev-backend.sh; see PROGRESS.md). */
export const ACCOUNTS = {
  retail: { email: "daniel.whitmore@mail.example", password: "demo-password" },
  merchant: { email: "ops@zainmobilehub.example", password: "Storefront-Test-4821" },
} as const satisfies Record<RankKind, Credentials>;

/** The token the backend's dev Turnstile verifier accepts (handoff §3.10). */
export const DEV_TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

/** Same base URL as playwright.config.ts. */
export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5175";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function origin(_page: Page): string {
  return new URL(BASE_URL).origin;
}

/**
 * Signs an account of either rank in: `POST /client/auth/sign-in` with the site's Origin and the dev Turnstile token, as the
 * browser would. One route, one form: the answer's `rank` decides which family of routes the session reaches.
 *
 * A page that already holds a session of the other rank should clear its cookies first (`page.context().clearCookies()`).
 *
 * @param account the credentials; only the email and the password are sent, so a `FreshAccount` can be passed as it is
 * @param options `next`: the step the answer must name (default `"done"`; a temporary password answers `"password"`, two-step `"totp"`)
 * @returns the CSRF token of the new session (the answer's `X-CSRF-Token`), for specs that call the API with `page.request`
 */
export async function signIn(page: Page, account: Credentials = ACCOUNTS.retail, options: { next?: "done" | "password" | "totp" } = {}): Promise<string> {
  const res = await page.request.post("/client/auth/sign-in", {
    headers: { Origin: origin(page), "X-Turnstile-Token": DEV_TURNSTILE_TOKEN, "Content-Type": "application/json" },
    data: { email: account.email, password: account.password },
  });
  expect(res.status(), await res.text()).toBe(200);
  expect((await res.json()).next).toBe(options.next ?? "done");
  return res.headers()["x-csrf-token"] ?? "";
}

type ApiField = { key: string; label: string; fieldType: string; isMainInput: boolean };

/**
 * The field of a service that holds an IMEI: the first of type `imei`, else the one flagged `isMainInput` (decision 008: the
 * type, not the type of the service, makes a box an IMEI box; the flag is the fallback for demo data not yet migrated). Null when
 * the service lists neither.
 */
function imeiFieldOf(fields: readonly ApiField[]): { key: string; label: string } | null {
  const box = fields.find((field) => field.fieldType === "imei") ?? fields.find((field) => field.isMainInput);
  return box ? { key: box.key, label: box.label } : null;
}

/**
 * The box that holds the IMEI of a service: its custom field of type `imei` (or, failing that, flagged `isMainInput`). Its key
 * and its label come from the shop's own read of the service (`GET /store/v1/services/:slug`, through the site's rewrite), so no
 * spec guesses either. There is no `imei` in an order or a checkout session any more: the IMEI is an input under that key.
 */
export async function imeiBox(request: APIRequestContext, slug: string): Promise<{ key: string; label: string }> {
  const res = await request.get(`/store/v1/services/${encodeURIComponent(slug)}`);
  expect(res.status(), `${slug}: ${await res.text()}`).toBe(200);
  const box = imeiFieldOf(((await res.json()) as { fields: ApiField[] }).fields);
  if (!box) throw new Error(`E2E: ${slug} lists no field of type imei and none flagged isMainInput: the demo data must give it one (decision 008).`);
  return box;
}

/** The `inputs` of a checkout session for an IMEI service of the shop: `{ [key of its IMEI field]: imei }`. */
export async function imeiInputs(request: APIRequestContext, slug: string, imei: string): Promise<Record<string, string>> {
  return { [(await imeiBox(request, slug)).key]: imei };
}

/**
 * The same for the order form of the signed-in merchant rank (`GET /client/services/:id`): the key and the label of the field
 * of type `imei` (or flagged `isMainInput`). The page must be signed in as a merchant rank.
 */
export async function merchantImeiBox(request: APIRequestContext, serviceId: number): Promise<{ key: string; label: string }> {
  const res = await request.get(`/client/services/${serviceId}`);
  expect(res.status(), `service ${serviceId}: ${await res.text()}`).toBe(200);
  const box = imeiFieldOf(((await res.json()) as { fields: ApiField[] }).fields);
  if (!box) throw new Error(`E2E: service ${serviceId} lists no field of type imei and none flagged isMainInput: the demo data must give it one (decision 008).`);
  return box;
}

/** The `inputs` of `POST /client/orders` for an IMEI service: `{ [key of its IMEI field]: imei }`. */
export async function merchantImeiInputs(request: APIRequestContext, serviceId: number, imei: string): Promise<Record<string, string>> {
  return { [(await merchantImeiBox(request, serviceId)).key]: imei };
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

/** The mailed link that sets a password (an invitation or a reset): `/set-password` at the root of the shop, for every rank. */
export const SET_PASSWORD_LINK = /^\/set-password\?token=/;
/** The mailed link that verifies an address: `/verify-email` at the root of the shop, for every rank. */
export const VERIFY_EMAIL_LINK = /^\/verify-email\?token=/;
/**
 * The mailed link of a sign-in or of a sign-up: it signs an account in, and the link of a sign-up makes the account first. A plain
 * request for an address with no account gets no such link (a note with the sign-up address instead).
 */
export const SIGN_IN_LINK = /\/sign-in\?token=/;

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

/** The details the sign-up form collects besides the email and the password (a country the demo shop has a tax window for). */
export interface SignUpDetails {
  firstName: string;
  lastName: string;
  country: string;
  phone: string;
}

/** The details `signUpByLink` sends unless a spec gives its own. The phone is written the way a person types it. */
export const SIGN_UP_DETAILS: SignUpDetails = { firstName: "Sam", lastName: "Hamdan", country: "US", phone: "+1 202 555 0100" };

/** What the server keeps of `SIGN_UP_DETAILS.phone`: spaces, dashes, dots and brackets removed. */
export const SIGN_UP_PHONE_STORED = "+12025550100";

/** A random private client address, so a context made by hand is not counted with the test's own (the API's limits are per address). */
function randomPrivateIp(): string {
  return `10.${200 + Math.floor(Math.random() * 50)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 253)}`;
}

/**
 * A second browser: a context of its own (its own cookies, so it never holds the asking-browser cookie or the session of the first
 * one) with its own client address. Close its context when the test is done: `await page.context().close()`.
 */
export async function openAnotherBrowser(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { "X-Forwarded-For": randomPrivateIp() } });
  return context.newPage();
}

/** What a sign-up helper made. */
export interface SignedUp {
  email: string;
  /** The password of the form: set on the account when the link was opened in the browser that sent the form. */
  password: string;
  details: SignUpDetails;
  /** How many guest orders the exchange added (the box is ticked with `claimGuestOrders`). */
  claimedOrders: number;
  claimSkipped?: "busy";
}

/** The sign-up call the form makes: `POST /store/v1/auth/sign-up` with the dev Turnstile token. The answer is 204 whatever the address is. */
async function postSignUp(request: APIRequestContext, email: string, password: string, details: SignUpDetails): Promise<void> {
  const asked = await request.post("/store/v1/auth/sign-up", {
    headers: { "X-Turnstile-Token": DEV_TURNSTILE_TOKEN },
    data: { email, password, ...details },
  });
  expect(asked.status(), await asked.text()).toBe(204);
}

/**
 * A brand-new retail account made the way a visitor makes one: the sign-up form's call (`POST /store/v1/auth/sign-up`, with the
 * password and the four details), the mailed link, and the link's token to `POST /store/v1/auth/verify` through the SAME browser
 * context (its cookie jar holds the asking-browser cookie the sign-up call set), so the details and the password are applied and
 * the exchange answers `passwordSet: true`. The page is signed in afterwards, with a password, a name and a proven address. Use
 * `signUpInAnotherBrowser` for an account with no password and no details, `freshAccount` for a merchant rank or an account that
 * staff made.
 *
 * @param options `email`: the address to sign up (default: a new one); `password`: the form's password (default
 *   `FRESH_ACCOUNT_PASSWORD`); `details`: replaces some of `SIGN_UP_DETAILS`; `claimGuestOrders`: tick the box that adds the orders
 *   a guest placed with this address (the account's address is proven by the link)
 * @returns the address, the password and the details, how many guest orders the exchange added, and `claimSkipped` when it could not just now
 */
export async function signUpByLink(
  page: Page,
  options: { email?: string; password?: string; details?: Partial<SignUpDetails>; claimGuestOrders?: boolean } = {},
): Promise<SignedUp> {
  const email = options.email ?? uniqueEmail("acct");
  const password = options.password ?? FRESH_ACCOUNT_PASSWORD;
  const details = { ...SIGN_UP_DETAILS, ...options.details };
  await postSignUp(page.request, email, password, details);
  const link = await waitForLink(page, email, SIGN_IN_LINK);
  const verified = await page.request.post("/store/v1/auth/verify", {
    data: { token: tokenOf(link), ...(options.claimGuestOrders ? { claimGuestOrders: true } : {}) },
  });
  expect(verified.status(), await verified.text()).toBe(200);
  const answer = (await verified.json()) as { next?: string; claimedOrders?: number; claimSkipped?: "busy"; passwordSet?: boolean };
  expect(answer.next).toBe("done");
  expect(answer.passwordSet, "the link was opened in the browser that sent the form").toBe(true);
  return { email, password, details, claimedOrders: answer.claimedOrders ?? 0, ...(answer.claimSkipped ? { claimSkipped: answer.claimSkipped } : {}) };
}

/**
 * A brand-new retail account whose sign-up link was opened in ANOTHER browser than the one that sent the form (a phone's mail
 * app): the sign-up call goes through a request context of its own (its own cookie jar, so the asking-browser cookie never reaches
 * the page), and the link's token goes to `POST /store/v1/auth/verify` through the page. The account is made and the page is signed in
 * with NOTHING applied: no password, no name, no phone, no country. The answer carries `passwordSet: false` and `pendingDetails` (the
 * details as typed, never the password); the account is finished by `POST /store/v1/auth/sign-up/finish` (or the "finish your account" form).
 *
 * @param options as `signUpByLink`
 * @returns the address, the password the form carried (never applied), the details, and the answer of the exchange
 */
export async function signUpInAnotherBrowser(
  page: Page,
  options: { email?: string; password?: string; details?: Partial<SignUpDetails> } = {},
): Promise<{ email: string; password: string; details: SignUpDetails; answer: { next?: string; passwordSet?: boolean; pendingDetails?: SignUpDetails; requestedHere?: boolean } }> {
  const email = options.email ?? uniqueEmail("acct");
  const password = options.password ?? FRESH_ACCOUNT_PASSWORD;
  const details = { ...SIGN_UP_DETAILS, ...options.details };
  const other = await playwrightRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { "X-Forwarded-For": randomPrivateIp() },
  });
  try {
    await postSignUp(other, email, password, details);
  } finally {
    await other.dispose();
  }
  const link = await waitForLink(page, email, SIGN_IN_LINK);
  const verified = await page.request.post("/store/v1/auth/verify", { data: { token: tokenOf(link) } });
  expect(verified.status(), await verified.text()).toBe(200);
  const answer = (await verified.json()) as { next?: string; passwordSet?: boolean; pendingDetails?: SignUpDetails; requestedHere?: boolean };
  expect(answer.next).toBe("done");
  expect(answer.passwordSet, "another browser opened the link: nothing of the form is applied").toBe(false);
  expect(answer.requestedHere).toBe(false);
  return { email, password, details, answer };
}

/** The password `freshAccount` gives a new account (the one e2e/auth.spec.ts sets from the invitation). */
export const FRESH_ACCOUNT_PASSWORD = "Orchard-Lantern-8841";

/** An account `freshAccount` made: its credentials, staff id and rank kind. */
export interface FreshAccount extends Credentials {
  id: number;
  rank: RankKind;
}

/**
 * A brand-new account, made the way the product makes one: staff create it through the admin API (`createAccount`: a retail
 * account unless `rank: "merchant"`, which the Owner gives) and the person sets a password from the invitation mailed to it
 * (`POST /client/auth/password/reset` with the link's token, the call the set-password page makes). The account is active, its
 * email is verified (an invitation proves the mailbox) and nobody is signed in unless `signedIn` is set.
 *
 * With `unverified`, staff then change the address (`changeAccountEmail`): the verification is cleared and a verification link
 * is mailed to the NEW address, which is the one returned (match it with `VERIFY_EMAIL_LINK`). With `suspended`, staff then
 * suspend the account (it cannot sign in: 403 `ACCOUNT_SUSPENDED`). With `signedIn`, the page signs in with `signIn`.
 *
 * @returns the credentials, the staff id and the rank kind
 */
export async function freshAccount(
  page: Page,
  options: { rank?: RankKind; name?: string; unverified?: boolean; suspended?: boolean; signedIn?: boolean } = {},
): Promise<FreshAccount> {
  if (options.signedIn && (options.suspended || options.unverified)) throw new Error("A page can sign in only to an active account with a proven address.");
  const rank = options.rank ?? "retail";
  const invited = uniqueEmail(rank === "retail" ? "acct" : "merchant");
  const id = await createAccount({ email: invited, name: options.name, rank });
  const invitation = await waitForLink(page, invited, SET_PASSWORD_LINK);
  const set = await page.request.post("/client/auth/password/reset", {
    headers: { Origin: origin(page), "Content-Type": "application/json" },
    data: { token: tokenOf(invitation), password: FRESH_ACCOUNT_PASSWORD },
  });
  expect(set.status(), await set.text()).toBe(204);

  let email = invited;
  if (options.unverified) {
    email = uniqueEmail(rank === "retail" ? "acct" : "merchant");
    await changeAccountEmail(id, email);
  }
  if (options.suspended) await setAccountStatus(id, "suspended");
  const account = { email, password: FRESH_ACCOUNT_PASSWORD, id, rank };
  if (options.signedIn) await signIn(page, account);
  return account;
}

/** What the global setup wrote to e2e/.auth/fixtures.json (see e2e/global-setup.ts). */
export function fixtures(): E2eFixtures {
  try {
    return JSON.parse(readFileSync(FIXTURES_FILE, "utf8")) as E2eFixtures;
  } catch {
    throw new Error("e2e/.auth/fixtures.json is missing: run Playwright without E2E_SKIP_SETUP=1 once so the global setup writes it.");
  }
}
