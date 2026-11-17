// Merchant portal core, end to end against the isolated demo backend (m1 ops@zainmobilehub.example is active with a
// wallet; m18 ops@algiersservice.example is pending approval). The flows place REAL orders and invoices in the
// isolated database: IMEIs are generated per run so a second run never trips the "duplicate open order" rule.
// The backend can end a session at any time (other test runs sign in as the same merchant), so every navigation goes
// through `go()`, which signs in again when it lands on the sign-in page.
import { expect, test } from "./fixtures";
import { type Locator, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import { ACCOUNTS, BASE_URL, fixtures, signInMerchant } from "./helpers";

/** A valid 1x1 PNG: a stand-in for a bank receipt. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64");

/** A random 15-digit IMEI with a correct Luhn check digit. */
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

async function go(page: Page, path: string, account: { email: string; password: string } = ACCOUNTS.merchant) {
  await page.goto(path);
  if (new URL(page.url()).pathname.endsWith("/sign-in")) {
    await signInMerchant(page, account);
    await page.goto(path);
  }
}

/** The main landmark of the workspace (the header search and the wallet pill live outside it). */
const main = (page: Page) => page.getByRole("main");

/** Lists render a table from `md` up and a compact list below: only the visible copy counts. */
const vis = (locator: Locator) => locator.filter({ visible: true });

/** Waits until React has attached to the order form: a controlled input filled before that is reset when it does. */
async function formReady(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const control = document.querySelector("main form input, main form select");
        return Boolean(control) && Object.keys(control as object).some((key) => key.startsWith("__reactProps"));
      }),
    )
    .toBe(true);
}

/** The merchant's price of a service as the API states it (prices differ per merchant). */
async function priceOf(page: Page, serviceId: number): Promise<string> {
  const res = await page.request.get(`/client/services/${serviceId}`);
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { price: string }).price;
}

/** `price x quantity` as the form shows it, worked out in whole cents so no float error creeps in. */
function usdTotal(price: string, quantity: number): string {
  const cents = Math.round(Number(price) * 100) * quantity;
  return "$" + (cents / 100).toFixed(2);
}

test.beforeEach(async ({ page }) => {
  await signInMerchant(page);
});

test.describe("dashboard", () => {
  test("shows the wallet balance, the order counts and the latest orders from the API", async ({ page }) => {
    await go(page, "/en/merchant");
    const dash = await (await page.request.get("/client/dashboard")).json();
    const usd = (amount: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(amount));

    await expect(main(page).getByRole("heading", { level: 1 })).toContainText("Welcome back,");
    await expect(main(page).getByText(usd(dash.wallet.available)).first()).toBeVisible();
    const total = dash.counts.pending + dash.counts.processing + dash.counts.completed + dash.counts.rejected;
    await expect(main(page).getByRole("link", { name: new RegExp(`Total orders\\s*${total}`) })).toBeVisible();
    await expect(main(page).getByRole("link", { name: "Add funds" })).toHaveAttribute("href", "/en/merchant/wallet/top-up");
    await expect(main(page).getByRole("link", { name: "New order" })).toHaveAttribute("href", "/en/merchant/services");
    await expect(vis(main(page).getByRole("link", { name: /^Open order \d+$/ })).first()).toBeVisible();
    // The quick order form goes to the catalog with ?q=.
    await main(page).getByRole("searchbox", { name: "Search services" }).fill("unlock");
    await main(page).getByRole("button", { name: "Start order" }).click();
    await expect(page).toHaveURL(/\/en\/merchant\/services\?q=unlock/);
  });

  test("the rail keeps all its links on its dark panel in a short laptop window", async ({ page, isMobile }) => {
    test.skip(isMobile, "the rail shows from lg up");
    // Regression (2026-11-15): at 1366×657 (a 1366×768 laptop's browser window) the last links and Settings spilled
    // below the rail, white on the light page.
    for (const height of [657, 620]) {
      await page.setViewportSize({ width: 1366, height });
      await go(page, "/en/merchant");
      const rail = vis(page.getByRole("navigation", { name: "Workspace navigation" }));
      await expect(rail.getByRole("link")).toHaveCount(11); // ten plus Support (feature 28)
      const fit = await rail.evaluate((nav) => ({
        panelBottom: nav.parentElement!.getBoundingClientRect().bottom,
        lowestLink: Math.max(...[...nav.querySelectorAll("a")].map((a) => a.getBoundingClientRect().bottom)),
        window: window.innerHeight,
      }));
      expect(fit.lowestLink, `${height}px`).toBeLessThanOrEqual(fit.panelBottom);
      expect(fit.lowestLink, `${height}px`).toBeLessThanOrEqual(fit.window);
    }
  });
});

