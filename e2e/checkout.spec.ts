// Customer checkout: open a checkout (details drawer, tax from the country), review and pay (locked amounts, consents,
// payment methods), the payment return page and the resume link. The demo gateways have placeholder keys, so `pay` is
// EXPECTED to answer 502 GATEWAY_ERROR in this setup: the test accepts a redirect too, but never a silent success.
// Server errors that cannot be provoked on demand (suspended email, guest checkout off, maintenance) are answered by
// Playwright route mocks at the browser boundary.
import { expect, test } from "./fixtures";
import { type APIRequestContext, type Page } from "@playwright/test";
import { signInCustomer, ACCOUNTS } from "./helpers";

const DEV_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const IMEI = "490154203237518";

async function stubTurnstile(page: Page) {
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `(function(){var o={};window.turnstile={render:function(e,c){var id="w"+Math.random();o[id]=c;setTimeout(function(){c.callback("${DEV_TOKEN}")},30);return id},reset:function(id){var c=o[id];if(c)setTimeout(function(){c.callback("${DEV_TOKEN}")},30)},remove:function(id){delete o[id]}}})();`,
    }),
  );
}

/** Opens a checkout session straight through the API (as the form would) and returns its token. */
async function createSession(request: APIRequestContext, overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await request.post("/store/v1/checkout-sessions", {
    headers: { "X-Turnstile-Token": DEV_TOKEN, "Content-Type": "application/json" },
    data: { serviceId: 1, email: "e2e-buyer@example.com", country: "DE", currency: "EUR", imei: IMEI, ...overrides },
  });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { token: string }).token;
}

/** The form is hydrated and the (stubbed) security check has answered once "Continue to payment" is enabled. */
async function formReady(page: Page) {
  await expect(page.getByRole("button", { name: "Continue to payment" })).toBeEnabled();
}

async function enterImei(page: Page, imei = IMEI) {
  await formReady(page);
  await page.getByRole("button", { name: "Enter details" }).first().click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await drawer.getByLabel("IMEI number").fill(imei);
  await drawer.getByRole("button", { name: "Save details and continue" }).click();
}

async function fillBuyer(page: Page, email = "e2e-guest@example.com", country = "DE") {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Country").selectOption(country);
}

