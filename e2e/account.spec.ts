// The customer area against the isolated demo backend. Read-only checks use the demo customer (Daniel, 4 orders). Anything
// that changes data (preferences, password, privacy requests) runs on a throwaway customer created through the email link,
// so the shared demo accounts stay as every other test expects them.
import { expect, test } from "./fixtures";
import { type Page } from "@playwright/test";
import { ACCOUNTS, BASE_URL, signInCustomer } from "./helpers";

const DEV_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

/** `page.goto`, then wait until the first form control is hydrated: React resets a controlled input that was filled before hydration. */
async function go(page: Page, url: string) {
  await page.goto(url);
  await page.waitForFunction(() => {
    const control = document.querySelector("form input, form textarea, form select");
    return !control || Object.keys(control).some((key) => key.startsWith("__reactProps"));
  });
}

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;
}

async function waitForLink(page: Page, address: string, pathPattern: RegExp): Promise<string> {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const list = await page.request.get(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${address}`)}&limit=10`);
    const body = (await list.json()) as { messages?: { ID: string }[] };
    for (const { ID } of body.messages ?? []) {
      const message = (await (await page.request.get(`http://localhost:8025/api/v1/message/${ID}`)).json()) as { Text?: string; HTML?: string };
      const text = `${message.Text ?? ""}\n${message.HTML ?? ""}`.replace(/&amp;/g, "&");
      for (const match of text.matchAll(/https?:\/\/localhost:5175(\/[^\s"'<>)\]]+)/g)) {
        if (pathPattern.test(match[1])) return match[1];
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`no mail to ${address} with a link matching ${pathPattern}`);
}

/** A brand-new customer, signed in through the magic link (API). `withPassword` also gives them a password. */
async function freshCustomer(page: Page, withPassword?: string): Promise<string> {
  const email = uniqueEmail("acct");
  await page.request.post("/store/v1/auth/magic-link", { headers: { "X-Turnstile-Token": DEV_TOKEN }, data: { email } });
  const link = await waitForLink(page, email, /\/sign-in\?token=/);
  const verified = await page.request.post("/store/v1/auth/verify", { data: { token: new URL(link, "http://x").searchParams.get("token") } });
  expect(verified.status()).toBe(200);
  if (withPassword) {
    await page.request.post("/store/v1/auth/password/forgot", { headers: { "X-Turnstile-Token": DEV_TOKEN }, data: { email } });
    const reset = await waitForLink(page, email, /\/set-password\?token=/);
    const set = await page.request.post("/store/v1/auth/password/set", {
      data: { token: new URL(reset, "http://x").searchParams.get("token"), password: withPassword },
    });
    expect(set.status()).toBe(204);
    // Setting a password ends every session: sign in again.
    const login = await page.request.post("/store/v1/auth/login", {
      headers: { "X-Turnstile-Token": DEV_TOKEN },
      data: { email, password: withPassword },
    });
    expect(login.status()).toBe(200);
  }
  return email;
}

async function me(page: Page) {
  const res = await page.request.get("/store/v1/me");
  expect(res.status()).toBe(200);
  return (await res.json()) as { currency: string | null; marketingOptIn: boolean; hasPassword: boolean };
}

test.describe("overview and orders (demo customer, read only)", () => {
  test.beforeEach(async ({ page }) => signInCustomer(page));

  test("overview shows the profile with a link to edit it, recent orders with track links and quick links", async ({ page }) => {
    await go(page, "/en/account");
    await expect(page.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();
    await expect(page.getByText(ACCOUNTS.customer.email).first()).toBeVisible();
    await expect(page.getByText("Verified").first()).toBeVisible();
    // The profile is edited in the settings (customer-profile.spec.ts); only the email is left to support.
    await expect(page.getByRole("link", { name: "Edit profile" })).toHaveAttribute("href", "/en/account/settings#profile");
    await expect(page.getByText("To change your email address, contact support.")).toBeVisible();
    await expect(page.getByText("To change your name, phone, country or email, contact support.")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Recent orders" })).toBeVisible();
    await expect(page.getByRole("cell", { name: /SF-\d+$/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^Track order SF-\d+$/ }).first()).toHaveAttribute("href", /\/en\/track\/t_/);
    await expect(page.getByRole("link", { name: "Help center" })).toBeVisible();
    // The overview itself has no inputs: editing happens on the settings page.
    await expect(page.locator('input[name="name"], input[name="phone"], input[name="email"]')).toHaveCount(0);
  });

  test("orders: tabs filter by status through the URL and the amount column is honest about VAT and currency", async ({ page }) => {
    await go(page, "/en/account/orders");
    await expect(page.getByRole("heading", { level: 1, name: "My orders" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Amount (USD, before VAT)" })).toBeVisible();
    const all = await page.getByRole("cell", { name: /SF-\d+$/ }).count();
    expect(all).toBeGreaterThan(0);

    await page.getByRole("link", { name: "Completed", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account\/orders\?status=completed$/);
    await expect(page.getByRole("link", { name: "Completed", exact: true })).toHaveAttribute("aria-current", "page");
    const statuses = await page.getByRole("cell").filter({ hasText: /^(Completed|Rejected|Pending|Processing)$/ }).allInnerTexts();
    expect(statuses.length).toBeGreaterThan(0);
    expect(new Set(statuses.map((s) => s.trim()))).toEqual(new Set(["Completed"]));

    await page.getByRole("link", { name: "Pending", exact: true }).click();
    await expect(page).toHaveURL(/status=pending$/);
    // Daniel has no pending order: a plain empty state with a way back.
    await expect(page.getByRole("heading", { name: "No pending orders" })).toBeVisible();
    await page.getByRole("link", { name: "Show all orders" }).click();
    await expect(page).toHaveURL(/\/en\/account\/orders$/);
  });

  test("a page number past the end goes back to the first page", async ({ page }) => {
    await go(page, "/en/account/orders?page=9");
    await expect(page).toHaveURL(/\/en\/account\/orders$/);
    await expect(page.getByRole("cell", { name: /SF-\d+$/ }).first()).toBeVisible();
  });

  test("the workspace never scrolls sideways: the wide orders table scrolls in its card, no blank strip beside the frame", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "sets its own window sizes");
    // Regression (2026-11-15): the orders table's visually hidden "Track" header escaped the table's scroll box and made
    // the document wider than the window at 768-1024px: the rail was cut.
    for (const path of ["/account", "/account/orders"]) {
      await go(page, `/en${path}`);
      await expect(page.getByRole("cell", { name: /SF-\d+$/ }).first()).toBeVisible();
      for (const width of [1024, 900, 768]) {
        await page.setViewportSize({ width, height: 800 });
        // Above zero means the page scrolls sideways; the reserved scrollbar gutter can make the difference negative.
        await expect
          .poll(
            () =>
              page.evaluate(() =>
                Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
              ),
            { message: `${path} at ${width}px` },
          )
          .toBe(0);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  });

  test("signing out from the menu returns to the sign-in page", async ({ page }) => {
    await go(page, "/en/account");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/en\/sign-in\?as=customer/);
  });
});

test.describe("settings (throwaway customer)", () => {
  test("a new customer sees an empty orders state and the account page without a name", async ({ page }) => {
    await freshCustomer(page);
    await go(page, "/en/account");
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
    await expect(page.getByText("No orders yet")).toBeVisible();
    await go(page, "/en/account/orders");
    await expect(page.getByRole("heading", { name: "No orders yet" })).toBeVisible();
  });

  test("preferences: only changed keys are saved and the currency cookie follows", async ({ page }) => {
    await freshCustomer(page);
    await go(page, "/en/account/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Account settings" })).toBeVisible();

    // Nothing changed: no request, a hint.
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("No changes to save")).toBeVisible();

    const requests: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "PATCH" && r.url().endsWith("/store/v1/me")) requests.push(r.postData() ?? "");
    });
    await page.getByRole("switch", { name: /Marketing emails/ }).check();
    await page.locator('select[name="currency"]').selectOption("EUR");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Preferences saved")).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0])).toEqual({ currency: "EUR", marketingOptIn: true });

    // Persisted on the API and in the shop's cookie; survives a reload.
    expect(await me(page)).toMatchObject({ currency: "EUR", marketingOptIn: true });
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "gsm_currency")?.value).toBe("EUR");
    await page.reload();
    await expect(page.locator('select[name="currency"]')).toHaveValue("EUR");
    await expect(page.getByRole("switch", { name: /Marketing emails/ })).toBeChecked();
  });

  test("a customer without a password is pointed to the email link instead of a form", async ({ page }) => {
    await freshCustomer(page);
    await go(page, "/en/account/settings");
    await expect(page.getByText("You sign in with email links")).toBeVisible();
    await expect(page.getByRole("link", { name: "Set a password" })).toHaveAttribute("href", "/en/forgot-password?as=customer");
    await expect(page.locator('input[name="currentPassword"]')).toHaveCount(0);
  });

  test("change password: wrong current is refused on its field, weak is refused, a good one works", async ({ page }) => {
    const first = "Harbor-Violet-3317";
    const email = await freshCustomer(page, first);
    await go(page, "/en/account/settings");

    await page.locator('input[name="currentPassword"]').fill("not-my-password-1");
    await page.locator('input[name="newPassword"]').fill("Quartz-Meadow-9082");
    await page.locator('input[name="confirmPassword"]').fill("Quartz-Meadow-9082");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.locator('input[name="currentPassword"]')).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("This is not your current password.")).toBeVisible();
    await expect(page.locator('input[name="currentPassword"]')).toBeFocused();
    // Still signed in: a wrong current password is a 422, never a sign-out.
    expect((await page.request.get("/store/v1/me")).status()).toBe(200);

    await page.locator('input[name="currentPassword"]').fill(first);
    await page.locator('input[name="newPassword"]').fill("password123");
    await page.locator('input[name="confirmPassword"]').fill("password123");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.locator('input[name="newPassword"]')).toHaveAttribute("aria-invalid", "true");

    const next = "Quartz-Meadow-9082";
    await page.locator('input[name="newPassword"]').fill(next);
    await page.locator('input[name="confirmPassword"]').fill(next);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("status").filter({ hasText: "You were signed out on your other devices." })).toBeVisible();

    // The new password signs in; the old one does not.
    await page.context().clearCookies();
    const ok = await page.request.post("/store/v1/auth/login", { headers: { "X-Turnstile-Token": DEV_TOKEN }, data: { email, password: next } });
    expect(ok.status()).toBe(200);
    await page.context().clearCookies();
    const old = await page.request.post("/store/v1/auth/login", { headers: { "X-Turnstile-Token": DEV_TOKEN }, data: { email, password: first } });
    expect(old.status()).toBe(401);
  });

  test("privacy: export request shows its status and due date; deletion needs the confirmation", async ({ page }) => {
    await freshCustomer(page);
    await go(page, "/en/account/settings");

    await page.getByRole("button", { name: "Request data export" }).click();
    const received = page.getByRole("status").filter({ hasText: "Request received: Data export" });
    await expect(received).toBeVisible();
    await expect(received.getByText("Received", { exact: true })).toBeVisible();
    await expect(received.getByText("We answer by")).toBeVisible();
    await expect(page.getByText("Our team follows up by email.")).toBeVisible();

    // Deletion: cancel keeps the data, confirm creates the request.
    await page.getByRole("button", { name: "Request deletion" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete your personal data?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Keep my data" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Request received: Data deletion")).toHaveCount(0);

    await page.getByRole("button", { name: "Request deletion" }).click();
    await dialog.getByRole("button", { name: "Yes, request deletion" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Request received: Data deletion" })).toBeVisible();
  });

  test("the settings section links jump to their cards", async ({ page }) => {
    await signInCustomer(page);
    await go(page, "/en/account/settings");
    await page.getByRole("link", { name: "Privacy", exact: true }).click();
    await expect(page).toHaveURL(/#privacy$/);
    await expect(page.getByRole("heading", { name: "Privacy and data" })).toBeInViewport();
  });
});

// ── The workspace frame (plan P1.2, P1.4) ─────────────────────────────────────────────────────────────────────────────
// The customer area's frame is part of the static shell: the rail, the header with the section title, the menu button and
// its drawer are in the HTML before anything personal is read, and the phone menu opens from that HTML (a native
// `show-modal` command) before React hydrates. Read-only: the demo customer is only looked at.

/** Whether React has attached its props to the element (it has hydrated). */
const hydrated = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps")));

test.describe("workspace frame (demo customer, read only)", () => {
  test.beforeEach(async ({ page }) => signInCustomer(page));

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
    await page.goto("/en/account/orders");
    expect(aborted, "no client script was blocked").toBeGreaterThan(0);

    const button = page.getByRole("button", { name: "Open navigation", exact: true });
    await expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(await hydrated(page, "header button[commandfor]"), "the page hydrated").toBe(false);

    await button.click();
    const drawer = page.getByRole("dialog", { name: "Workspace navigation", exact: true });
    await expect(drawer).toBeVisible();
    // A modal: the focus trap and the inert page come from showModal(), not from a plain `open` attribute.
    expect(await drawer.evaluate((element) => element.matches(":modal"))).toBe(true);
    await expect(drawer.getByRole("link", { name: "Orders", exact: true })).toBeVisible();
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

  test("phone, hydrated: one modal per tap, and a link in the drawer closes it on the page it opens", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await go(page, "/en/account");
    await expect.poll(() => hydrated(page, "header button[commandfor]")).toBe(true);

    // The click handler opens it first and the native command then finds it open: one modal, no error.
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Workspace navigation", exact: true });
    await expect(drawer).toBeVisible();
    expect(await drawer.evaluate((element) => element.matches(":modal"))).toBe(true);

    // The frame stays mounted across account pages, so the drawer must be closed by the click, not by a new page.
    await drawer.getByRole("link", { name: "Orders", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account\/orders$/);
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: "My orders" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("the rail sits at the start edge of a wide screen", async ({ page, isMobile }) => {
    test.skip(isMobile, "the rail shows from lg up");
    // Owner, 2026-11-15: no centred frame, so no strip of about 70px before the rail at 1920px.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await go(page, "/en/account");
    const nav = page.getByRole("navigation", { name: "Workspace navigation" });
    const start = await nav.evaluate((el) => el.parentElement!.getBoundingClientRect().left);
    expect(start, "room before the rail").toBeGreaterThanOrEqual(0);
    expect(start, "room before the rail").toBeLessThanOrEqual(16.5);
  });

  test("phone: the tab bar holds Overview, Orders, the wallet when it shows, Notifications and My tickets", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await go(page, "/en/account/orders");
    const bar = page.getByRole("navigation", { name: "Shortcuts", exact: true });
    await expect(bar).toBeVisible();
    const hrefs = await bar.getByRole("link").evaluateAll((all) => all.map((a) => a.getAttribute("href")));
    expect(hrefs.filter((href) => href !== "/en/account/wallet")).toEqual([
      "/en/account",
      "/en/account/orders",
      "/en/account/notifications",
      "/en/account/tickets",
    ]);
    await expect(bar.getByRole("link", { name: /^Orders/ })).toHaveAttribute("aria-current", "page");
    await expect(bar.getByRole("link", { name: /^Alerts/ })).toHaveAttribute("href", "/en/account/notifications");
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(bar).toBeHidden();
  });

  // FIXME(speed plan P1.4, 2026-11-15): the section title still streams (the shell has a placeholder where the title
  // should be, because it comes from the active nav item, which reads the pathname inside a <Suspense>). Follow-up.
  test.fixme("the static shell carries the frame and the section title and nothing personal", async ({ page }) => {
    // `next dev` renders the shell and the session parts in one pass: the split below needs a production build.
    test.skip(new URL(BASE_URL).port === "5175", "needs the production build (E2E_BASE_URL=http://localhost:5176)");
    const me = (await (await page.request.get("/store/v1/me")).json()) as { name?: string; email: string };
    const html = await (await page.request.get("/en/account/orders")).text();
    // The session parts stream after the shell as hidden segments that a script moves into place.
    const streamed = html.search(/<div hidden id="S:\d+"/);
    expect(streamed, "the personal parts stream after the shell").toBeGreaterThan(0);
    const shell = html.slice(0, streamed);

    expect(shell).toContain('aria-label="Workspace navigation"');
    expect(shell).toContain("My account"); // the breadcrumb's area label
    expect(shell).toMatch(/<p class="[^"]*text-heading[^"]*">Orders<\/p>/); // the section title
    expect(shell).toContain('<main id="main"');
    expect(shell).toContain("Customer account"); // the role, where the name will be
    expect(shell).toContain('aria-label="Open navigation"');

    // The person is in the streamed parts only.
    expect(html).toContain(me.name || me.email);
    expect(shell).not.toContain(me.email);
    if (me.name) expect(shell).not.toContain(me.name);
  });
});