test.describe("catalog", () => {
  test("lists the merchant's prices and filters by search, type and category", async ({ page }) => {
    await go(page, "/en/merchant/services");
    const all = await (await page.request.get("/client/services?_end=1000")).json();
    await expect(main(page).getByText(`${all.length} results`)).toBeVisible();

    // A price on the page is the API's price for this merchant.
    const first = all.find((s: { name: string }) => s.name === "Apple Warranty & Activation Date");
    await expect(vis(main(page).getByRole("link", { name: first.name })).first()).toBeVisible();

    await main(page).getByRole("searchbox", { name: "Search services" }).fill("vodafone");
    await main(page).getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/q=vodafone/);
    await expect(main(page).getByText("1 result")).toBeVisible();

    await go(page, "/en/merchant/services");
    await main(page).getByRole("link", { name: "File service", exact: true }).click();
    await expect(page).toHaveURL(/type=file/);
    await expect(main(page).getByText("4 results")).toBeVisible();
  });

  test("exports the price list as CSV", async ({ page }) => {
    await go(page, "/en/merchant/services?type=imei");
    const [download] = await Promise.all([page.waitForEvent("download"), main(page).getByRole("button", { name: "Export prices (CSV)" }).click()]);
    expect(download.suggestedFilename()).toBe("price-list.csv"); // the name the API sends in Content-Disposition
    const text = await fs.readFile((await download.path())!, "utf8");
    expect(text.split(/\r?\n/)[0]).toBe("serviceId,code,name,type,category,price,currency,deliveryTime");
    expect(text).toContain(",imei,");
    expect(text).not.toContain(",server,");
  });
});

test.describe("ordering", () => {
  test("places an IMEI order, finds it in orders and the statement, and cancels it when the API allows", async ({ page }) => {
    const imei = randomImei();
    await go(page, "/en/merchant/services/1");
    const input = main(page).getByRole("textbox", { name: /^IMEI/ });
    const place = main(page).getByRole("button", { name: /^Place order/ });

    // Early feedback: a wrong check digit never leaves the browser.
    await input.fill("123456789012345");
    await place.click();
    await expect(main(page).getByText("does not pass the check-digit test").first()).toBeVisible();
    await expect(input).toBeFocused();

    await input.fill(imei);
    await expect(main(page).getByText("This IMEI is valid.")).toBeVisible();
    await expect(place).toContainText("$0.10");
    await place.click();
    await page.waitForURL(/\/en\/merchant\/orders\/(\d+)$/);
    const id = page.url().match(/orders\/(\d+)$/)![1];

    await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(`Order #${id}`);
    await expect(vis(main(page).getByText(imei)).first()).toBeVisible();
    await expect(vis(main(page).getByText("$0.10")).first()).toBeVisible();

    // The same open order again: the API refuses a duplicate (409 DUPLICATE_ORDER) and we link to the first one.
    await go(page, "/en/merchant/services/1");
    await main(page).getByRole("textbox", { name: /^IMEI/ }).fill(imei);
    await main(page).getByRole("button", { name: /^Place order/ }).click();
    await expect(main(page).getByText("You already have this order open")).toBeVisible();
    await expect(main(page).getByRole("link", { name: `View order #${id}` })).toHaveAttribute("href", `/en/merchant/orders/${id}`);
    await expect(main(page).getByRole("button", { name: /^Place order/ })).toBeEnabled(); // usable again after an error

    // It is in the orders list and in the statement.
    await go(page, `/en/merchant/orders?q=${imei}`);
    await expect(vis(main(page).getByRole("link", { name: `Open order ${id}` })).first()).toBeVisible();
    await go(page, "/en/merchant/wallet");
    await expect(vis(main(page).getByText(`Hold for ORD-${id}`)).first()).toBeVisible();

    // Cancel: the button exists only while the API says the order can still be cancelled.
    await go(page, `/en/merchant/orders/${id}`);
    const cancel = main(page).getByRole("button", { name: "Cancel order" });
    if (await cancel.isVisible()) {
      await cancel.click();
      await page.getByRole("dialog").getByRole("button", { name: "Yes, cancel the order" }).click();
      // Either it is cancelled, or the API says it was already sent (a worker picks orders up within seconds).
      await expect(page.getByText("Order cancelled").or(page.getByRole("dialog").getByRole("alert"))).toBeVisible();
    } else {
      test.info().annotations.push({ type: "note", description: "canCancel was already false" });
    }
  });

  test("bulk IMEIs: per-line errors, an exact live total, all orders placed together", async ({ page }) => {
    const [a, b] = [randomImei(), randomImei()];
    await go(page, "/en/merchant/services/1");
    await main(page).getByRole("radio", { name: "Several IMEIs" }).click();
    const list = main(page).getByRole("textbox", { name: /^IMEI list/ });
    await list.fill(`${a}\n\n12345\n${b}`);
    await expect(main(page).getByText("2 IMEIs ready · 1 to fix")).toBeVisible(); // live, no layout shift on blur
    await main(page).getByRole("button", { name: /^Place order/ }).click();
    await expect(main(page).getByText("Line 3: not a valid IMEI.")).toBeVisible(); // numbering counts blank lines
    await expect(list).toBeFocused();

    await list.fill(`${a}\n${b}`);
    await expect(main(page).getByText("2 IMEIs ready")).toBeVisible();
    const place = main(page).getByRole("button", { name: /^Place order/ });
    await expect(place).toContainText("$0.20"); // 2 × $0.10, exact
    await place.click();
    await page.waitForURL(/\/en\/merchant\/orders$/);
    await expect(vis(main(page).getByText(a)).first()).toBeVisible();
    await expect(vis(main(page).getByText(b)).first()).toBeVisible();
  });

  test("custom field: required, then the result code of an instant order", async ({ page }) => {
    const account = `e2e-${Date.now()}@example.com`;
    await go(page, "/en/merchant/services/15");
    const field = main(page).getByRole("textbox", { name: /^Z3X account/ });
    const place = main(page).getByRole("button", { name: /^Place order/ });
    await place.click();
    await expect(main(page).getByText("This field is required.")).toBeVisible();
    await expect(field).toBeFocused();
    await field.fill(account);
    await place.click();
    await page.waitForURL(/\/en\/merchant\/orders\/\d+$/);
    await expect(main(page).getByText("Details you provided")).toBeVisible();
    await expect(main(page).getByText(account).first()).toBeVisible();
    await expect(main(page).getByText(/Z3X-\d+/).first()).toBeVisible(); // filled from stock: the result is there at once
  });

  test("file service: the upload is required and travels as the input file", async ({ page }) => {
    await go(page, "/en/merchant/services/24");
    const place = main(page).getByRole("button", { name: /^Place order/ });
    await place.click();
    await expect(main(page).getByText("Attach the file this service needs.").first()).toBeVisible();
    await main(page).locator('input[type="file"]').setInputFiles({ name: `combo-${Date.now()}.png`, mimeType: "image/png", buffer: PNG });
    await expect(main(page).getByText(/combo-\d+\.png/)).toBeVisible();
    await place.click();
    await page.waitForURL(/\/en\/merchant\/orders\/\d+$/);
    const link = main(page).getByRole("link", { name: "Download file" }).first();
    await expect(link).toHaveAttribute("href", /^\/client\/files\/\d+$/);
  });
});

