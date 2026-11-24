// Live notifications (feature 27, plan §5.1): the bell, the toast and the notifications list change the moment staff send
// a campaign, with no reload. The browser opens ONE stream per family (the shop's for a retail account, the portal's for a merchant
// rank), shared by its tabs, and only where a bell is.
// Runs against the isolated demo backend (:3100) whose worker fans a campaign out within a few seconds; the live path
// then has to deliver it in the open page. Meant to be run by hand (the backend needs the three stream routes).
// Rules (F03): every test that changes data uses a throwaway account; nothing global is switched.
// A stream is "open" when the browser got the response of the stream route; the `ready` frame follows at once and the API
// registers the connection before it answers, so a campaign sent after that reaches the page as a live event (a short
// pause covers the frame itself). A campaign sent before would only arrive as a count, with no toast.
// The wait for that response is armed BEFORE the page is opened: `waitForResponse` only sees responses that arrive after
// the call, and the stream starts while the page hydrates, so a wait armed afterwards could miss it and time out.
import type { Locator, Page, Request } from "@playwright/test";
import { accountIdByEmail, sendCampaign } from "./admin";
import { expect, test } from "./fixtures";
import { freshAccount, signUpByLink } from "./helpers";

/** The API family of the account: a retail account reads the shop routes, a merchant rank the portal routes. */
type Family = "store" | "client";

const STREAM_PATH: Record<Family, string> = { store: "/store/v1/me/stream", client: "/client/stream" };
const COUNT_PATH: Record<Family, string> = {
  store: "/store/v1/me/notifications/unread-count",
  client: "/client/notifications/unread-count",
};

const tag = () => Math.random().toString(36).slice(2, 8);

/** The bell of the workspace header. */
const bell = (page: Page) => page.locator("header").getByRole("link", { name: /^Notifications/ });

/** The items on the notifications page. */
const items = (page: Page) => page.locator("li[data-notification-id]");
const item = (page: Page, title: string) => items(page).filter({ hasText: title });

/** The toast of a title: the toaster is the live region that holds it (the bell's own live region never does). */
const toastOf = (page: Page, title: string) => page.locator("[aria-live='polite']").filter({ hasText: title });

/** Stream requests of every tab of the context (an EventSource shows up as a request), by path, with their query. */
function watchStreams(page: Page, family: Family): string[] {
  const queries: string[] = [];
  page.context().on("request", (request: Request) => {
    const url = new URL(request.url());
    if (url.pathname === STREAM_PATH[family]) queries.push(url.search);
  });
  return queries;
}

/**
 * Arms the wait for the stream's response (status 200). Call it BEFORE `page.goto`, then `await` the result after the page
 * is up and pause a moment (`waitForTimeout(500)`) so the first frame (`ready`) has been handled.
 */
function streamOpened(page: Page, family: Family) {
  return page.waitForResponse((response) => new URL(response.url()).pathname === STREAM_PATH[family] && response.status() === 200);
}

async function unreadCount(page: Page, family: Family): Promise<number> {
  const res = await page.request.get(COUNT_PATH[family]);
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { unread: number }).unread;
}

/** Waits until the API counts `n` unread items (the worker fans a campaign out within seconds). */
async function waitForUnread(page: Page, family: Family, n: number) {
  await expect.poll(() => unreadCount(page, family), { timeout: 20_000, intervals: [500, 1_000] }).toBe(n);
}

/** Waits until React has attached to an element. */
async function hydrated(locator: Locator) {
  await expect.poll(() => locator.evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps")))).toBe(true);
}

/** A mark on the window: it is still there after the update only when the page was not reloaded. */
async function markPage(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __stayed?: boolean }).__stayed = true;
  });
}
async function expectNotReloaded(page: Page) {
  expect(await page.evaluate(() => (window as unknown as { __stayed?: boolean }).__stayed), "the page was reloaded").toBe(true);
}

