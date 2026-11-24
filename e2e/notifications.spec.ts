// The notification center (plan F11, BH §4.1, §4.2, §4.4): the bell in the header of the one account frame, the one notifications page
// (`/en/account/notifications`) that a retail account and a merchant rank both read (each its own inbox), reading one item or all of
// them, and the safe rendering of the text.
// Runs against the isolated demo backend (:3100). Staff create the campaigns through e2e/admin.ts (`sendCampaign`); the
// isolated worker fans each one out, so every test waits for the count to move before it opens the page (up to 20 s).
// Rules (F03): every test that changes data uses a throwaway account; nothing global is switched.
// A merchant rank's campaign link is still a portal address (`/merchant/...`): the backend takes that form for a merchant audience, and the
// page shows the page that replaced it (`/account/...`).
// The admin API refuses HTML in a campaign ("Write plain text"), so the escaping test sends the same characters the other
// way round: an HTML entity and a bare `<2>`, which a page that parsed the text as HTML would swallow or turn into a tag.
import type { Locator, Page } from "@playwright/test";
import { accountIdByEmail, sendCampaign } from "./admin";
import { expect, test } from "./fixtures";
import { ACCOUNTS, freshAccount, signIn, signUpByLink } from "./helpers";

/** The API family of the account: a retail account reads the shop routes, a merchant rank the portal routes. */
type Family = "store" | "client";

const COUNT_PATH: Record<Family, string> = {
  store: "/store/v1/me/notifications/unread-count",
  client: "/client/notifications/unread-count",
};

/** The one notifications page of every account. */
const PAGE = "/en/account/notifications";

/** A short unique word, so one test's titles never match another's. */
const tag = () => Math.random().toString(36).slice(2, 8);

/** The bell of the workspace header (the rail's own "Notifications" link lives outside the header). */
const bell = (page: Page) => page.locator("header").getByRole("link", { name: /^Notifications/ });

/** The items on the page, or the one whose title holds `title`. */
const items = (page: Page) => page.locator("li[data-notification-id]");
const item = (page: Page, title: string) => items(page).filter({ hasText: title });

async function unreadCount(page: Page, family: Family): Promise<number> {
  const res = await page.request.get(COUNT_PATH[family]);
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { unread: number }).unread;
}

/** Waits until the API counts `n` unread items: the worker needs a few seconds to fan a campaign out. */
async function waitForUnread(page: Page, family: Family, n: number) {
  await expect.poll(() => unreadCount(page, family), { timeout: 20_000, intervals: [500, 1_000] }).toBe(n);
}

