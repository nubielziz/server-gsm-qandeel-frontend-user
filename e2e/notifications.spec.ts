// The notification center (plan F11, BH §4.1, §4.2, §4.4): the bell in both workspace headers (customer and merchant), the notifications page of the
// customer area and of the merchant portal, reading one item or all of them, and the safe rendering of the text.
// Runs against the isolated demo backend (:3100). Staff create the campaigns through e2e/admin.ts (`sendCampaign`); the
// isolated worker fans each one out, so every test waits for the count to move before it opens the page (up to 20 s).
// Rules (F03): every test that changes data uses a throwaway customer or merchant; nothing global is switched.
// The admin API refuses HTML in a campaign ("Write plain text"), so the escaping test sends the same characters the other
// way round: an HTML entity and a bare `<2>`, which a page that parsed the text as HTML would swallow or turn into a tag.
import type { Locator, Page } from "@playwright/test";
import { customerIdByEmail, merchantIdByEmail, sendCampaign } from "./admin";
import { expect, test } from "./fixtures";
import { ACCOUNTS, freshCustomer, freshMerchant, signInCustomer, signInMerchant } from "./helpers";

type Surface = "customer" | "merchant";

const COUNT_PATH: Record<Surface, string> = {
  customer: "/store/v1/me/notifications/unread-count",
  merchant: "/client/notifications/unread-count",
};

/** A short unique word, so one test's titles never match another's. */
const tag = () => Math.random().toString(36).slice(2, 8);

/** The bell of the workspace header (the rail's own "Notifications" link lives outside the header). */
const bell = (page: Page) => page.locator("header").getByRole("link", { name: /^Notifications/ });

/** The items on the page, or the one whose title holds `title`. */
const items = (page: Page) => page.locator("li[data-notification-id]");
const item = (page: Page, title: string) => items(page).filter({ hasText: title });

async function unreadCount(page: Page, surface: Surface): Promise<number> {
  const res = await page.request.get(COUNT_PATH[surface]);
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { unread: number }).unread;
}

/** Waits until the API counts `n` unread items: the worker needs a few seconds to fan a campaign out. */
async function waitForUnread(page: Page, surface: Surface, n: number) {
  await expect.poll(() => unreadCount(page, surface), { timeout: 20_000, intervals: [500, 1_000] }).toBe(n);
}

async function csrfCookie(page: Page, surface: Surface): Promise<string | undefined> {
  const name = surface === "customer" ? "csrf_token_store" : "csrf_token_client";
  return (await page.context().cookies()).find((cookie) => cookie.name === name)?.value;
}

/** The newest notification id the page shows. */
async function newestIdOnScreen(page: Page): Promise<number> {
  const ids = await items(page).evaluateAll((rows) => rows.map((row) => Number(row.getAttribute("data-notification-id"))));
  return Math.max(...ids);
}

/** Waits until React has attached to an element (its handlers and effects exist from then on). */
async function hydrated(locator: Locator) {
  await expect.poll(() => locator.evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps")))).toBe(true);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
  const header = page.locator("header").first();
  const [scroll, client] = await header.evaluate((element) => [element.scrollWidth, element.clientWidth]);
  expect(scroll, "the header content is wider than the header").toBeLessThanOrEqual(client);
}

/** A control of the header lies inside the viewport. */
async function expectInsideViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box, "the control is not on screen").not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
}