test.describe("quantity rules (the three services the global setup configured, nothing is ordered)", () => {
  const place = (page: Page) => main(page).getByRole("button", { name: /^Place order/ });

  test("packs: the page says the packs, the form offers only them and totals the chosen pack", async ({ page }) => {
    const { packs } = fixtures();
    const price = await priceOf(page, packs.id);
    await go(page, `/en/merchant/services/${packs.id}`);
    await expect(main(page).getByText("Packs of 5, 10, 25")).toBeVisible();
    await formReady(page);

    const select = main(page).getByRole("combobox", { name: /^Quantity/ });
    await expect(select.locator("option")).toHaveText(["5", "10", "25"]);
    await expect(select).toHaveValue("5");
    await expect(place(page)).toContainText(usdTotal(price, 5));
    await select.selectOption("10");
    await expect(place(page)).toContainText(usdTotal(price, 10));
    // No free number box next to the packs.
    await expect(main(page).getByRole("textbox", { name: /^Quantity/ })).toHaveCount(0);
  });

  test("a range: a number box with the rule as its hint, a quantity outside it is refused before anything is sent, Arabic digits are read", async ({ page }) => {
    const { range } = fixtures();
    const price = await priceOf(page, range.id);
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/client/orders") posts.push(request.url());
    });
    await go(page, `/en/merchant/services/${range.id}`);
    await expect(main(page).getByText("2 to 50 per order")).toHaveCount(2); // the details card and the hint under the box
    await formReady(page);

    const quantity = main(page).getByRole("textbox", { name: /^Quantity/ });
    await expect(quantity).toHaveValue("2");
    await main(page).getByRole("textbox", { name: /^IMEI/ }).fill(randomImei());
    await quantity.fill("1");
    await place(page).click();
    await expect(main(page).getByText("Enter a quantity from 2 to 50.")).toBeVisible();
    await expect(quantity).toHaveAttribute("aria-invalid", "true");
    await expect(quantity).toBeFocused();
    expect(posts).toHaveLength(0);

    await quantity.fill("٧");
    await expect(place(page)).toContainText(usdTotal(price, 7));
    await expect(main(page).getByText("Enter a quantity from 2 to 50.")).toHaveCount(0);
  });

  test("an exact N: nothing to choose, the total is N units", async ({ page }) => {
    const { exact } = fixtures();
    const price = await priceOf(page, exact.id);
    await go(page, `/en/merchant/services/${exact.id}`);
    await expect(main(page).getByText("5 per order")).toBeVisible();
    await formReady(page);
    await expect(main(page).getByRole("combobox", { name: /^Quantity/ })).toHaveCount(0);
    await expect(main(page).getByRole("textbox", { name: /^Quantity/ })).toHaveCount(0);
    await expect(place(page)).toContainText(usdTotal(price, 5));
  });
});