/** The CSRF token the browser holds: the cookie is named for the family of the account. */
async function csrfCookie(page: Page, family: Family): Promise<string | undefined> {
  const name = family === "store" ? "csrf_token_store" : "csrf_token_client";
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

test.describe("retail account", () => {
  test("a campaign reaches the bell and the page, and its text is shown as plain text", async ({ page }) => {
    const { email } = await signUpByLink(page);
    const title = `Order update ${tag()}`;
    await sendCampaign({
      to: { type: "account", id: await accountIdByEmail(email) },
      title,
      body: "Line one\nLine two &lt;b&gt;x&lt;/b&gt; and 1 <2> 3",
      link: { customer: "/account/orders" },
    });
    await waitForUnread(page, "store", 1);

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
    const { email } = await signUpByLink(page);
    const id = await accountIdByEmail(email);
    const title = `With link ${tag()}`;
    await sendCampaign({ to: { type: "account", id }, title, body: "Opens the orders", link: { customer: "/account/orders" } });
    await waitForUnread(page, "store", 1);

    await page.goto("/en/account/notifications");
    await expect(item(page, title).getByRole("link", { name: "Open" })).toHaveAttribute("href", "/en/account/orders");
  });

  test("an empty list says so on both tabs", async ({ page }) => {
    await signUpByLink(page);
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
    const { email } = await signUpByLink(page);
    const title = `Read me ${tag()}`;
    await sendCampaign({ to: { type: "account", id: await accountIdByEmail(email) }, title, body: "Mark this one" });
    await waitForUnread(page, "store", 1);

    await page.goto("/en/account/notifications");
    await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");
    await hydrated(item(page, title).getByRole("button", { name: "Mark as read" }));

    const read = page.waitForRequest((request) => request.method() === "POST" && /\/store\/v1\/me\/notifications\/\d+\/read$/.test(request.url()));
    await item(page, title).getByRole("button", { name: "Mark as read" }).click();
    const request = await read;
    // The CSRF token of the called family, no body and no Content-Type (the route takes none).
    expect(request.headers()["x-csrf-token"]).toBe(await csrfCookie(page, "store"));
    expect(request.postData()).toBeNull();
    expect(request.headers()["content-type"]).toBeUndefined();

    await expect(bell(page)).toHaveAccessibleName("Notifications");
    await expect(item(page, title).getByText("Unread", { exact: true })).toHaveCount(0);
    await expect(item(page, title).getByRole("button", { name: "Mark as read" })).toHaveCount(0);
    expect(await unreadCount(page, "store")).toBe(0);

    await page.getByRole("link", { name: /^Unread/ }).click();
    await expect(page.getByRole("heading", { name: "You are all caught up" })).toBeVisible();
  });

  test("read all keeps newer items unread: upToId is the newest id on screen", async ({ page }) => {
    const { email } = await signUpByLink(page);
    const id = await accountIdByEmail(email);
    const [first, second, third] = [`First ${tag()}`, `Second ${tag()}`, `Third ${tag()}`];
    await sendCampaign({ to: { type: "account", id }, title: first, body: "one" });
    await waitForUnread(page, "store", 1);
    await sendCampaign({ to: { type: "account", id }, title: second, body: "two" });
    await waitForUnread(page, "store", 2);

    // Pinned to the page as drawn: the live stream would refresh it under the test (the live path is covered by
    // realtime-notifications.spec.ts).
    await page.route("**/store/v1/me/stream*", (route) => route.abort());
    await page.goto("/en/account/notifications");
    await expect(items(page)).toHaveCount(2);
    const newestOnScreen = await newestIdOnScreen(page);
    const markAll = page.getByRole("button", { name: "Mark all as read" });
    await hydrated(markAll);

    // A third campaign arrives after the page was drawn and before the button is pressed.
    await sendCampaign({ to: { type: "account", id }, title: third, body: "three" });
    await waitForUnread(page, "store", 3);

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
    expect(csrf).toBe(await csrfCookie(page, "store"));

    // The third item came after `upToId`: it stays unread, and the bell says so.
    await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");
    expect(await unreadCount(page, "store")).toBe(1);
    await expect(item(page, third).getByText("Unread", { exact: true })).toBeVisible();
    await expect(item(page, first).getByText("Unread", { exact: true })).toHaveCount(0);
    await expect(item(page, second).getByText("Unread", { exact: true })).toHaveCount(0);
  });

  test("the bell says 99+ when the API reports its cap of 100", async ({ page }) => {
    await signUpByLink(page);
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

test.describe("merchant rank", () => {
  test("a merchant has the bell, the nav item and the page; read and open work on the portal routes", async ({ page, isMobile }) => {
    const account = await freshAccount(page, { rank: "merchant", signedIn: true });
    const withLink = `Settings news ${tag()}`;
    const plain = `Plain news ${tag()}`;
    // The stored link is a portal address: the page shows the one that replaced it.
    await sendCampaign({
      to: { type: "account", id: account.id },
      title: withLink,
      body: "Line A\nLine B",
      link: { merchant: "/merchant/settings/notifications" },
    });
    await waitForUnread(page, "client", 1);
    await sendCampaign({ to: { type: "account", id: account.id }, title: plain, body: "No link here" });
    await waitForUnread(page, "client", 2);

    await page.goto(PAGE);
    await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
    await expect(bell(page)).toHaveAccessibleName("Notifications, 2 unread");
    // The rail's item, with its live badge in its name (owner, 2026-11-15); the bell has the same name, so scope to the rail.
    if (!isMobile) {
      const rail = page.getByRole("navigation", { name: "Workspace navigation" });
      // The badge words are their own visually hidden span, so the name reads "Notifications , 2 unread" (a joined space).
      await expect(rail.getByRole("link", { name: /^Notifications\s*,\s*2 unread$/ })).toBeVisible();
    }

    await expect(item(page, withLink).locator("h2 + p")).toHaveText("Line A\nLine B", { useInnerText: true });
    await expect(item(page, withLink).getByRole("link", { name: "Open" })).toHaveAttribute("href", "/en/account/settings/notifications");
    await expect(item(page, plain).getByRole("link", { name: "Open" })).toHaveCount(0);

    // Mark one read: the portal route and the CSRF token of the portal family.
    await hydrated(item(page, plain).getByRole("button", { name: "Mark as read" }));
    const read = page.waitForRequest((request) => request.method() === "POST" && /\/client\/notifications\/\d+\/read$/.test(request.url()));
    await item(page, plain).getByRole("button", { name: "Mark as read" }).click();
    expect((await read).headers()["x-csrf-token"]).toBe(await csrfCookie(page, "client"));
    await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");

    // Following the link also reads the item (the bell on the next page catches up).
    await item(page, withLink).getByRole("link", { name: "Open" }).click();
    await expect(page).toHaveURL(/\/en\/account\/settings\/notifications$/);
    await waitForUnread(page, "client", 0);
    await expect(bell(page)).toHaveAccessibleName("Notifications");
  });

  test("read all on the portal routes sends upToId and keeps newer items", async ({ page }) => {
    const account = await freshAccount(page, { rank: "merchant", signedIn: true });
    const [older, newer] = [`Older ${tag()}`, `Newer ${tag()}`];
    await sendCampaign({ to: { type: "account", id: account.id }, title: older, body: "first" });
    await waitForUnread(page, "client", 1);

    // Pinned to the page as drawn: the live stream would refresh it under the test (the live path is covered by
    // realtime-notifications.spec.ts).
    await page.route("**/client/stream*", (route) => route.abort());
    await page.goto(PAGE);
    await expect(items(page)).toHaveCount(1);
    const newestOnScreen = await newestIdOnScreen(page);
    const markAll = page.getByRole("button", { name: "Mark all as read" });
    await hydrated(markAll);
    await sendCampaign({ to: { type: "account", id: account.id }, title: newer, body: "second" });
    await waitForUnread(page, "client", 2);

    const request = page.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname === "/client/notifications/read-all");
    await markAll.click();
    const sent = await request;
    expect(sent.postDataJSON()).toEqual({ upToId: newestOnScreen });
    expect(sent.headers()["x-csrf-token"]).toBe(await csrfCookie(page, "client"));
    await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");
    await expect(item(page, newer).getByText("Unread", { exact: true })).toBeVisible();
  });

  test("a merchant never sees what was sent to a retail account's inbox", async ({ page }) => {
    // One page, two inboxes: the page reads the inbox of the family the session belongs to, never the other one.
    const retail = await signUpByLink(page);
    const retailTitle = `Retail only ${tag()}`;
    await sendCampaign({ to: { type: "account", id: await accountIdByEmail(retail.email) }, title: retailTitle, body: "for the shop inbox" });
    await waitForUnread(page, "store", 1);

    await page.context().clearCookies();
    await freshAccount(page, { rank: "merchant", signedIn: true });
    await page.goto(PAGE);
    await expect(page.getByRole("heading", { name: "No notifications yet" })).toBeVisible();
    await expect(page.getByText(retailTitle)).toHaveCount(0);
  });

  test("the old portal address of the page leads to the one page", async ({ page }) => {
    await freshAccount(page, { rank: "merchant", signedIn: true });
    await page.goto("/en/merchant/notifications");
    await expect(page).toHaveURL(/\/en\/account\/notifications$/);
    await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
  });
});

test.describe("every account", () => {
  test("a signed-out visit to the page goes to sign-in, which comes back to it", async ({ page }) => {
    await page.goto(PAGE);
    await expect(page).toHaveURL(/\/en\/sign-in\?.*next=%2Fen%2Faccount%2Fnotifications/);
  });
});

test.describe("narrow screens", () => {
  test.beforeEach(async ({ page }) => page.setViewportSize({ width: 360, height: 800 }));

  test("a retail account's header has no horizontal overflow at 360 px", async ({ page }) => {
    await signIn(page, ACCOUNTS.retail);
    await page.goto(PAGE);
    await expect(bell(page)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectInsideViewport(page, bell(page));
    await expectInsideViewport(page, page.getByRole("button", { name: "Account menu" }));
  });

  test("a merchant rank's header has no horizontal overflow at 360 px, and the wallet pill steps aside", async ({ page }) => {
    await signIn(page, ACCOUNTS.merchant);
    await page.goto(PAGE);
    await expect(bell(page)).toBeVisible();
    await expect(page.locator("header").first().getByRole("link", { name: /Available balance/ })).toBeHidden();
    await expectNoHorizontalOverflow(page);
    await expectInsideViewport(page, bell(page));
    await expectInsideViewport(page, page.getByRole("button", { name: "Account menu" }));
  });
});