test.describe("customer", () => {
  test("a campaign reaches the bell and the page, and its text is shown as plain text", async ({ page }) => {
    const email = await freshCustomer(page);
    const title = `Order update ${tag()}`;
    await sendCampaign({
      to: { type: "customer", id: await customerIdByEmail(email) },
      title,
      body: "Line one\nLine two &lt;b&gt;x&lt;/b&gt; and 1 <2> 3",
      link: "/account/orders",
    });
    await waitForUnread(page, "customer", 1);

    await page.goto("/en/account/notifications");
    await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
    await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");
    await expect(bell(page)).toContainText("1");

    const row = item(page, title);
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("heading", { name: title })).toBeVisible();
    await expect(row.getByText("Unread", { exact: true })).toBeVisible();

    // Text nodes only: the entity and the angle brackets appear exactly as sent, and no element came out of them.
    const body = row.locator("h2 + p");
    await expect(body).toHaveText("Line one\nLine two &lt;b&gt;x&lt;/b&gt; and 1 <2> 3", { useInnerText: true });
    expect(((await body.innerText()).match(/\n/g) ?? []).length, "the line break is kept: two lines").toBe(1);
    await expect(body).toHaveCSS("white-space", "pre-line");
    await expect(row.locator("b, i, script")).toHaveCount(0);
  });

  test("the item link points to the page under /en", async ({ page }) => {
    const email = await freshCustomer(page);
    const id = await customerIdByEmail(email);
    const title = `With link ${tag()}`;
    await sendCampaign({ to: { type: "customer", id }, title, body: "Opens the orders", link: "/account/orders" });
    await waitForUnread(page, "customer", 1);

    await page.goto("/en/account/notifications");
    await expect(item(page, title).getByRole("link", { name: "Open" })).toHaveAttribute("href", "/en/account/orders");
  });

  test("an empty list says so on both tabs", async ({ page }) => {
    await freshCustomer(page);
    await page.goto("/en/account/notifications");
    await expect(page.getByRole("heading", { name: "No notifications yet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark all as read" })).toHaveCount(0);
    await expect(bell(page)).toHaveAccessibleName("Notifications");

    await page.getByRole("link", { name: /^Unread/ }).click();
    await expect(page).toHaveURL(/\/en\/account\/notifications\?unread=1$/);
    await expect(page.getByRole("heading", { name: "You are all caught up" })).toBeVisible();
    await page.getByRole("link", { name: "Show all notifications" }).click();
    await expect(page.getByRole("heading", { name: "No notifications yet" })).toBeVisible();
  });

  test("marking one item read updates the bell and empties the unread tab", async ({ page }) => {
    const email = await freshCustomer(page);
    const title = `Read me ${tag()}`;
    await sendCampaign({ to: { type: "customer", id: await customerIdByEmail(email) }, title, body: "Mark this one" });
    await waitForUnread(page, "customer", 1);

    await page.goto("/en/account/notifications");
    await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");
    await hydrated(item(page, title).getByRole("button", { name: "Mark as read" }));

    const read = page.waitForRequest((request) => request.method() === "POST" && /\/store\/v1\/me\/notifications\/\d+\/read$/.test(request.url()));
    await item(page, title).getByRole("button", { name: "Mark as read" }).click();
    const request = await read;
    // The CSRF token of the called surface, no body and no Content-Type (the route takes none).
    expect(request.headers()["x-csrf-token"]).toBe(await csrfCookie(page, "customer"));
    expect(request.postData()).toBeNull();
    expect(request.headers()["content-type"]).toBeUndefined();

    await expect(bell(page)).toHaveAccessibleName("Notifications");
    await expect(item(page, title).getByText("Unread", { exact: true })).toHaveCount(0);
    await expect(item(page, title).getByRole("button", { name: "Mark as read" })).toHaveCount(0);
    expect(await unreadCount(page, "customer")).toBe(0);

    await page.getByRole("link", { name: /^Unread/ }).click();
    await expect(page.getByRole("heading", { name: "You are all caught up" })).toBeVisible();
  });

  test("read all keeps newer items unread: upToId is the newest id on screen", async ({ page }) => {
    const email = await freshCustomer(page);
    const id = await customerIdByEmail(email);
    const [first, second, third] = [`First ${tag()}`, `Second ${tag()}`, `Third ${tag()}`];
    await sendCampaign({ to: { type: "customer", id }, title: first, body: "one" });
    await waitForUnread(page, "customer", 1);
    await sendCampaign({ to: { type: "customer", id }, title: second, body: "two" });
    await waitForUnread(page, "customer", 2);

    // Pinned to the page as drawn: the live stream would refresh it under the test (the live path is covered by
    // realtime-notifications.spec.ts).
    await page.route("**/store/v1/me/stream*", (route) => route.abort());
    await page.goto("/en/account/notifications");
    await expect(items(page)).toHaveCount(2);
    const newestOnScreen = await newestIdOnScreen(page);
    const markAll = page.getByRole("button", { name: "Mark all as read" });
    await hydrated(markAll);

    // A third campaign arrives after the page was drawn and before the button is pressed.
    await sendCampaign({ to: { type: "customer", id }, title: third, body: "three" });
    await waitForUnread(page, "customer", 3);

    let sent: unknown;
    let csrf: string | undefined;
    await page.route("**/store/v1/me/notifications/read-all", async (route) => {
      sent = route.request().postDataJSON();
      csrf = route.request().headers()["x-csrf-token"];
      await route.continue();
    });
    await markAll.click();
    await expect(page.getByText("2 marked as read")).toBeVisible();
    expect(sent).toEqual({ upToId: newestOnScreen });
    expect(csrf).toBe(await csrfCookie(page, "customer"));

    // The third item came after `upToId`: it stays unread, and the bell says so.
    await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");
    expect(await unreadCount(page, "customer")).toBe(1);
    await expect(item(page, third).getByText("Unread", { exact: true })).toBeVisible();
    await expect(item(page, first).getByText("Unread", { exact: true })).toHaveCount(0);
    await expect(item(page, second).getByText("Unread", { exact: true })).toHaveCount(0);
  });

  test("the bell says 99+ when the API reports its cap of 100", async ({ page }) => {
    await freshCustomer(page);
    // The browser store asks for the count once a minute: let its clock jump instead of waiting.
    await page.clock.install();
    await page.route("**/store/v1/me/notifications/unread-count", (route) => route.fulfill({ json: { unread: 100 } }));
    // Tests the poll alone: the stream's snapshot and its live floor would compete with the mocked count (the live path is
    // covered by realtime-notifications.spec.ts).
    await page.route("**/store/v1/me/stream*", (route) => route.abort());
    await page.goto("/en/account/notifications");
    const link = bell(page);
    await expect(link).toHaveAccessibleName("Notifications"); // the server's own first count is 0
    await hydrated(link);
    await expect(async () => {
      await page.clock.fastForward(61_000);
      await expect(link).toHaveAccessibleName("Notifications, 99+ unread", { timeout: 1_500 });
    }).toPass({ timeout: 20_000 });
    await expect(link).toContainText("99+");
  });

  test("a signed-out visit to the page goes to sign-in", async ({ page }) => {
    await page.goto("/en/account/notifications");
    await expect(page).toHaveURL(/\/en\/sign-in\?.*next=%2Fen%2Faccount%2Fnotifications/);
  });
});