test.describe("orders", () => {
  test("tabs, search and the CSV export use only what the API declares", async ({ page }) => {
    await go(page, "/en/merchant/orders");
    await main(page).getByRole("link", { name: "Completed", exact: true }).click();
    await expect(page).toHaveURL(/status=completed/);
    // The total under the list is the API's total for this filter.
    const completed = Number((await page.request.get("/client/orders?_start=0&_end=1&status=completed")).headers()["x-total-count"]);
    await expect(main(page).getByText(new RegExp(`^${completed} results?`))).toBeVisible();
    await expect(vis(main(page).getByRole("link", { name: /^Open order \d+$/ })).first()).toBeVisible();

    // Filter row: type + date range + search all reach the API (a wrong parameter would be a 422 error page).
    await go(page, "/en/merchant/orders?status=completed&type=imei&from=2020-01-01&to=2030-01-01&q=unlock&sort=total_desc");
    await expect(main(page).getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
    await expect(main(page).getByText("We could not load this page")).toHaveCount(0);

    const [download] = await Promise.all([page.waitForEvent("download"), main(page).getByRole("button", { name: "Export CSV" }).click()]);
    expect(download.suggestedFilename()).toBe("orders.csv");
    const text = await fs.readFile((await download.path())!, "utf8");
    expect(text.split(/\r?\n/)[0]).toBe("id,created,service,input,quantity,status,price,currency");
  });

  test("an order of another merchant or a bad id is a 404", async ({ page }) => {
    await go(page, "/en/merchant/orders/1");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await go(page, "/en/merchant/orders/abc");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});

test.describe("wallet, top-up and invoices", () => {
  test("wallet shows the balances and the statement, and downloads it as CSV", async ({ page }) => {
    await go(page, "/en/merchant/wallet");
    const wallet = await (await page.request.get("/client/wallet")).json();
    const usd = (amount: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(amount));
    await expect(main(page).getByText(usd(wallet.balance)).first()).toBeVisible();
    await expect(main(page).getByText(usd(wallet.reserved)).first()).toBeVisible();
    await expect(main(page).getByText(usd(wallet.creditLimit)).first()).toBeVisible();
    await expect(main(page).getByText("If you just paid online")).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), main(page).getByRole("button", { name: "Download statement (CSV)" }).click()]);
    const text = await fs.readFile((await download.path())!, "utf8");
    expect(text.split(/\r?\n/)[0]).toBe("createdAt,transactionId,kind,memo,amount,balanceAfter");
  });

  test("manual top-up: exact preview, invoice with instructions, receipt upload, payment pending", async ({ page }) => {
    await go(page, "/en/merchant/wallet/top-up");
    await main(page).getByText("Bank transfer", { exact: true }).click();
    await expect(main(page).getByRole("radio", { name: /Bank transfer/ })).toBeChecked();
    const amount = main(page).getByRole("textbox", { name: /^Amount/ });
    await amount.fill("20");
    await main(page).getByRole("button", { name: "Continue" }).click();
    await expect(main(page).getByText("The minimum for this method is")).toBeVisible(); // bank: min $50

    await amount.fill("250.5");
    await expect(main(page).getByText("Added to your wallet")).toBeVisible();
    await expect(main(page).getByText("$250.50").first()).toBeVisible(); // bank has no fee: amount = net
    await main(page).getByRole("button", { name: "Continue" }).click();

    await page.waitForURL(/\/en\/merchant\/invoices\/\d+$/);
    await expect(main(page).getByRole("heading", { level: 1 })).toContainText("Invoice INV-");
    await expect(main(page).getByText("Payment instructions")).toBeVisible();
    await expect(main(page).getByText("Unpaid").first()).toBeVisible();

    // Receipt: a bad type is refused in the browser, a PNG goes through.
    const file = main(page).locator('input[type="file"]');
    await file.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("x") });
    await expect(main(page).getByText("This file type is not accepted.")).toBeVisible();
    await main(page).getByRole("button", { name: "Send receipt" }).click();
    await expect(main(page).getByText("Attach your receipt.")).toBeVisible();
    await file.setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
    await expect(main(page).getByText("receipt.png")).toBeVisible();
    await main(page).getByRole("textbox", { name: /^Payment reference/ }).fill(`E2E-${Date.now()}`);
    await main(page).getByRole("button", { name: "Send receipt" }).click();

    // The page reloads with the receipt waiting for review instead of the form.
    await expect(main(page).getByText("Your receipt is being reviewed")).toBeVisible();
    await expect(main(page).getByText("Pending review")).toBeVisible();
    await expect(main(page).getByRole("link", { name: "View receipt" })).toHaveAttribute("href", /^\/client\/files\/\d+$/);
    await expect(main(page).getByRole("button", { name: "Send receipt" })).toHaveCount(0);
  });

  test("invoices: counts per status, filters, preview and detail", async ({ page }) => {
    await go(page, "/en/merchant/invoices");
    const count = async (status: string) => Number((await page.request.get(`/client/invoices?_start=0&_end=1&status=${status}`)).headers()["x-total-count"]);
    await expect(main(page).getByRole("link", { name: new RegExp(`Paid invoices\\s*${await count("paid")}`) })).toBeVisible();
    await expect(main(page).getByRole("link", { name: new RegExp(`Voided invoices\\s*${await count("void")}`) })).toBeVisible();

    await go(page, "/en/merchant/invoices?status=paid&kind=topup&sort=total_desc&q=INV");
    await expect(main(page).getByText("We could not load this page")).toHaveCount(0);
    await expect(vis(main(page).getByRole("link", { name: /INV-\d+/ })).first()).toBeVisible();

    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 1280) {
      // The preview panel follows ?selected=.
      const rows = await (await page.request.get("/client/invoices?status=paid&kind=topup")).json();
      const second = rows[1];
      await page.getByRole("link", { name: `Preview invoice ${second.number}` }).click();
      await expect(page).toHaveURL(new RegExp(`selected=${second.id}`));
      await expect(page.getByRole("complementary").getByText(`Invoice ${second.number}`)).toBeVisible();
    }
    await vis(main(page).getByRole("link", { name: /INV-\d+/ })).first().click();
    await expect(main(page).getByRole("heading", { level: 1 })).toContainText("Invoice INV-");
    await expect(main(page).getByRole("heading", { name: "Payments" })).toBeVisible();
  });
});