test.describe("retail account", () => {
  test("a campaign reaches the bell and a toast with no reload; the toast links to the item", async ({ page }) => {
    const { email } = await signUpByLink(page);
    const title = `Live bell ${tag()}`;
    const opened = streamOpened(page, "store");
    await page.goto("/en/account");
    await hydrated(bell(page));
    await expect(bell(page)).toHaveAccessibleName("Notifications");
    await opened;
    await page.waitForTimeout(500);
    await markPage(page);

    await sendCampaign({
      to: { type: "account", id: await accountIdByEmail(email) },
      title,
      body: "Line one\nLine two",
      link: { customer: "/account/orders" },
    });

    // Without the stream this takes the one-minute poll; the stream brings it in a second or two, once the worker has fanned out.
    await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread", { timeout: 20_000 });
    await expect(bell(page)).toContainText("1");
    const toast = toastOf(page, title);
    await expect(toast.getByText(title, { exact: true })).toBeVisible();
    // The body is plain text on one line.
    await expect(toast.getByText("Line one Line two")).toBeVisible();
    await expect(toast.getByRole("link", { name: "View" })).toHaveAttribute("href", "/en/account/orders");
    await expectNotReloaded(page);

    await toast.getByRole("link", { name: "View" }).click();
    await expect(page).toHaveURL(/\/en\/account\/orders$/);
    await expect(toastOf(page, title)).toHaveCount(0); // following the link ends the toast
  });

  test("the notifications page shows a new item without a reload, and makes no toast for it", async ({ page }) => {
    const { email } = await signUpByLink(page);
    const title = `Live list ${tag()}`;
    const opened = streamOpened(page, "store");
    await page.goto("/en/account/notifications");
    await expect(page.getByRole("heading", { name: "No notifications yet" })).toBeVisible();
    await hydrated(bell(page));
    await opened;
    await page.waitForTimeout(500);
    await markPage(page);

    await sendCampaign({ to: { type: "account", id: await accountIdByEmail(email) }, title, body: "Appears in place" });

    await expect(item(page, title)).toHaveCount(1, { timeout: 20_000 });
    await expect(item(page, title).getByRole("heading", { name: title })).toBeVisible();
    await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");
    await expect(page.getByRole("heading", { name: "No notifications yet" })).toHaveCount(0);
    await expectNotReloaded(page);
    // The list shows it, so the toast stays away (the title appears once: in the list).
    await expect(page.getByText(title, { exact: true })).toHaveCount(1);

    // Reading it in another place (here: the API, as another device would) clears the badge on this page with no reload.
    const read = await page.request.post("/store/v1/me/notifications/read-all", {
      headers: { "X-CSRF-Token": (await page.context().cookies()).find((cookie) => cookie.name === "csrf_token_store")?.value ?? "" },
      data: {},
    });
    expect(read.status(), await read.text()).toBe(200);
    await expect(item(page, title).getByText("Unread", { exact: true })).toHaveCount(0, { timeout: 15_000 });
    await expect(bell(page)).toHaveAccessibleName("Notifications");
    await expectNotReloaded(page);
  });

  test("two tabs share one stream, both update, and the second tab takes over when the first closes", async ({ page }) => {
    const { email } = await signUpByLink(page);
    const id = await accountIdByEmail(email);
    const streams = watchStreams(page, "store");
    const opened = streamOpened(page, "store");
    await page.goto("/en/account");
    await hydrated(bell(page));
    await opened;
    await page.waitForTimeout(500);

    const second = await page.context().newPage();
    await second.goto("/en/account");
    await hydrated(bell(second));
    await second.waitForTimeout(1_000);
    expect(streams, "one stream for the browser, not one per tab").toHaveLength(1);
    expect(streams[0], "the stream sends no language").toBe("");

    const first = `Shared one ${tag()}`;
    await markPage(second);
    await sendCampaign({ to: { type: "account", id }, title: first, body: "both tabs" });
    await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread", { timeout: 20_000 });
    await expect(bell(second)).toHaveAccessibleName("Notifications, 1 unread");
    expect(streams).toHaveLength(1);
    await expectNotReloaded(second);

    // The leader closes: the lock passes to the other tab, which opens a stream with the cursor of the last item.
    await page.close();
    await expect.poll(() => streams.length, { timeout: 15_000 }).toBe(2);
    expect(streams[1]).toMatch(/^\?cursor=i\d+(-t\d+)?$/);
    await second.waitForTimeout(500);

    const next = `Shared two ${tag()}`;
    await sendCampaign({ to: { type: "account", id }, title: next, body: "after the hand-over" });
    await expect(bell(second)).toHaveAccessibleName("Notifications, 2 unread", { timeout: 20_000 });
    await expect(toastOf(second, next).getByText(next, { exact: true })).toBeVisible();
    await expectNotReloaded(second);
  });

  // Owner, 2026-11-15: the bell belongs in the shop header too. A signed-in visitor gets it (and its stream) on every shop page.
  test("the shop header has the bell for a signed-in retail account, and a campaign reaches it on the home page with no reload", async ({
    page,
  }) => {
    const { email } = await signUpByLink(page);
    const title = `Home bell ${tag()}`;
    const opened = streamOpened(page, "store");
    await page.goto("/en");
    await hydrated(bell(page));
    await expect(bell(page)).toHaveAccessibleName("Notifications");
    await opened;
    await page.waitForTimeout(500);
    await markPage(page);

    await sendCampaign({ to: { type: "account", id: await accountIdByEmail(email) }, title, body: "From the home page" });

    await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread", { timeout: 20_000 });
    await expect(toastOf(page, title).getByText(title, { exact: true })).toBeVisible();
    await expectNotReloaded(page);
  });

  test("a signed-out visitor gets no bell and opens no stream", async ({ page }) => {
    const streams = watchStreams(page, "store");
    await page.goto("/en/services");
    await page.waitForLoadState("load");
    await page.waitForTimeout(1_500);
    expect(streams).toHaveLength(0);
    await expect(bell(page)).toHaveCount(0);
  });

  test("a refused stream leaves the poll in charge: the bell still catches up", async ({ page }) => {
    const { email } = await signUpByLink(page);
    // The browser store asks for the count once a minute: let its clock jump instead of waiting.
    await page.clock.install();
    await page.route(`**${STREAM_PATH.store}*`, (route) =>
      route.fulfill({ status: 503, contentType: "application/problem+json", body: JSON.stringify({ status: 503, code: "UNAVAILABLE", title: "Unavailable" }) }),
    );
    await page.goto("/en/account");
    const link = bell(page);
    await hydrated(link);
    await expect(link).toHaveAccessibleName("Notifications");

    await sendCampaign({ to: { type: "account", id: await accountIdByEmail(email) }, title: `Poll ${tag()}`, body: "no stream" });
    await waitForUnread(page, "store", 1);
    await expect(async () => {
      await page.clock.fastForward(61_000);
      await expect(link).toHaveAccessibleName("Notifications, 1 unread", { timeout: 1_500 });
    }).toPass({ timeout: 20_000 });
  });
});

