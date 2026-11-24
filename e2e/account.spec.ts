// The account area against the isolated demo backend: the overview and the orders of a retail account and of a merchant rank
// (one address for both, a different body for each kind), the settings pages of a retail account, and the frame around them.
// Read-only checks use the demo accounts (Daniel, retail, 4 orders; the demo merchant). Anything that changes data
// (preferences, password, privacy requests) runs on a throwaway account made through the email link or by staff, so the shared
// demo accounts stay as every other test expects them.
import { expect, test } from "./fixtures";
import { type Page } from "@playwright/test";
import { ACCOUNTS, BASE_URL, DEV_TURNSTILE_TOKEN, FRESH_ACCOUNT_PASSWORD, freshAccount, go, signIn, signUpByLink } from "./helpers";

/** What the "me" routes answer that these tests read: the rank's name and the sign-in state. */
type Me = { currency: string | null; marketingOptIn: boolean; hasPassword: boolean; rank: { name: string; kind: "retail" | "merchant" } };

/** The retail account's own record (`GET /store/v1/me`). */
async function me(page: Page): Promise<Me> {
  const res = await page.request.get("/store/v1/me");
  expect(res.status()).toBe(200);
  return (await res.json()) as Me;
}

/** The merchant rank's own record (`GET /client/auth/me`: the same keys). */
async function clientMe(page: Page): Promise<Me> {
  const res = await page.request.get("/client/auth/me");
  expect(res.status()).toBe(200);
  return (await res.json()) as Me;
}