test.describe("refusals from the API (answers mocked in the browser)", () => {
  /** Answers the next POSTs to a /client path with a problem+json error (what the API sends, handoff §3.3). */
  async function refuse(page: Page, glob: string, status: number, body: Record<string, unknown>) {
    await page.route(glob, (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status, contentType: "application/problem+json", headers: { "x-request-id": "req-e2e-1" }, body: JSON.stringify({ type: "x", title: "x", status, requestId: "req-e2e-1", ...body }) })
        : route.continue(),
    );
  }
  const place = (page: Page) => main(page).getByRole("button", { name: /^Place order/ });
  const alert = (page: Page, text: string) => main(page).getByRole("alert").filter({ hasText: text });

  test("PRICE_CHANGED shows both prices and offers to reload the price", async ({ page }) => {
    await refuse(page, "**/client/orders", 409, { code: "PRICE_CHANGED", listedPrice: "0.1000", currentPrice: "0.1100" });
    await go(page, "/en/merchant/services/1");
    await main(page).getByRole("textbox", { name: /^IMEI/ }).fill(randomImei());
    await place(page).click();
    await expect(alert(page, "The price changed")).toContainText(/You saw \u2066?\$0\.10/); // amounts are wrapped in bidi isolates
    await expect(alert(page, "The price changed")).toContainText(/\$0\.11/);
    await alert(page, "The price changed").getByRole("button", { name: "Reload price" }).click();
    await expect(alert(page, "The price changed")).toHaveCount(0); // gone once the service was re-read
    await expect(place(page)).toBeEnabled();
  });

  test("INSUFFICIENT_FUNDS links to the top-up page; SERVICE_DISABLED links back to the catalog", async ({ page }) => {
    await go(page, "/en/merchant/services/1");
    await refuse(page, "**/client/orders", 402, { code: "INSUFFICIENT_FUNDS" });
    await main(page).getByRole("textbox", { name: /^IMEI/ }).fill(randomImei());
    await place(page).click();
    await expect(alert(page, "Your balance is too low").getByRole("link", { name: "Add funds" })).toHaveAttribute("href", "/en/merchant/wallet/top-up");

    await page.unroute("**/client/orders");
    await refuse(page, "**/client/orders", 409, { code: "SERVICE_DISABLED" });
    await place(page).click();
    await expect(alert(page, "This service is unavailable").getByRole("link", { name: "Back to services" })).toHaveAttribute("href", "/en/merchant/services");
  });

  test("a 422 on imeis.N lands on the right textarea line, and inputs.<key> on its field", async ({ page }) => {
    await refuse(page, "**/client/orders", 422, {
      code: "VALIDATION_FAILED",
      errors: [{ field: "imeis.1", code: "invalid_imei", message: "English text from the API" }],
    });
    await go(page, "/en/merchant/services/1");
    await main(page).getByRole("radio", { name: "Several IMEIs" }).click();
    await main(page).getByRole("textbox", { name: /^IMEI list/ }).fill(`${randomImei()}\n\n${randomImei()}`);
    await place(page).click();
    await expect(main(page).getByText(/^Line 3: This IMEI does not pass the check-digit test/)).toBeVisible(); // item 1 = textarea line 3
    await expect(main(page).getByText("English text from the API")).toHaveCount(0); // translated by code, never raw

    await page.unroute("**/client/orders");
    await refuse(page, "**/client/orders", 422, { code: "VALIDATION_FAILED", errors: [{ field: "inputs.account", code: "custom", message: "x" }] });
    await go(page, "/en/merchant/services/15");
    await main(page).getByRole("textbox", { name: /^Z3X account/ }).fill("someone@example.com");
    await place(page).click();
    await expect(main(page).getByText("This value is not valid.")).toBeVisible();
    await expect(main(page).getByRole("textbox", { name: /^Z3X account/ })).toBeFocused();
  });

  test("a refused quantity (422 invalid_quantity) is worded from the pack list, never with the API's own sentence", async ({ page }) => {
    const { packs } = fixtures();
    await refuse(page, "**/client/orders", 422, {
      code: "VALIDATION_FAILED",
      errors: [{ field: "quantity", code: "invalid_quantity", message: "Choose one of the quantities this service sells: 5, 10, 25." }],
    });
    await go(page, `/en/merchant/services/${packs.id}`);
    await formReady(page);
    await main(page).getByRole("textbox", { name: /^IMEI/ }).fill(randomImei());
    await place(page).click();
    await expect(main(page).getByText("Choose one of these quantities: 5, 10, 25.")).toBeVisible();
    await expect(main(page).getByText("Choose one of the quantities this service sells")).toHaveCount(0);
    const select = main(page).getByRole("combobox", { name: /^Quantity/ });
    await expect(select).toHaveAttribute("aria-invalid", "true");
    await expect(select).toBeFocused();

    // Changing the quantity takes the message away.
    await select.selectOption("10");
    await expect(main(page).getByText("Choose one of these quantities: 5, 10, 25.")).toHaveCount(0);
  });

  test("top-up: a gateway error keeps the form and shows the reference; an automatic method goes to the payment page", async ({ page }) => {
    await go(page, "/en/merchant/wallet/top-up");
    await main(page).getByText("Crypto gateway", { exact: true }).click();
    await main(page).getByRole("textbox", { name: /^Amount/ }).fill("100");
    await expect(main(page).getByText("$1.00").first()).toBeVisible(); // 1% of $100, exact
    await expect(main(page).getByText("$99.00").first()).toBeVisible(); // net

    await refuse(page, "**/client/invoices", 502, { code: "GATEWAY_ERROR" });
    await main(page).getByRole("button", { name: "Continue" }).click();
    await expect(main(page).getByRole("alert")).toContainText("The payment provider did not respond");
    await expect(main(page).getByRole("alert")).toContainText("Reference: req-e2e-1");
    await expect(main(page).getByRole("button", { name: "Continue" })).toBeEnabled();

    await page.unroute("**/client/invoices");
    await page.route("**/client/invoices", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ invoice: { id: 1, number: "INV-X" }, paymentUrl: "https://pay.example/checkout/abc" }) })
        : route.continue(),
    );
    await page.route("https://pay.example/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Payment provider</h1>" }));
    await main(page).getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("https://pay.example/checkout/abc");
  });

  test("a receipt the API refuses (409 CONFLICT) is explained", async ({ page }) => {
    await go(page, "/en/merchant/wallet/top-up");
    await main(page).getByText("Wise", { exact: true }).click();
    await main(page).getByRole("textbox", { name: /^Amount/ }).fill("75");
    await main(page).getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/\/en\/merchant\/invoices\/\d+$/);
    await refuse(page, "**/client/invoices/*/receipt", 409, { code: "CONFLICT" });
    await main(page).locator('input[type="file"]').setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
    await expect(main(page).getByText("receipt.png")).toBeVisible();
    await main(page).getByRole("button", { name: "Send receipt" }).click();
    await expect(alert(page, "A receipt cannot be added now")).toBeVisible();
  });
});