test.describe("merchant rank", () => {
  test("a campaign reaches the merchant's bell and toast with no reload", async ({ page }) => {
    const account = await freshAccount(page, { rank: "merchant", signedIn: true });
    const title = `Live merchant ${tag()}`;
    const opened = streamOpened(page, "client");
    await page.goto("/en/account");
    await hydrated(bell(page));
    await expect(bell(page)).toHaveAccessibleName("Notifications");
    await opened;
    await page.waitForTimeout(500);
    await markPage(page);

    // The stored link is a portal address: the toast shows the page that replaced it.
    await sendCampaign({ to: { type: "account", id: account.id }, title, body: "For the portal", link: { merchant: "/merchant/settings/notifications" } });

    await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread", { timeout: 20_000 });
    const toast = toastOf(page, title);
    await expect(toast.getByText(title, { exact: true })).toBeVisible();
    await expect(toast.getByRole("link", { name: "View" })).toHaveAttribute("href", "/en/account/settings/notifications");
    await expectNotReloaded(page);
  });

  test("the notifications page of a merchant rank shows a new item without a reload", async ({ page }) => {
    const account = await freshAccount(page, { rank: "merchant", signedIn: true });
    const title = `Live merchant list ${tag()}`;
    const opened = streamOpened(page, "client");
    await page.goto("/en/account/notifications");
    await expect(page.getByRole("heading", { name: "No notifications yet" })).toBeVisible();
    await hydrated(bell(page));
    await opened;
    await page.waitForTimeout(500);
    await markPage(page);

    await sendCampaign({ to: { type: "account", id: account.id }, title, body: "Appears in place" });

    await expect(item(page, title)).toHaveCount(1, { timeout: 20_000 });
    await expect(bell(page)).toHaveAccessibleName("Notifications, 1 unread");
    await expectNotReloaded(page);
  });
});
