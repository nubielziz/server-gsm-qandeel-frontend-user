// Checkout quantities (BH §13, §14.2, §14.3, §14.6; plan F20, D17): a range gets a bounded number box, packs get radio
// buttons and no number box, one per order and exactly N get no control at all; the refusal of a quantity is said in words
// built from the rule (never the server's English text); the quantity survives a restart and a resumed checkout.
// Real browser → Next → the isolated demo backend (:3100). The services are the fixtures of the global setup
// (e2e/global-setup.ts → e2e/.auth/fixtures.json): range = 2 to 50, packs = 5/10/25, exact = 5. They are IMEI services, so
// every test that opens a checkout also enters the IMEI. A server answer that cannot be provoked on demand (the rule changed
// between the page and the click) is mocked at the browser boundary, together with the re-read of the service it triggers.
// Nothing here pays or changes data: the sessions it opens just expire. The site caches catalog reads for about 30 s, so the
// first visit of a page waits (toPass, with a reload) until the rule the setup just wrote shows.
import { type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { checkout } from "../lib/i18n/messages/checkout";
import { expect, test } from "./fixtures";
import { DEV_TURNSTILE_TOKEN, fixtures, stubTurnstile } from "./helpers";

type Rule = { min: number; max: number; options: number[] };

interface ApiService {
  id: number;
  slug: string;
  availability: "in_stock" | "on_request";
  etaText: string;
  quantity: Rule;
  price: { net: string; gross: string; currency: string };
}

interface ApiSession {
  quantity: number;
  amounts: { display: { net: string; tax: string; gross: string } };
}

const IMEI = "490154203237518";

/** What the API says when it refuses a quantity (the English text is never shown on the site). */
const SERVER_TEXT = "Choose one of the quantities this service sells: 5, 10, 25.";

test.beforeEach(async ({ page }) => stubTurnstile(page));

/** The service as the API sends it, through the site's own `/store/v1` rewrite. */
async function apiService(request: APIRequestContext, slug: string): Promise<ApiService> {
  const res = await request.get(`/store/v1/services/${encodeURIComponent(slug)}`);
  expect(res.status(), `${slug}: ${await res.text()}`).toBe(200);
  return (await res.json()) as ApiService;
}

/** Opens a checkout session straight through the API, as the form would, and returns its token. */
async function createSession(request: APIRequestContext, overrides: Record<string, unknown>): Promise<string> {
  const res = await request.post("/store/v1/checkout-sessions", {
    headers: { "X-Turnstile-Token": DEV_TURNSTILE_TOKEN, "Content-Type": "application/json" },
    data: { email: "e2e-qty@example.com", country: "DE", currency: "USD", imei: IMEI, ...overrides },
  });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { token: string }).token;
}

async function apiSession(request: APIRequestContext, token: string): Promise<ApiSession> {
  const res = await request.get(`/store/v1/checkout-sessions/${token}`);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as ApiSession;
}

/**
 * `amount × quantity` as US dollars with two decimals, by integer math on the API's 4-decimal string: what the site prints.
 * Half cents round up, like the site's formatter.
 */