test.describe("merchant", () => {
  test("a merchant has the bell, the nav item and the page; read and open work on the merchant surface", async ({ page, isMobile }) => {
    const account = await freshMerchant(page);
    await signInMerchant(page, account);
    const id = await merchantIdByEmail(account.email);
    const withLink = `Settings news ${tag()}`;
    const plain = `Plain news ${tag()}`;
    await sendCampaign({ to: { type: "client", id }, title: withLink, body: "Line A\nLine B", link: "/merchant/settings/notifications" });
    await waitForUnread(page, "merchant", 1);
    await sendCampaign({ to: { type: "client", id }, title: plain, body: "No link here" });
    await waitForUnread(page, "merchant", 2);

    await page.goto("/en/merchant/notifications");
    await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
    await expect(page.getByText("Your merchant account is waiting for approval")).toHaveCount(0); // staff-made accounts are active
    await expect(bell(page)).toHaveAccessibleName("Notifications, 2 unread");
    // The rail's item, with its live badge in its name (owner, 2026-11-15); the bell has the same name, so scope to the rail.
    if (!isMobile) {
      const rail = page.getByRole("navigation", { name: "Workspace navigation" });
      // The badge words are their own visually hidden span, so the name reads "Notifications , 2 unread" (a joined space).
      await expect(rail.getByRole("link", { name: /^Notifications\s*,\s*2 unread$/ })).toBeVisible();
    }

    await expect(item(page, withLink).locator("h2 + p")).toHaveText("Line A\nLine B", { useInnerText: true });
    await expect(item(page, withLink).getByRole("link", { name: "Open" })).toHaveAttribute("href", "/en/merchant/settings/notifications");
    await expect(item(page, plain).getByRole("link", { name: "Open" })).toHaveCount(0);

    // Mark one read: the merchant route and the merchant surface's CSRF token.
    await hydrated(item(page, plain).getByRole("button", { name: "Mark as read" }));
    const read = page.waitForRequest((request) => request.method() === "POST" && /\/client\/notifications\/\d+\/read$/.test(request.url()));
    await item(page, plain).getByRole("button", { name: "Mark as read" }).click();
    expect((await read).headers()["x-csrf-token"]).toBe(await csrfCookie(page, "merchant"));
    await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");

    // Following the link also reads the item (the bell on the next page catches up).
    await item(page, withLink).getByRole("link", { name: "Open" }).click();
    await expect(page).toHaveURL(/\/en\/merchant\/settings\/notifications$/);
    await waitForUnread(page, "merchant", 0);
    await expect(bell(page)).toHaveAccessibleName("Notifications");
  });

  test("read all on the merchant surface sends upToId and keeps newer items", async ({ page }) => {
    const account = await freshMerchant(page);
    await signInMerchant(page, account);
    const id = await merchantIdByEmail(account.email);
    const [older, newer] = [`Older ${tag()}`, `Newer ${tag()}`];
    await sendCampaign({ to: { type: "client", id }, title: older, body: "first" });
    await waitForUnread(page, "merchant", 1);

    // Pinned to the page as drawn: the live stream would refresh it under the test (the live path is covered by
    // realtime-notifications.spec.ts).
    await page.route("**/client/stream*", (route) => route.abort());
    await page.goto("/en/merchant/notifications");
    await expect(items(page)).toHaveCount(1);
    const newestOnScreen = await newestIdOnScreen(page);
    const markAll = page.getByRole("button", { name: "Mark all as read" });
    await hydrated(markAll);
    await sendCampaign({ to: { type: "client", id }, title: newer, body: "second" });
    await waitForUnread(page, "merchant", 2);

    const request = page.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname === "/client/notifications/read-all");
    await markAll.click();
    const sent = await request;
    expect(sent.postDataJSON()).toEqual({ upToId: newestOnScreen });
    expect(sent.headers()["x-csrf-token"]).toBe(await csrfCookie(page, "merchant"));
    await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");
    await expect(item(page, newer).getByText("Unread", { exact: true })).toBeVisible();
  });

  test("a signed-out visit to the page goes to sign-in", async ({ page }) => {
    await page.goto("/en/merchant/notifications");
    await expect(page).toHaveURL(/\/en\/sign-in\?.*next=%2Fen%2Fmerchant%2Fnotifications/);
  });
});

