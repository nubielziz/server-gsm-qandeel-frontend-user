// One Idempotency-Key per merchant order submission (plan F23, BH §7.1): the order form sends a key, keeps it while the
// same body is sent again (a lost answer, a double click, a wait for 409 IDEMPOTENCY_IN_PROGRESS) and takes a new one as
// soon as the body changes or the API says the key was used for another body. Runs against the isolated demo backend
// (:3100) as the demo merchant, on service 1 ($0.10 an order): the tests that place a real order say so, and try to
// cancel it afterwards (the worker usually picks it up first, then the API answers 409 and the order stays).
// The refusals are mocked in the browser, so they cost nothing.
import type { Page, Request } from "@playwright/test";
import { expect, test } from "./fixtures";
import { go, signInMerchant } from "./helpers";

const SERVICE = "/en/merchant/services/1";
const ORDERS = "**/client/orders";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A random 15-digit IMEI with a correct Luhn check digit (every run uses its own, so no "open order" rule trips). */
function randomImei(): string {
  const body = "35" + Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join("");
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(body[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return body + String((10 - (sum % 10)) % 10);
}

const main = (page: Page) => page.getByRole("main");
const imeiBox = (page: Page) => main(page).getByRole("textbox", { name: /^IMEI/ });
const place = (page: Page) => main(page).getByRole("button", { name: /^Place order/ });

test.beforeEach(async ({ page }) => {
  await signInMerchant(page);
});

/** Opens the order form of service 1; the API can end the session at any time (other runs sign in as the same merchant). */
async function openForm(page: Page) {
  await go(page, SERVICE);
  if (new URL(page.url()).pathname.endsWith("/sign-in")) {
    await signInMerchant(page);
    await go(page, SERVICE);
  }
  await expect(imeiBox(page)).toBeVisible();
}

const isOrderPost = (request: Request) => request.method() === "POST" && new URL(request.url()).pathname === "/client/orders";

/** Records every `POST /client/orders` the page sends, so a test can read the headers and the body afterwards. */
function recordOrderPosts(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (isOrderPost(request)) sent.push(request);
  });
  return sent;
}

/** The header the page set (`headers()` is there at once, also for a request the test aborted or answered itself). */
function keyOf(request: Request): string | undefined {
  return request.headers()["idempotency-key"];
}

/** Answers every POST with a refusal that changes nothing on the page but a banner: no order is placed. */
async function refuseOrders(page: Page, status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  await page.route(ORDERS, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status,
          contentType: "application/problem+json",
          headers: { "x-request-id": "req-e2e-idem", ...headers },
          body: JSON.stringify({ type: "x", title: "x", status, requestId: "req-e2e-idem", ...body }),
        })
      : route.continue(),
  );
}

async function ordersForImei(page: Page, imei: string): Promise<number> {
  const res = await page.request.get(`/client/orders?_start=0&_end=1&q=${imei}`);
  expect(res.status(), await res.text()).toBe(200);
  return Number(res.headers()["x-total-count"]);
}

/** Cancels an order when the API still allows it; a worker usually picked it up already (409), and that is fine. */
async function cancelIfPossible(page: Page, orderId: string) {
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "csrf_token_client")?.value ?? "";
  const res = await page.request.post(`/client/orders/${orderId}/cancel`, { headers: { "X-CSRF-Token": csrf }, data: {} });
  expect([200, 204, 409], await res.text()).toContain(res.status());
}

const orderIdOf = (url: string) => /\/orders\/(\d+)$/.exec(url)?.[1] ?? "";

test("the order request carries an Idempotency-Key, and a double click sends one request and places one order (places a real $0.10 order)", async ({ page }) => {
  const imei = randomImei();
  const sent = recordOrderPosts(page);
  await openForm(page);
  await imeiBox(page).fill(imei);
  await expect(main(page).getByText("This IMEI is valid.")).toBeVisible();

  await place(page).dblclick();
  await page.waitForURL(/\/en\/merchant\/orders\/\d+$/);
  const id = orderIdOf(page.url());

  expect(sent).toHaveLength(1);
  expect(keyOf(sent[0])).toMatch(UUID);
  expect(await ordersForImei(page, imei)).toBe(1);
  await cancelIfPossible(page, id);
});