function dollars(amount: string, quantity = 1): string {
  const match = /^(\d+)\.(\d{4})$/.exec(amount);
  if (!match) throw new Error(`Not a 4-decimal amount: ${amount}`);
  const cents = (BigInt(match[1] + match[2]) * BigInt(quantity) + BigInt(50)) / BigInt(100);
  const whole = (cents / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${whole}.${(cents % BigInt(100)).toString().padStart(2, "0")}`;
}

/**
 * Opens a checkout and waits until the form is hydrated and the (stubbed) security check has answered. With `rule` the page
 * is reloaded until the quantity rule text shows (a rule the global setup just wrote may still be cached).
 */
async function openCheckout(page: Page, path: string, options: { rule?: string } = {}) {
  const t = checkout.start;
  if (options.rule) {
    const rule = options.rule;
    await expect(async () => {
      await page.goto(path);
      await expect(page.getByText(rule).first()).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 90_000, intervals: [5_000] });
  } else {
    await page.goto(path);
  }
  await expect(page.getByRole("button", { name: t.summary.continue })).toBeEnabled();
}

/** Opens the "Service requirements" drawer. */
async function openDrawer(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: checkout.start.info.enter }).first().click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  return drawer;
}

async function saveDrawer(drawer: Locator) {
  await drawer.getByRole("button", { name: checkout.start.drawer.save }).click();
}

async function fillBuyer(page: Page) {
  const t = checkout.start;
  await page.getByLabel(t.you.email).fill("e2e-qty-buyer@example.com");
  await page.getByLabel(t.you.country).selectOption("DE");
}

/** The value (dd) of the visible row whose label (dt) contains `label`. */
function rowValue(page: Page, label: string | RegExp): Locator {
  return page.locator("dt").filter({ visible: true }).filter({ hasText: label }).locator("xpath=following-sibling::dd[1]");
}

/** The tax row shows once the price was read again for the country: no read is then still on its way. */
async function priceSettled(page: Page) {
  await expect(page.locator("dt").filter({ visible: true }).filter({ hasText: "Tax (19%)" })).toBeVisible();
}

/** A 422 the way the API sends it (problem+json). */
function problem(errors: { field: string; code: string; message: string }[]) {
  return {
    status: 422,
    contentType: "application/problem+json",
    body: JSON.stringify({
      type: "about:blank",
      title: "Some fields are not valid.",
      status: 422,
      code: "VALIDATION_FAILED",
      detail: "Some fields are not valid.",
      requestId: "req-e2e-qty",
      errors,
    }),
  };
}

const isCreate = (request: { method(): string; url(): string }) => request.method() === "POST" && request.url().endsWith("/store/v1/checkout-sessions");

/** The values of the radio buttons of a group, in order (call it after the count is known). */
const radioValues = (radios: Locator) => radios.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));

test.describe("one control per mode", () => {
  test("range: a bounded number box, 60 is refused in words, 3 is posted, the review page shows the session's own totals", async ({ page, request }) => {
    const { range } = fixtures();
    const row = await apiService(request, range.slug);
    expect(row.quantity).toMatchObject({ min: 2, max: 50, options: [] });

    await openCheckout(page, `/en/checkout?service=${range.slug}`, { rule: "2 to 50 per order" });
    const drawer = await openDrawer(page);
    const box = drawer.getByRole("spinbutton", { name: "Quantity" });
    await expect(box).toHaveAttribute("min", "2");
    await expect(box).toHaveAttribute("max", "50");
    await expect(box).toHaveAttribute("step", "1");
    await expect(box).toHaveValue("2"); // the default is the smallest allowed quantity
    await expect(drawer.getByRole("radio")).toHaveCount(0);

    await drawer.getByLabel("IMEI number").fill(IMEI);
    await box.fill("60");
    await saveDrawer(drawer);
    await expect(drawer.getByText("Enter a quantity from 2 to 50.")).toBeVisible();
    await expect(box).toBeFocused(); // focus goes to the first error
    await expect(drawer).toBeVisible(); // nothing was saved

    await box.fill("3");
    await expect(drawer.getByText("Enter a quantity from 2 to 50.")).toHaveCount(0);
    await saveDrawer(drawer);
    await expect(drawer).toBeHidden();

    await fillBuyer(page);
    await priceSettled(page);
    // Before the session: per-unit price, the subtotal of the units and an estimate.
    await expect(page.getByText("Quantity: 3")).toBeVisible();
    await expect(rowValue(page, "Price per unit")).toHaveText(dollars(row.price.net));
    await expect(rowValue(page, "Subtotal (3 units)")).toHaveText(dollars(row.price.net, 3));
    await expect(rowValue(page, "Estimated total")).toHaveText(/^\$\d/);
    await expect(page.getByText("Total", { exact: true })).toHaveCount(0); // above one unit the total is an estimate

    const create = page.waitForRequest(isCreate);
    await page.getByRole("button", { name: "Continue to payment" }).click();
    expect((await create).postDataJSON()).toMatchObject({ serviceId: range.id, quantity: 3 });

    await expect(page).toHaveURL(/\/en\/checkout\/[A-Za-z0-9_-]{16,}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Review and pay" })).toBeVisible();
    // The review page shows the session's own totals under the plural subtotal label (Next keeps the previous page hidden
    // in the DOM, so every lookup is of the visible rows).
    const token = new URL(page.url()).pathname.split("/").pop() ?? "";
    const session = await apiSession(request, token);
    expect(session.quantity).toBe(3);
    await expect(rowValue(page, "Subtotal (3 units)")).toHaveText(dollars(session.amounts.display.net));
    await expect(rowValue(page, "Tax (19%)")).toHaveText(dollars(session.amounts.display.tax));
    await expect(rowValue(page, "Total to pay")).toHaveText(dollars(session.amounts.display.gross));
  });

  test("packs: only the packs, no number box, choosing 10 posts quantity 10", async ({ page, request }) => {
    const { packs } = fixtures();
    const row = await apiService(request, packs.slug);
    expect(row.quantity.options).toEqual([5, 10, 25]);

    await openCheckout(page, `/en/checkout?service=${packs.slug}`, { rule: "Packs of 5, 10, 25" });
    const drawer = await openDrawer(page);
    const radios = drawer.getByRole("radio");
    await expect(radios).toHaveCount(3);
    expect(await radioValues(radios)).toEqual(["5", "10", "25"]);
    await expect(drawer.getByRole("spinbutton")).toHaveCount(0);
    await expect(drawer.getByRole("radio", { name: "5", exact: true })).toBeChecked(); // the smallest pack is the default

    // The radio input is visually hidden: click its card.
    await drawer.locator("label").filter({ hasText: /^10$/ }).click();
    await expect(drawer.getByRole("radio", { name: "10", exact: true })).toBeChecked();
    await drawer.getByLabel("IMEI number").fill(IMEI);
    await saveDrawer(drawer);
    await expect(drawer).toBeHidden();

    await fillBuyer(page);
    await priceSettled(page);
    await expect(page.getByText("Quantity: 10")).toBeVisible();
    await expect(rowValue(page, "Subtotal (10 units)")).toHaveText(dollars(row.price.net, 10));

    const create = page.waitForRequest(isCreate);
    await page.getByRole("button", { name: "Continue to payment" }).click();
    expect((await create).postDataJSON()).toMatchObject({ serviceId: packs.id, quantity: 10 });
    await expect(page).toHaveURL(/\/en\/checkout\/[A-Za-z0-9_-]{16,}$/);
    await expect(rowValue(page, "Subtotal (10 units)")).toBeVisible();
  });

  test("exactly N: no control, the line '5 per order', and 5 is posted", async ({ page, request }) => {
    const { exact } = fixtures();
    const row = await apiService(request, exact.slug);
    expect(row.quantity).toMatchObject({ min: 5, max: 5, options: [] });

    await openCheckout(page, `/en/checkout?service=${exact.slug}`, { rule: "5 per order" });
    const drawer = await openDrawer(page);
    await expect(drawer.getByRole("spinbutton")).toHaveCount(0);
    await expect(drawer.getByRole("radio")).toHaveCount(0);
    await expect(drawer.getByRole("combobox")).toHaveCount(0);
    await expect(drawer.getByText("5 per order")).toBeVisible();
    await drawer.getByLabel("IMEI number").fill(IMEI);
    await saveDrawer(drawer);
    await expect(drawer).toBeHidden();

    await fillBuyer(page);
    await priceSettled(page);
    await expect(page.getByText("Quantity: 5")).toBeVisible();
    await expect(rowValue(page, "Subtotal (5 units)")).toHaveText(dollars(row.price.net, 5));

    const create = page.waitForRequest(isCreate);
    await page.getByRole("button", { name: "Continue to payment" }).click();
    expect((await create).postDataJSON()).toMatchObject({ serviceId: exact.id, quantity: 5 });
    await expect(page).toHaveURL(/\/en\/checkout\/[A-Za-z0-9_-]{16,}$/);
  });
});

test.describe("a refused quantity", () => {
  test("the server refuses a pack: the text comes from the rule read again, and the control is redrawn with the new packs", async ({ page }) => {
    const { packs } = fixtures();
    const changed: Rule = { min: 20, max: 40, options: [20, 40] };
    let rule: Rule | null = null;
    let posts = 0;
    await page.route("**/store/v1/checkout-sessions", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      posts += 1;
      rule = changed; // the rule changed under the buyer: every read of the service from now on says so
      return route.fulfill(problem([{ field: "quantity", code: "invalid_quantity", message: SERVER_TEXT }]));
    });
    await page.route(new RegExp(`/store/v1/services/${packs.slug}(\\?|$)`), async (route) => {
      if (!rule) return route.fallback();
      const response = await route.fetch();
      return route.fulfill({ response, json: { ...(await response.json()), quantity: rule } });
    });

    await openCheckout(page, `/en/checkout?service=${packs.slug}`, { rule: "Packs of 5, 10, 25" });
    const drawer = await openDrawer(page);
    await drawer.locator("label").filter({ hasText: /^10$/ }).click();
    await drawer.getByLabel("IMEI number").fill(IMEI);
    await saveDrawer(drawer);
    await expect(drawer).toBeHidden();
    await fillBuyer(page);
    await priceSettled(page); // the read for the country is over before the rule changes

    const create = page.waitForRequest(isCreate);
    await page.getByRole("button", { name: "Continue to payment" }).click();
    expect((await create).postDataJSON()).toMatchObject({ quantity: 10 });

    // The drawer opens on the packs of today's rule; the server's own English sentence is not shown.
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("Choose one of these quantities: 20, 40.")).toBeVisible();
    await expect(page.getByText("Choose one of the quantities this service sells")).toHaveCount(0);
    const radios = drawer.getByRole("radio");
    await expect(radios).toHaveCount(2);
    expect(await radioValues(radios)).toEqual(["20", "40"]);
    await expect(radios.first()).not.toBeChecked(); // the buyer chooses again
    await expect(radios.first()).toBeFocused();
    await expect(drawer.getByText("Packs of 20, 40")).toBeVisible();
    expect(posts).toBe(1);

    await drawer.locator("label").filter({ hasText: /^40$/ }).click();
    await expect(drawer.getByRole("radio", { name: "40", exact: true })).toBeChecked();
    await expect(drawer.getByText("Choose one of these quantities: 20, 40.")).toHaveCount(0);
    await saveDrawer(drawer);
    await expect(drawer).toBeHidden();
    await expect(page.getByText("Quantity: 40")).toBeVisible();
  });

  test("a refusal when the service cannot be read again: the text comes from the rule the form has", async ({ page, request }) => {
    const { range } = fixtures();
    const row = await apiService(request, range.slug);
    let failReads = false;
    await page.route("**/store/v1/checkout-sessions", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      failReads = true;
      return route.fulfill(problem([{ field: "quantity", code: "too_big", message: "Too big: expected number to be <=100000" }]));
    });
    await page.route(new RegExp(`/store/v1/services/${range.slug}(\\?|$)`), (route) =>
      failReads ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" }) : route.fallback(),
    );

    await openCheckout(page, `/en/checkout?service=${range.slug}`, { rule: "2 to 50 per order" });
    const drawer = await openDrawer(page);
    const box = drawer.getByRole("spinbutton", { name: "Quantity" });
    await box.fill("3");
    await drawer.getByLabel("IMEI number").fill(IMEI);
    await saveDrawer(drawer);
    await expect(drawer).toBeHidden();
    await fillBuyer(page);
    await priceSettled(page);

    await page.getByRole("button", { name: "Continue to payment" }).click();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("Enter a quantity from 2 to 50.")).toBeVisible();
    await expect(page.getByText("Too big")).toHaveCount(0);
    await expect(box).toHaveValue("3"); // a range keeps what was typed
    await expect(box).toBeFocused();
    // The drawer header and the order summary name one per-unit price: the net, with no tax in it (Germany is chosen).
    await expect(drawer.getByText("per unit", { exact: true }).locator("xpath=..")).toContainText(dollars(row.price.net));
  });

  test("exactly N: the refusal sits on a named group, tied to its error text, and takes the focus", async ({ page }) => {
    const { exact } = fixtures();
    const changed: Rule = { min: 6, max: 6, options: [] };
    let rule: Rule | null = null;
    await page.route("**/store/v1/checkout-sessions", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      rule = changed; // the rule changed under the buyer: every read of the service from now on says so
      return route.fulfill(problem([{ field: "quantity", code: "invalid_quantity", message: SERVER_TEXT }]));
    });
    await page.route(new RegExp(`/store/v1/services/${exact.slug}(\\?|$)`), async (route) => {
      if (!rule) return route.fallback();
      const response = await route.fetch();
      return route.fulfill({ response, json: { ...(await response.json()), quantity: rule } });
    });

    await openCheckout(page, `/en/checkout?service=${exact.slug}`, { rule: "5 per order" });
    const drawer = await openDrawer(page);
    await drawer.getByLabel("IMEI number").fill(IMEI);
    await saveDrawer(drawer);
    await expect(drawer).toBeHidden();
    await fillBuyer(page);
    await priceSettled(page); // the read for the country is over before the rule changes

    const create = page.waitForRequest(isCreate);
    await page.getByRole("button", { name: "Continue to payment" }).click();
    expect((await create).postDataJSON()).toMatchObject({ quantity: 5 });

    // There is no control to focus, so the line itself is a named group: its name is the field label and the refusal is
    // its description. The words come from the rule read again, never from the server's English sentence.
    await expect(drawer).toBeVisible();
    const group = drawer.getByRole("group", { name: "Quantity", exact: true });
    await expect(group).toContainText("6 per order");
    await expect(group).toBeFocused();
    await expect(group).toHaveAccessibleDescription("This service sells 6 per order.");
    await expect(page.getByText("Choose one of the quantities this service sells")).toHaveCount(0);
  });

  test("an in-stock service: the refusal shows the new packs and the stock hint, and not the server's sentence", async ({ page, request }) => {
    const { stocked } = fixtures();
    const row = await apiService(request, stocked.slug);
    expect(row.availability).toBe("in_stock");
    const t = checkout.start;

    const changed: Rule = { min: 20, max: 40, options: [20, 40] };
    let rule: Rule | null = null;
    await page.route("**/store/v1/checkout-sessions", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      rule = changed;
      return route.fulfill(problem([{ field: "quantity", code: "invalid_quantity", message: SERVER_TEXT }]));
    });
    await page.route(new RegExp(`/store/v1/services/${stocked.slug}(\\?|$)`), async (route) => {
      if (!rule) return route.fallback();
      const response = await route.fetch();
      return route.fulfill({ response, json: { ...(await response.json()), quantity: rule } });
    });

    await openCheckout(page, `/en/checkout?service=${stocked.slug}`);
    const drawer = await openDrawer(page);
    await drawer.getByLabel(t.drawer.imei).fill(IMEI);
    await saveDrawer(drawer);
    await expect(drawer).toBeHidden();
    await fillBuyer(page);
    await priceSettled(page);

    await page.getByRole("button", { name: t.summary.continue }).click();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("Choose one of these quantities: 20, 40.")).toBeVisible();
    const radios = drawer.getByRole("radio");
    await expect(radios).toHaveCount(2);
    expect(await radioValues(radios)).toEqual(["20", "40"]);
    await expect(drawer).toContainText("Packs of 20, 40");
    await expect(drawer).toContainText("Instant delivery while stock lasts"); // an in-stock service sold in packs
    await expect(drawer).not.toContainText("Choose one of the quantities this service sells");
  });
});

test.describe("the quantity survives a restart", () => {
  test("a resumed checkout opens with the same quantity; a quantity the rule no longer allows falls back with a notice", async ({ page, request }) => {
    const { packs } = fixtures();
    const token = await createSession(request, { serviceId: packs.id, quantity: 10 });

    await page.goto(`/en/checkout/resume?token=${token}`);
    const link = page.getByRole("link", { name: "Start a new checkout at today's price" });
    await expect(link).toHaveAttribute("href", `/en/checkout?service=${packs.slug}&quantity=10`);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/en/checkout\\?service=${packs.slug}&quantity=10$`));
    await expect(page.getByRole("button", { name: "Continue to payment" })).toBeEnabled();
    await expect(page.getByText("Quantity: 10")).toBeVisible();
    await expect(page.getByText("The quantities this service sells have changed.")).toHaveCount(0);
    const drawer = await openDrawer(page);
    await expect(drawer.getByRole("radio", { name: "10", exact: true })).toBeChecked();
    await drawer.getByRole("button", { name: "Cancel" }).click();

    // 7 is not one of the packs: the default is chosen and the buyer is told.
    await openCheckout(page, `/en/checkout?service=${packs.slug}&quantity=7`, { rule: "Packs of 5, 10, 25" });
    await expect(page.getByText("The quantities this service sells have changed. We chose an allowed one.")).toBeVisible();
    await expect(page.getByText("Quantity: 5")).toBeVisible();
    const again = await openDrawer(page);
    await expect(again.getByRole("radio", { name: "5", exact: true })).toBeChecked();
  });

  test("an expired review page restarts the checkout with its quantity", async ({ page, request }) => {
    const { packs } = fixtures();
    const token = await createSession(request, { serviceId: packs.id, quantity: 10 });
    // The page counts the lock down by the browser's clock: jump 31 minutes ahead instead of waiting for it.
    await page.clock.install();
    await page.goto(`/en/checkout/${token}`);
    await expect(page.getByRole("heading", { level: 1, name: "Review and pay" })).toBeVisible();
    await expect(rowValue(page, "Subtotal (10 units)")).toBeVisible();
    await page.clock.fastForward("31:00");
    await expect(page.getByText("This checkout has expired")).toBeVisible();
    await expect(page.getByRole("link", { name: "Start again" })).toHaveAttribute("href", `/en/checkout?service=${packs.slug}&quantity=10`);
  });
});