test.describe("overview and orders (demo retail account, read only)", () => {
  test.beforeEach(async ({ page }) => signIn(page));

  test("overview shows the rank, the profile with a link to edit it, recent orders with track links and quick links", async ({ page }) => {
    await go(page, "/en/account");
    await expect(page.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();
    // The rank is named beside the greeting.
    await expect(
      page
        .getByRole("main")
        .getByText((await me(page)).rank.name, { exact: true })
        .first(),
    ).toBeVisible();
    await expect(page.getByText(ACCOUNTS.retail.email).first()).toBeVisible();
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
    // None of the dashboard of a merchant rank.
    await expect(page.getByText("Total orders")).toHaveCount(0);
    await expect(page.getByText("Available balance", { exact: true })).toHaveCount(0);
  });

  test("orders: tabs filter by status through the URL and the amount column is honest about VAT and currency", async ({ page }) => {
    await go(page, "/en/account/orders");
    await expect(page.getByRole("heading", { level: 1, name: "My orders" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Amount (USD, before VAT)" })).toBeVisible();
    const all = await page.getByRole("cell", { name: /SF-\d+$/ }).count();
    expect(all).toBeGreaterThan(0);
    // Every row opens its tracking page (the token is the credential); none opens a page of the account area.
    const hrefs = await page.getByRole("link", { name: /^Track order SF-\d+$/ }).evaluateAll((links) => links.map((a) => a.getAttribute("href")));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href).toMatch(/^\/en\/track\/t_/);

    await page.getByRole("link", { name: "Completed", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account\/orders\?status=completed$/);
    await expect(page.getByRole("link", { name: "Completed", exact: true })).toHaveAttribute("aria-current", "page");
    const statuses = await page
      .getByRole("cell")
      .filter({ hasText: /^(Completed|Rejected|Pending|Processing)$/ })
      .allInnerTexts();
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

  test("an order page is for a merchant rank: a retail account that opens one goes to its own orders", async ({ page }) => {
    await page.goto("/en/account/orders/1");
    await expect(page).toHaveURL(/\/en\/account\/orders$/);
    await expect(page.getByRole("heading", { level: 1, name: "My orders" })).toBeVisible();
  });

  test("the workspace never scrolls sideways: the wide orders table scrolls in its card, no blank strip beside the frame", async ({ page, isMobile }) => {
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
          .poll(() => page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)), {
            message: `${path} at ${width}px`,
          })
          .toBe(0);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  });

  test("signing out from the menu returns to the sign-in page, which asks for no account type", async ({ page }) => {
    await go(page, "/en/account");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/en\/sign-in(\?|$)/);
    expect(new URL(page.url()).searchParams.has("as")).toBe(false);
  });
});

test.describe("overview and orders (demo merchant rank, read only)", () => {
  test.beforeEach(async ({ page }) => signIn(page, ACCOUNTS.merchant));

  test("the overview is the dashboard of the rank: the rank, the wallet, the order counts, the way to a new order", async ({ page }) => {
    await go(page, "/en/account");
    const main = page.getByRole("main");
    const dash = await (await page.request.get("/client/dashboard")).json();
    const usd = (amount: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(amount));

    await expect(main.getByRole("heading", { level: 1 })).toContainText("Welcome back,");
    await expect(main.getByText((await clientMe(page)).rank.name, { exact: true }).first()).toBeVisible();
    await expect(main.getByText(usd(dash.wallet.available)).first()).toBeVisible();
    const total = dash.counts.pending + dash.counts.processing + dash.counts.completed + dash.counts.rejected;
    await expect(main.getByRole("link", { name: new RegExp(`Total orders\\s*${total}`) })).toHaveAttribute("href", "/en/account/orders");
    await expect(main.getByRole("link", { name: "Add funds" })).toHaveAttribute("href", "/en/account/wallet/add-funds");
    await expect(main.getByRole("link", { name: "New order" })).toHaveAttribute("href", "/en/services");
    // None of the retail overview: no profile card to edit, no list of shop orders with track links.
    await expect(main.getByRole("link", { name: "Edit profile" })).toHaveCount(0);
    await expect(main.getByRole("link", { name: /^Track order/ })).toHaveCount(0);
  });

  test("the orders list opens each order on its own page in the account area, which a retail account cannot read", async ({ page }) => {
    const rows = (await (await page.request.get("/client/orders?_start=0&_end=1&_sort=createdAt&_order=desc")).json()) as { id: number }[];
    test.skip(rows.length === 0, "the demo merchant has no order yet");
    const id = rows[0].id;

    await go(page, "/en/account/orders");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
    await expect(main.getByRole("button", { name: "Export CSV" })).toBeVisible();
    await expect(main.getByRole("link", { name: "New order" })).toHaveAttribute("href", "/en/services");
    // No row opens a tracking page: the tracking pages are the shop's, for retail orders.
    await expect(main.locator('a[href^="/en/track/"]')).toHaveCount(0);

    const link = main.getByRole("link", { name: `Open order ${id}`, exact: true });
    await expect(link).toHaveAttribute("href", `/en/account/orders/${id}`);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/en/account/orders/${id}$`));
    await expect(main.getByRole("heading", { level: 1, name: `Order #${id}` })).toBeVisible();
    await expect(main.getByRole("link", { name: "Orders", exact: true })).toHaveAttribute("href", "/en/account/orders");
  });

  test("a status tab keeps the one address and filters by the API's declared status", async ({ page }) => {
    await go(page, "/en/account/orders?status=completed");
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: "Completed", exact: true })).toHaveAttribute("aria-current", "page");
    const listed = (await (await page.request.get("/client/orders?status=completed&_start=0&_end=1")).json()) as unknown[];
    if (listed.length > 0) await expect(main.getByRole("link", { name: /^Open order \d+$/ }).first()).toBeVisible();
  });
});