test.describe("a merchant waiting for approval", () => {
  test.beforeEach(async ({ page }) => {
    await signInMerchant(page, ACCOUNTS.pendingMerchant);
  });

  test("the dashboard is a waiting area with links to settings", async ({ page }) => {
    await go(page, "/en/merchant", ACCOUNTS.pendingMerchant);
    await expect(main(page).getByRole("heading", { name: "While you wait for approval" })).toBeVisible();
    await expect(main(page).getByRole("link", { name: "Complete your profile" })).toHaveAttribute("href", "/en/merchant/settings");
    await expect(main(page).getByRole("link", { name: "Secure your account" })).toHaveAttribute("href", "/en/merchant/settings/security");
    await expect(main(page).getByRole("link", { name: "Upload verification documents" })).toHaveAttribute("href", "/en/merchant/settings/verification");
    await expect(main(page).getByRole("link", { name: "New order" })).toHaveCount(0);
  });

  for (const path of ["/en/merchant/services", "/en/merchant/orders", "/en/merchant/wallet", "/en/merchant/wallet/top-up", "/en/merchant/invoices"]) {
    test(`${path} shows the "opens after approval" notice and keeps the session`, async ({ page }) => {
      await go(page, path, ACCOUNTS.pendingMerchant);
      await expect(main(page).getByText("Available after approval")).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${path}$`)); // not signed out
      await expect(page.getByText("Waiting for approval").first()).toBeVisible();
    });
  }
});

// ── Lists and frame (plan P1) ─────────────────────────────────────────────────────────────────────────────────────────
// The long lists render ONE table for every screen (a `compact` table: the real table from md up, short rows with the
// number as a link over the whole row on a phone), not a table plus a phone-only list. The frame is in the static shell
// and the phone menu opens before React hydrates. Read-only: the demo merchant is only looked at.

test.describe("lists: one table for every screen", () => {
  const lists = [
    { name: "orders", path: "/en/merchant/orders" },
    { name: "services", path: "/en/merchant/services" },
    { name: "invoices", path: "/en/merchant/invoices" },
  ];

  for (const list of lists) {
    test(`${list.name}: no second list at 1280 or 390 px, rows are short on a phone and each row is one link`, async ({ page }) => {
      for (const width of [1280, 390]) {
        const at = `${list.name} at ${width}px`;
        await page.setViewportSize({ width, height: 900 });
        await go(page, list.path);
        const rows = main(page).locator("tbody tr");
        await expect(rows.first(), at).toBeVisible();
        const count = await rows.count();
        expect(count, at).toBeGreaterThan(0);

        // Nothing is drawn twice: no phone-only list (the dashboard's latest orders still use one), every row is shown.
        await expect(main(page).locator("ul.divide-y"), at).toHaveCount(0);
        await expect(rows.filter({ visible: true }), at).toHaveCount(count);
        // Table semantics survive the phone layout (display: block): one table, with its column headers.
        await expect(main(page).getByRole("table"), at).toHaveCount(1);
        expect(await main(page).getByRole("columnheader").count(), at).toBeGreaterThan(2);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${at}: the page scrolls sideways`).toBeLessThanOrEqual(0);

        if (width === 1280) {
          await expect(main(page).getByRole("columnheader").first(), at).toBeVisible();
          continue;
        }
        // A phone row is a few lines (a stacked card was about eight), and a tap anywhere on it opens the record.
        const box = await rows.first().boundingBox();
        expect(box, at).not.toBeNull();
        expect(box!.height, `${at}: row height`).toBeGreaterThanOrEqual(56);
        expect(box!.height, `${at}: row height`).toBeLessThan(170);
        await rows.first().click({ position: { x: box!.width - 12, y: box!.height - 10 } });
        await expect(page, at).toHaveURL(new RegExp(`${list.path}/\\d+$`));
      }
    });
  }
});

