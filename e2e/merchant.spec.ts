// Merchant portal core, end to end against the isolated demo backend (m1 ops@zainmobilehub.example is active with a
// wallet; m18 ops@algiersservice.example is pending approval). The flows place REAL orders and invoices in the
// isolated database: IMEIs are generated per run so a second run never trips the "duplicate open order" rule.
// The backend can end a session at any time (other test runs sign in as the same merchant), so every navigation goes
// through `go()`, which signs in again when it lands on the sign-in page.
import { expect, test, type Locator, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import { ACCOUNTS, signInMerchant } from "./helpers";

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

  test("Arabic is right-to-left", async ({ page }) => {
    await go(page, "/ar/merchant");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(main(page).getByRole("heading", { level: 1 })).toContainText("أهلًا بعودتك");
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

  test("the notice is in Arabic too", async ({ page }) => {
    await go(page, "/ar/merchant/orders", ACCOUNTS.pendingMerchant);
    await expect(main(page).getByText("متاحة بعد الموافقة")).toBeVisible();
  });
});