test.describe("narrow screens", () => {
  test.beforeEach(async ({ page }) => page.setViewportSize({ width: 360, height: 800 }));

  test("the customer header has no horizontal overflow at 360 px", async ({ page }) => {
    await signInCustomer(page, ACCOUNTS.customer);
    await page.goto("/en/account/notifications");
    await expect(bell(page)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectInsideViewport(page, bell(page));
    await expectInsideViewport(page, page.getByRole("button", { name: "Account menu" }));
  });

  test("a pending merchant's header has no horizontal overflow at 360 px", async ({ page }) => {
    // Staff-made accounts are active, so the waiting state is the demo's own pending account (only read here).
    await signInMerchant(page, ACCOUNTS.pendingMerchant);
    await page.goto("/en/merchant");
    await expect(bell(page)).toBeVisible();
    // The badge repeats what the banner under the header says: on a phone it is only a small clock icon, which makes room for the bell.
    const badge = page.locator("header").first().getByText("Waiting for approval").locator("xpath=..");
    await expect(badge).toBeVisible();
    expect((await badge.boundingBox())?.width ?? Infinity, "the badge is a compact icon").toBeLessThan(60);
    await expectNoHorizontalOverflow(page);
    await expectInsideViewport(page, bell(page));
    await expectInsideViewport(page, page.getByRole("button", { name: "Account menu" }));
  });

  test("an approved merchant's header has no horizontal overflow at 360 px, and the wallet pill steps aside", async ({ page }) => {
    await signInMerchant(page, ACCOUNTS.merchant);
    await page.goto("/en/merchant/notifications");
    await expect(bell(page)).toBeVisible();
    await expect(page.locator("header").first().getByRole("link", { name: /Available balance/ })).toBeHidden();
    await expectNoHorizontalOverflow(page);
    await expectInsideViewport(page, bell(page));
    await expectInsideViewport(page, page.getByRole("button", { name: "Account menu" }));
  });
});