test.describe("opening a checkout", () => {
  test("service requirements drawer, tax by country and the locked session page", async ({ page }) => {
    await stubTurnstile(page);
    await page.goto("/en/checkout?service=icloud-clean-lost-check");
    await expect(page.getByRole("heading", { level: 1, name: "Secure checkout" })).toBeVisible();
    await expect(page.getByText("Additional information required")).toBeVisible();
    await expect(page.getByText("Tax is added once you choose your country.")).toBeVisible();
    await expect(page.getByText("$3.99").first()).toBeVisible();

    await enterImei(page);
    await expect(page.getByText("Details added")).toBeVisible();
    await fillBuyer(page);
    // Germany: 19% VAT, taken from the API's tax windows (indicative until the session locks it).
    await expect(page.getByText("Tax (19%)")).toBeVisible();
    await expect(page.getByText("$4.75").first()).toBeVisible();

    const create = page.waitForRequest((r) => r.url().endsWith("/store/v1/checkout-sessions") && r.method() === "POST");
    await page.getByRole("button", { name: "Continue to payment" }).click();
    const request = await create;
    expect(request.headers()["x-turnstile-token"]).toBe(DEV_TOKEN);
    expect(request.postDataJSON()).toMatchObject({ serviceId: 1, country: "DE", currency: "USD", imei: IMEI, quantity: 1 });

    await expect(page).toHaveURL(/\/en\/checkout\/[A-Za-z0-9_-]{16,}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Review and pay" })).toBeVisible();
    await expect(page.getByText(/Price locked for \d\d:\d\d/)).toBeVisible();
    // Locked amounts (display currency = USD): net 3.99 + 19% tax 0.76 = 4.75; the IMEI and email stay masked.
    // (Next keeps the previous page hidden in the DOM, so look at what is visible.)
    await expect(page.getByText("Tax (19%)").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("$0.76").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Total to pay")).toBeVisible();
    await expect(page.getByText("•••7518").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("e2•••@example.com")).toBeVisible();
    await expect(page.getByRole("radio", { name: /Card gateway/ })).toBeChecked();
    // No wallet, PayPal or Vodafone Cash: customers pay with the gateways the session lists.
    await expect(page.getByText(/wallet|PayPal|Vodafone/i)).toHaveCount(0);
  });

  test("the first click without details shows the errors and opens the drawer on the IMEI", async ({ page }) => {
    await stubTurnstile(page);
    await page.goto("/en/checkout?service=icloud-clean-lost-check");
    await formReady(page);
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await expect(page.getByRole("dialog").getByText("An IMEI has 15 digits.")).toBeVisible();
    await page.getByRole("dialog").getByLabel("IMEI number").fill("490154203237519");
    await page.getByRole("button", { name: "Save details and continue" }).click();
    await expect(page.getByRole("dialog").getByText("last digit does not match")).toBeVisible();
    await page.getByRole("dialog").getByLabel("IMEI number").fill(IMEI);
    await page.getByRole("button", { name: "Save details and continue" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await expect(page.getByText("This field is required.").first()).toBeVisible();
  });

  test("a signed-in customer's email is locked to the account", async ({ page }) => {
    await stubTurnstile(page);
    await signInCustomer(page);
    await page.goto("/en/checkout?service=icloud-clean-lost-check");
    await formReady(page);
    const email = page.getByLabel("Email");
    await expect(email).toHaveValue(ACCOUNTS.customer.email);
    await expect(email).toHaveAttribute("readonly", "");
    await expect(page.getByText("You are signed in.")).toBeVisible();
    await enterImei(page);
    if (!(await page.getByLabel("Country").inputValue())) await page.getByLabel("Country").selectOption("GB");
    await page.getByRole("button", { name: "Continue to payment" }).click();
    // The store CSRF token travels with the request (a signed-in customer must send it, handoff trap 4).
    await expect(page).toHaveURL(/\/en\/checkout\/[A-Za-z0-9_-]{16,}$/);
  });

  test("a slug of the other language redirects to this language's slug", async ({ page }) => {
    await page.goto("/ar/checkout?service=icloud-clean-lost-check");
    await expect(page).toHaveURL(/\/ar\/checkout\?service=fahs-icloud$/);
    await expect(page.getByRole("heading", { level: 1, name: "إتمام الطلب بأمان" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("no service in the URL asks for one", async ({ page }) => {
    await page.goto("/en/checkout");
    await expect(page.getByText("Choose a service first")).toBeVisible();
  });

  test("server errors are shown in plain words: invalid IMEI, suspended, guest checkout off, maintenance", async ({ page }) => {
    await stubTurnstile(page);
    let reply: { status: number; body: unknown; headers?: Record<string, string> } = { status: 500, body: {} };
    await page.route("**/store/v1/checkout-sessions", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      return route.fulfill({
        status: reply.status,
        contentType: "application/problem+json",
        headers: reply.headers,
        body: JSON.stringify({ title: "x", detail: "x", requestId: "req-e2e-1", ...(reply.body as object) }),
      });
    });
    await page.goto("/en/checkout?service=icloud-clean-lost-check");
    await enterImei(page);
    await fillBuyer(page);
    const submit = page.getByRole("button", { name: "Continue to payment" });

    reply = { status: 422, body: { code: "VALIDATION_FAILED", errors: [{ field: "imei", code: "INVALID_IMEI", message: "x" }] } };
    await submit.click();
    await expect(page.getByRole("dialog").getByText("Enter a valid 15-digit IMEI (the last digit is a check digit).")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    reply = { status: 403, body: { code: "ACCOUNT_SUSPENDED" } };
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByText("We cannot open a checkout with these details.")).toBeVisible();
    await expect(page.getByText("Reference: req-e2e-1")).toBeVisible();

    reply = { status: 401, body: { code: "UNAUTHORIZED" } };
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByText("Guest checkout is turned off. Sign in to continue.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" }).last()).toHaveAttribute("href", /\/en\/sign-in\?as=customer&next=/);

    reply = {
      status: 503,
      body: { code: "MAINTENANCE", expectedEndAt: "2026-11-10T08:00:00.000Z" },
      headers: { "Retry-After": "600" },
    };
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByText(/Checkout is temporarily unavailable because of maintenance/)).toBeVisible();
  });
});

test.describe("review and pay", () => {
  test("consents are required, then pay either redirects or fails honestly (demo gateways have placeholder keys)", async ({ page, request }) => {
    const token = await createSession(request);
    await page.goto(`/en/checkout/${token}`);
    await expect(page.getByRole("heading", { level: 1, name: "Review and pay" })).toBeVisible();

    // Pay without consents: nothing is sent, each missing box says so.
    let posted = false;
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes(`/checkout-sessions/${token}/`)) posted = true;
    });
    await page.getByRole("button", { name: /^Pay / }).click();
    await expect(page.getByText("Tick this box to continue.")).toHaveCount(3);
    expect(posted).toBe(false);

    // The waiver explains what it means.
    await expect(page.getByText(/the right to withdraw from the purchase ends once delivery has started/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Terms of service/ })).toHaveAttribute("href", "/en/pages/terms");
    await expect(page.getByRole("link", { name: /Privacy policy/ })).toHaveAttribute("href", "/en/pages/privacy");

    for (const name of [/Terms of service/, /Privacy policy/, /lose my right to withdraw/]) {
      await page.getByRole("checkbox", { name }).check();
    }
    const consents = page.waitForResponse((r) => r.url().endsWith(`/checkout-sessions/${token}/consents`));
    const pay = page.waitForResponse((r) => r.url().endsWith(`/checkout-sessions/${token}/pay`));
    await page.getByRole("button", { name: /^Pay / }).click();
    expect((await consents).status()).toBe(201);
    const paid = await pay;
    expect([201, 502]).toContain(paid.status());
    if (paid.status() === 502) {
      // Expected here: the card gateway's placeholder key is refused by the provider.
      await expect(page.getByText("We could not start the payment with the provider, so you were not charged.")).toBeVisible();
      await expect(page.getByText(/^Reference: /)).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/en/checkout/${token}$`));
      await expect(page.getByRole("button", { name: /^Pay / })).toBeEnabled();
    }
  });

  test("a crypto amount outside the gateway's limits is explained and another method can be chosen", async ({ page, request }) => {
    const token = await createSession(request);
    await page.goto(`/en/checkout/${token}`);
    for (const name of [/Terms of service/, /Privacy policy/, /lose my right to withdraw/]) {
      await page.getByRole("checkbox", { name }).check();
    }
    await page.locator("label", { hasText: "Crypto gateway" }).click();
    await expect(page.getByRole("radio", { name: /Crypto gateway/ })).toBeChecked();
    const pay = page.waitForResponse((r) => r.url().endsWith(`/checkout-sessions/${token}/pay`));
    await page.getByRole("button", { name: /^Pay / }).click();
    const response = await pay;
    if (response.status() === 422) {
      await expect(page.getByText("This payment method does not accept this amount. Choose another one.").first()).toBeVisible();
    } else {
      expect([201, 502]).toContain(response.status());
    }
  });

  test("an unknown checkout link is a friendly page", async ({ page }) => {
    await page.goto("/en/checkout/aaaaaaaaaaaaaaaaaaaaaa");
    await expect(page.getByText("We could not find this checkout")).toBeVisible();
  });

  test("the Arabic review page is right-to-left", async ({ page, request }) => {
    const token = await createSession(request);
    await page.goto(`/ar/checkout/${token}`);
    await expect(page.getByRole("heading", { level: 1, name: "المراجعة والدفع" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "طريقة الدفع" })).toBeVisible();
  });
});

test.describe("payment return", () => {
  test("waits while the payment is open and offers a way back to the payment", async ({ page, request }) => {
    const token = await createSession(request);
    await page.goto(`/en/checkout/return?token=${token}`);
    await expect(page.getByRole("heading", { name: "Confirming your payment…" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to payment" })).toHaveAttribute("href", `/en/checkout/${token}`);
  });

  test("a paid checkout shows the tracking link prominently; a 429 is waited out", async ({ page }) => {
    let calls = 0;
    await page.route("**/store/v1/checkout-sessions/e2e-return-token-0000", (route) => {
      calls += 1;
      // The first two answers are 429 (React strict mode in dev starts the first poll twice).
      if (calls <= 2) {
        return route.fulfill({
          status: 429,
          contentType: "application/problem+json",
          headers: { "Retry-After": "1" },
          body: JSON.stringify({ title: "Too many", code: "RATE_LIMITED", detail: "x" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token: "e2e-return-token-0000",
          status: "paid",
          expiresAt: "2026-11-09T19:00:00.000Z",
          createdAt: "2026-11-09T18:30:00.000Z",
          service: { id: 1, name: "iCloud Clean / Lost Check", type: "imei", deliveryTime: "2 min" },
          quantity: 1,
          imei: "•••••••••••7518",
          email: "e2•••@example.com",
          country: "DE",
          currency: "USD",
          fxRate: "1.00000000",
          taxRate: "19.0000",
          amounts: {
            usd: { net: "3.9900", tax: "0.7600", gross: "4.7500" },
            display: { net: "3.9900", tax: "0.7600", gross: "4.7500" },
          },
          consent: { required: [], granted: [], complete: true },
          paymentMethods: [],
          trackingToken: "t_4056k559090000000000",
        }),
      });
    });
    await page.goto("/en/checkout/return?token=e2e-return-token-0000");
    await expect(page.getByText("Many checks in a short time.")).toBeVisible();
    await expect(page.getByText("Payment received. Thank you!")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole("heading", { name: "Your tracking link" })).toBeVisible();
    await expect(page.getByText(/\/en\/track\/t_4056k559090000000000$/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save this link" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View my order" })).toHaveAttribute("href", "/en/track/t_4056k559090000000000");
    await expect(page.getByRole("link", { name: "Download receipt" })).toHaveAttribute("href", /\/store\/v1\/orders\/t_4056k559090000000000\/receipt$/);
  });

  test("a missing or wrong token is explained", async ({ page }) => {
    await page.goto("/en/checkout/return");
    await expect(page.getByText("This page needs a checkout link")).toBeVisible();
    await page.goto("/en/checkout/return?token=aaaaaaaaaaaaaaaaaaaaaa");
    await expect(page.getByText("We could not find this checkout")).toBeVisible();
  });
});

test.describe("abandoned checkout link", () => {
  test("offers a new checkout at today's price for the same service", async ({ page, request }) => {
    const token = await createSession(request);
    await page.goto(`/en/checkout/resume?token=${token}`);
    await expect(page.getByRole("heading", { name: "iCloud Clean / Lost Check" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Start a new checkout at today's price" })).toHaveAttribute(
      "href",
      "/en/checkout?service=icloud-clean-lost-check",
    );
  });

  test("a bad token is explained", async ({ page }) => {
    await page.goto("/en/checkout/resume?token=bad");
    await expect(page.getByText("We could not find this checkout")).toBeVisible();
  });
});