test.describe("settings pages of a retail account (throwaway account)", () => {
  test("a new account sees an empty orders state and the account page without a name", async ({ page }) => {
    await signUpByLink(page);
    await go(page, "/en/account");
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
    await expect(page.getByText("No orders yet")).toBeVisible();
    await go(page, "/en/account/orders");
    await expect(page.getByRole("heading", { name: "No orders yet" })).toBeVisible();
  });

  test("preferences: only changed keys are saved and the currency cookie follows", async ({ page }) => {
    await signUpByLink(page);
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

  test("an account without a password is pointed to the password link instead of a form", async ({ page }) => {
    await signUpByLink(page);
    await go(page, "/en/account/settings/security");
    await expect(page.getByText("You sign in with email links")).toBeVisible();
    await expect(page.getByRole("link", { name: /^(Set|Create) a password$/ })).toHaveAttribute("href", "/en/forgot-password");
    await expect(page.locator('input[name="currentPassword"]')).toHaveCount(0);
  });

  test("change password: wrong current is refused on its field, weak is refused, a good one works", async ({ page }) => {
    const first = FRESH_ACCOUNT_PASSWORD;
    const account = await freshAccount(page, { signedIn: true });
    await go(page, "/en/account/settings/security");

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
    await signIn(page, { email: account.email, password: next });
    await page.context().clearCookies();
    const old = await page.request.post("/client/auth/sign-in", {
      headers: { Origin: new URL(BASE_URL).origin, "X-Turnstile-Token": DEV_TURNSTILE_TOKEN, "Content-Type": "application/json" },
      data: { email: account.email, password: first },
    });
    expect(old.status()).toBe(401);
  });

  test("privacy: export request shows its status and due date; deletion needs the confirmation", async ({ page }) => {
    await signUpByLink(page);
    await go(page, "/en/account/settings/privacy");

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

  test("the settings navigation moves between the settings pages", async ({ page }) => {
    await signIn(page);
    await go(page, "/en/account/settings");
    await page.getByRole("link", { name: "Security", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account\/settings\/security$/);
    await page.getByRole("link", { name: "Privacy", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account\/settings\/privacy$/);
    await expect(page.getByRole("heading", { name: "Privacy and data" })).toBeVisible();
  });
});

// ── The workspace frame ───────────────────────────────────────────────────────────────────────────────────────────────
// The account area's frame is part of the static shell: the rail, the header with the section title, the menu button and
// its drawer are in the HTML before anything personal is read, and the phone menu opens from that HTML (a native
// `show-modal` command) before React hydrates. Read-only: the demo account is only looked at.

/** Whether React has attached its props to the element (it has hydrated). */
const hydrated = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps")));

test.describe("workspace frame (demo retail account, read only)", () => {
  test.beforeEach(async ({ page }) => signIn(page));

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

  test("phone: the tab bar holds Overview, Orders, the wallet when it shows, Notifications and Support", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await go(page, "/en/account/orders");
    const bar = page.getByRole("navigation", { name: "Shortcuts", exact: true });
    await expect(bar).toBeVisible();
    const hrefs = await bar.getByRole("link").evaluateAll((all) => all.map((a) => a.getAttribute("href")));
    expect(hrefs.filter((href) => href !== "/en/account/wallet")).toEqual([
      "/en/account",
      "/en/account/orders",
      "/en/account/notifications",
      "/en/account/support",
    ]);
    await expect(bar.getByRole("link", { name: /^Orders/ })).toHaveAttribute("aria-current", "page");
    await expect(bar.locator('a[href="/en/account/notifications"]')).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(bar).toBeHidden();
  });

  // FIXME(speed plan P1.4, 2026-11-15): the section title still streams (the shell has a placeholder where the title
  // should be, because it comes from the active nav item, which reads the pathname inside a <Suspense>). Follow-up.
  test.fixme("the static shell carries the frame and the section title and nothing personal", async ({ page }) => {
    // `next dev` renders the shell and the session parts in one pass: the split below needs a production build.
    test.skip(new URL(BASE_URL).port === "5175", "needs the production build (E2E_BASE_URL=http://localhost:5176)");
    const account = (await (await page.request.get("/store/v1/me")).json()) as { name?: string; email: string; rank: { name: string } };
    const html = await (await page.request.get("/en/account/orders")).text();
    // The session parts stream after the shell as hidden segments that a script moves into place.
    const streamed = html.search(/<div hidden id="S:\d+"/);
    expect(streamed, "the personal parts stream after the shell").toBeGreaterThan(0);
    const shell = html.slice(0, streamed);

    expect(shell).toContain('aria-label="Workspace navigation"');
    expect(shell).toContain("My account"); // the breadcrumb's area label
    expect(shell).toMatch(/<p class="[^"]*text-heading[^"]*">Orders<\/p>/); // the section title
    expect(shell).toContain('<main id="main"');
    expect(shell).toContain('aria-label="Open navigation"');

    // The person is in the streamed parts only.
    expect(html).toContain(account.name || account.email);
    expect(shell).not.toContain(account.email);
    if (account.name) expect(shell).not.toContain(account.name);
  });
});