test("a lost answer: the second click sends the same key and gets the same order, and only one order exists (places a real $0.10 order)", async ({ page }) => {
  const imei = randomImei();
  const sent = recordOrderPosts(page);
  let firstOrderId = "";
  let lost = false;
  await page.route(ORDERS, async (route) => {
    if (route.request().method() !== "POST" || lost) return route.continue();
    lost = true;
    // The server gets the request and places the order, but the answer never reaches the page.
    const answer = await route.fetch();
    expect(answer.status(), await answer.text()).toBe(201);
    firstOrderId = String(((await answer.json()) as { orders: { id: number }[] }).orders[0].id);
    await route.abort("connectionreset");
  });

  await openForm(page);
  await imeiBox(page).fill(imei);
  await place(page).click();
  await expect(main(page).getByRole("alert").filter({ hasText: "The order was not placed" })).toBeVisible();
  await expect(main(page).getByText("Could not reach the server")).toBeVisible();
  await expect(place(page)).toBeEnabled();
  expect(firstOrderId).not.toBe("");

  // Same form, same body: the API replays the first answer.
  await place(page).click();
  await page.waitForURL(/\/en\/merchant\/orders\/\d+$/);
  expect(orderIdOf(page.url())).toBe(firstOrderId);

  expect(sent).toHaveLength(2);
  const [first, second] = [keyOf(sent[0]), keyOf(sent[1])];
  expect(first).toMatch(UUID);
  expect(second).toBe(first);
  expect(await ordersForImei(page, imei)).toBe(1);
  await cancelIfPossible(page, firstOrderId);
});

test("a key follows the body: the same body keeps it, another IMEI takes a new one (refusals are mocked, no order is placed)", async ({ page }) => {
  const sent = recordOrderPosts(page);
  await refuseOrders(page, 409, { code: "SERVICE_DISABLED" });
  await openForm(page);

  const [a, b] = [randomImei(), randomImei()];
  await imeiBox(page).fill(a);
  await place(page).click();
  await expect(main(page).getByText("This service is unavailable")).toBeVisible();
  await expect(place(page)).toBeEnabled();
  await place(page).click(); // the same form again: the refusal stored nothing, so the same key is right
  await expect.poll(() => sent.length).toBe(2);

  await imeiBox(page).fill(b);
  await place(page).click();
  await expect.poll(() => sent.length).toBe(3);

  const keys = sent.map(keyOf);
  for (const key of keys) expect(key).toMatch(UUID);
  expect(keys[1]).toBe(keys[0]);
  expect(keys[2]).not.toBe(keys[0]);
  expect(JSON.parse(sent[2].postData() ?? "{}")).toMatchObject({ serviceId: 1, imei: b });
});

test("409 IDEMPOTENCY_IN_PROGRESS: the form waits Retry-After, says so, and sends the same key again (places a real $0.10 order)", async ({ page }) => {
  const imei = randomImei();
  const sent = recordOrderPosts(page);
  let busy = true;
  await page.route(ORDERS, (route) => {
    if (route.request().method() !== "POST" || !busy) return route.continue();
    busy = false;
    return route.fulfill({
      status: 409,
      contentType: "application/problem+json",
      headers: { "retry-after": "1", "x-request-id": "req-e2e-idem" },
      body: JSON.stringify({ type: "x", title: "x", status: 409, code: "IDEMPOTENCY_IN_PROGRESS", requestId: "req-e2e-idem" }),
    });
  });

  await openForm(page);
  await imeiBox(page).fill(imei);
  await place(page).click();
  await expect(main(page).getByText("Your order is still being processed.")).toBeVisible();
  await page.waitForURL(/\/en\/merchant\/orders\/\d+$/);
  const id = orderIdOf(page.url());

  expect(sent).toHaveLength(2);
  const [first, second] = [keyOf(sent[0]), keyOf(sent[1])];
  expect(first).toMatch(UUID);
  expect(second).toBe(first);
  expect(await ordersForImei(page, imei)).toBe(1);
  await cancelIfPossible(page, id);
});

test("409 IDEMPOTENCY_IN_PROGRESS that never ends: three more tries, then the text and the button again (refusals are mocked)", async ({ page }) => {
  test.setTimeout(90_000);
  const sent = recordOrderPosts(page);
  await refuseOrders(page, 409, { code: "IDEMPOTENCY_IN_PROGRESS" }, { "retry-after": "1" });
  await openForm(page);
  await imeiBox(page).fill(randomImei());
  await place(page).click();

  // The first send and three retries, one second apart; then the person sees the generic text and can press again.
  await expect(main(page).getByRole("alert").filter({ hasText: "Your request is still being processed." })).toBeVisible({ timeout: 30_000 });
  await expect(place(page)).toBeEnabled();
  expect(sent).toHaveLength(4);
  const keys = sent.map(keyOf);
  expect(new Set(keys).size).toBe(1);
});

test("409 IDEMPOTENCY_KEY_REUSED shows the generic text and the next press takes a new key (refusals are mocked)", async ({ page }) => {
  const sent = recordOrderPosts(page);
  await refuseOrders(page, 409, { code: "IDEMPOTENCY_KEY_REUSED" });
  await openForm(page);
  await imeiBox(page).fill(randomImei());
  await place(page).click();
  await expect(main(page).getByRole("alert").filter({ hasText: "This request changed while it was being sent." })).toBeVisible();
  await expect(place(page)).toBeEnabled();
  await place(page).click();
  await expect.poll(() => sent.length).toBe(2);

  const [first, second] = [keyOf(sent[0]), keyOf(sent[1])];
  expect(first).toMatch(UUID);
  expect(second).toMatch(UUID);
  expect(second).not.toBe(first);
});