test.describe("workspace frame", () => {
  test("phone: the menu button opens the drawer before React hydrates, Esc and the close button close it, focus returns", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Every client script is aborted (the CSS still loads), so React never hydrates; inline scripts still run, so the
    // streamed session parts show. A button that works now is the browser's own command, not an onClick.
    let aborted = 0;
    await page.route("**/_next/static/chunks/**", (route) => {
      if (route.request().resourceType() !== "script") return route.continue();
      aborted += 1;
      return route.abort();
    });
    await page.goto("/en/merchant/orders");
    expect(aborted, "no client script was blocked").toBeGreaterThan(0);

    const button = page.getByRole("button", { name: "Open navigation", exact: true });
    await expect(button).toHaveAttribute("aria-haspopup", "dialog");
    await button.click();
    const drawer = page.getByRole("dialog", { name: "Workspace navigation", exact: true });
    await expect(drawer).toBeVisible();
    expect(await drawer.evaluate((element) => element.matches(":modal"))).toBe(true);
    // All ten links and Settings: the merchant's own list (the static one shows the same before it is read).
    await expect(drawer.getByRole("link", { name: "Invoices", exact: true })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Settings", exact: true })).toBeVisible();

    await drawer.getByRole("button", { name: "Close", exact: true }).click();
    await expect(drawer).toBeHidden();
    await expect(button).toBeFocused();
    await button.click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(button).toBeFocused();
  });

  // FIXME(speed plan P1.4, 2026-11-15): the section title still streams (the shell has " " where "Orders" should be,
  // because the title comes from the active nav item, which reads the pathname inside a <Suspense>). Follow-up: put the
  // page's title in the static shell. The frame and the rest of this test hold.
  test.fixme("the static shell carries the frame and the section title and nothing personal", async ({ page }) => {
    // `next dev` renders the shell and the session parts in one pass: the split below needs a production build.
    test.skip(new URL(BASE_URL).port === "5175", "needs the production build (E2E_BASE_URL=http://localhost:5176)");
    const me = (await (await page.request.get("/client/auth/me")).json()) as { name?: string; email: string; company?: string };
    const html = await (await page.request.get("/en/merchant/orders")).text();
    // The session parts stream after the shell as hidden segments that a script moves into place.
    const streamed = html.search(/<div hidden id="S:\d+"/);
    expect(streamed, "the personal parts stream after the shell").toBeGreaterThan(0);
    const shell = html.slice(0, streamed);

    expect(shell).toContain('aria-label="Workspace navigation"');
    expect(shell).toContain("Merchant portal"); // the breadcrumb's area label
    expect(shell).toMatch(/<p class="[^"]*text-heading[^"]*">Orders<\/p>/); // the section title
    expect(shell).toContain('<main id="main"');
    expect(shell).toContain("Merchant account"); // the role, where the name will be
    expect(shell).toContain('aria-label="Open navigation"');

    // The merchant is in the streamed parts only.
    expect(html).toContain(me.name || me.email);
    expect(shell).not.toContain(me.email);
    if (me.name) expect(shell).not.toContain(me.name);
    if (me.company) expect(shell).not.toContain(me.company);
  });
});

// ── Rail and tab bar (owner, 2026-11-15) ──────────────────────────────────────────────────────────────────────────────
// The rail sits at the start edge (no centred frame), its selection slides to the page a click opens, a hovered icon
// shows its label beside the rail, the live badges add their words to the links' names, and below `lg` a tab bar holds
// the key destinations. Read-only: the demo merchant is only looked at.

test.describe("rail and tab bar", () => {
  /** The rail's nav landmark (the drawer's has the same name but is hidden while closed). */
  const rail = (page: Page) => vis(page.getByRole("navigation", { name: "Workspace navigation" }));

  test("the rail sits at the start edge of a wide screen, with no sideways scroll", async ({ page, isMobile }) => {
    test.skip(isMobile, "the rail shows from lg up");
    // Regression (2026-11-15): the frame was centred at 110rem, leaving a strip of about 70px before the rail at 1920px.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await go(page, "/en/merchant");
    const edges = await rail(page).evaluate((nav) => {
      const panel = nav.parentElement!.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      return { start: panel.left, overflow: document.documentElement.scrollWidth - width };
    });
    expect(edges.start, "room before the rail").toBeGreaterThanOrEqual(0);
    expect(edges.start, "room before the rail").toBeLessThanOrEqual(16.5); // the page padding only
    expect(edges.overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
  });

  test("a hovered icon shows its label beside the rail, and the selection moves to the page a click opens", async ({ page, isMobile }) => {
    test.skip(isMobile, "the rail shows from lg up");
    await page.setViewportSize({ width: 1440, height: 900 });
    await go(page, "/en/merchant");
    const nav = rail(page);
    // The indicator took over from the CSS-only look once the script ran.
    await expect(nav).toHaveAttribute("data-indicator", "");
    const invoices = nav.getByRole("link", { name: "Invoices", exact: true });

    await invoices.hover();
    const tip = invoices.locator(".rail-tip");
    await expect(tip).toHaveText("Invoices");
    await expect(tip).toHaveAttribute("aria-hidden", "true");
    await expect(tip).toHaveCSS("opacity", "1");
    // Beside the rail on the end side (right in English), clear of the dark panel.
    const [tipBox, panelBox] = await Promise.all([tip.boundingBox(), nav.evaluate((el) => el.parentElement!.getBoundingClientRect().right)]);
    expect(tipBox!.x).toBeGreaterThan(panelBox);

    await invoices.click();
    await expect(page).toHaveURL(/\/en\/merchant\/invoices$/);
    await expect(invoices).toHaveAttribute("aria-current", "page");
    // The indicator ends on the new link (it slid there; the test reads where it rests).
    await expect
      .poll(() =>
        nav.evaluate((el) => {
          const mark = el.querySelector<HTMLElement>(".ws-indicator")!;
          const link = el.querySelector<HTMLElement>('a[aria-current="page"]')!;
          const y = parseFloat(getComputedStyle(mark).translate.split(" ")[1] ?? "0");
          return Math.round(Math.abs(y - (link.getBoundingClientRect().top - el.getBoundingClientRect().top)));
        }),
      )
      .toBe(0);
  });

  test("the Orders item names the orders in progress when there are any", async ({ page, isMobile }) => {
    test.skip(isMobile, "the rail shows from lg up");
    await go(page, "/en/merchant/invoices");
    const orders = rail(page).getByRole("link", { name: /^Orders/ });
    await expect(orders).toHaveAttribute("href", "/en/merchant/orders");
    // The badge words are their own visually hidden span, so the name joins with a space before the comma.
    await expect(orders).toHaveAccessibleName(/^Orders(\s*, (\d+|99\+) in progress)?$/);
  });

  test("phone: a tab bar with the key destinations, the current one marked, 44px targets, never over the page", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await go(page, "/en/merchant/orders");
    const bar = page.getByRole("navigation", { name: "Shortcuts", exact: true });
    await expect(bar).toBeVisible();
    const links = bar.getByRole("link");
    await expect(links).toHaveCount(5);
    expect(await links.evaluateAll((all) => all.map((a) => a.getAttribute("href")))).toEqual([
      "/en/merchant",
      "/en/merchant/orders",
      "/en/merchant/services",
      "/en/merchant/wallet",
      "/en/merchant/support",
    ]);
    await expect(bar.getByRole("link", { name: /^Orders/ })).toHaveAttribute("aria-current", "page");
    for (const height of await links.evaluateAll((all) => all.map((a) => a.getBoundingClientRect().height))) {
      expect(height).toBeGreaterThanOrEqual(44);
    }
    const fit = await bar.evaluate((nav) => {
      const frame = document.getElementById("main")!.closest<HTMLElement>(".overflow-x-clip")!;
      return {
        bottom: nav.getBoundingClientRect().bottom,
        window: window.innerHeight,
        height: nav.getBoundingClientRect().height,
        padding: parseFloat(getComputedStyle(frame).paddingBottom),
      };
    });
    expect(Math.abs(fit.bottom - fit.window)).toBeLessThanOrEqual(1);
    expect(fit.padding, "the page's bottom padding keeps its end clear of the bar").toBeGreaterThanOrEqual(fit.height);
    // The drawer keeps the full list.
    await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(bar).toBeHidden();
  });
});
