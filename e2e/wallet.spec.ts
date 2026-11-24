// The wallet page at /en/account/wallet, one address for every account (plan F21, BH §3.1, §3.2, §3.6): the store balance of a
// retail rank with its balance cards, notices and dated statement, the header pill and the nav item, the narrow header, and the
// wallet of a merchant rank that shares its cards and statement with it; each rank is kept off the other's pages, and the page
// follows an account whose rank changes. Runs against the isolated demo backend (:3100) with the store wallet switched on by the
// global setup (e2e/global-setup.ts).
// Rules (F03): every test that changes data uses a throwaway account (`signUpByLink`, `freshAccount`); nothing global is
// switched; staff credit, freeze and change a rank through e2e/admin.ts. `wallet-disabled.spec.ts` is the exclusive spec that
// switches the wallet off. Amounts are checked on the English page ("$20.00").
import type { Locator, Page } from "@playwright/test";
import { accountIdByEmail, changeRank, creditAccount, freezeWallet } from "./admin";
import { expect, test } from "./fixtures";
import { ACCOUNTS, freshAccount, go, signIn, signUpByLink } from "./helpers";

const main = (page: Page) => page.getByRole("main");

/** Lists render a table from `md` up and a compact list below: only the visible copy counts. */
const vis = (locator: Locator) => locator.filter({ visible: true });

/** The workspace header (the page's own card header comes later in the document). */
const header = (page: Page) => page.locator("header").first();
const pill = (page: Page) => header(page).locator('a[href="/en/account/wallet"][aria-label]');
const bell = (page: Page) => header(page).locator('a[href="/en/account/notifications"]:not(dialog a)');

/** A statistic card of the page, found by its label: the container of the label, the figure and the hint. */
const card = (page: Page, label: string) => main(page).getByText(label, { exact: true }).locator("xpath=..");

/** The statement card (a named region). The table inside it is a region too ("Wallet statement"), hence `exact`. */
const statementCard = (page: Page, name: string) => main(page).getByRole("region", { name, exact: true });

/** The date range form of the statement, and one of its fields. */
const rangeForm = (page: Page, name: string) => main(page).getByRole("search", { name, exact: true });
const field = (form: Locator, label: string) => form.getByLabel(label, { exact: true });

/** Waits until React has attached to an element: before that a click would submit the plain GET form. */
async function hydrated(locator: Locator) {
  await expect.poll(() => locator.evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps")))).toBe(true);
}

/** The UTC calendar day `offset` days from now, as the date inputs and the API's day boundaries read it. */
function utcDay(offset = 0): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

/** A throwaway retail account with a balance, signed in. */
async function customerWith(page: Page, amount: string, reason?: string): Promise<number> {
  const { email } = await signUpByLink(page);
  const id = await accountIdByEmail(email);
  await creditAccount(id, amount, reason);
  return id;
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
  const [scroll, client] = await header(page).evaluate((element) => [element.scrollWidth, element.clientWidth]);
  expect(scroll, "the header content is wider than the header").toBeLessThanOrEqual(client);
}

/** A control lies inside the viewport. */
async function expectInsideViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box, "the control is not on screen").not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
}

test.describe("wallet of a retail rank", () => {
  test("a new customer with a zero balance has the nav item, the page, Add funds and an empty statement", async ({ page, isMobile }) => {
    await signUpByLink(page);
    await go(page, "/en/account");
    if (isMobile) {
      await go(page, "/en/account/wallet");
    } else {
      // The rail's item (the drawer holds the same link below `lg`).
      const item = page.getByRole("link", { name: "Wallet", exact: true });
      await expect(item).toBeVisible();
      await item.click();
    }
    await expect(page).toHaveURL(/\/en\/account\/wallet$/);
    await expect(page.getByRole("heading", { level: 1, name: "Wallet" })).toBeVisible();

    await expect(card(page, "Available balance")).toContainText("$0.00");
    await expect(card(page, "Balance")).toContainText("$0.00");
    await expect(card(page, "Available balance")).toContainText("Amounts are in US dollars (USD)");
    await expect(main(page).getByRole("link", { name: "Add funds" })).toHaveAttribute("href", "/en/account/wallet/add-funds");
    await expect(main(page).getByText("Pending top-ups")).toHaveCount(0);
    await expect(main(page).getByRole("alert")).toHaveCount(0);

    // The pill is in the header from `sm` up; on a phone it steps aside (the navigation has the wallet).
    if (isMobile) await expect(pill(page)).toBeHidden();
    else await expect(pill(page)).toHaveAccessibleName("Store balance: $0.00");

    await expect(statementCard(page, "Statement").getByRole("heading", { name: "No transactions yet" })).toBeVisible();
    await expect(main(page).getByRole("columnheader")).toHaveCount(0);
  });

  // F33 (W3) shows a notice for the returning top-up; an id that is not the customer's must not break the wallet page.
  test("the return address of an online top-up (?topUp=) with an unknown id still shows the wallet", async ({ page }) => {
    await signUpByLink(page);
    await go(page, "/en/account/wallet?topUp=123");
    await expect(page.getByRole("heading", { level: 1, name: "Wallet" })).toBeVisible();
    await expect(card(page, "Available balance")).toContainText("$0.00");
    await expect(main(page).getByText("We could not load")).toHaveCount(0);
  });

  test("a credit shows in the header pill and the card, and the statement names it without the staff memo", async ({ page, isMobile }) => {
    await customerWith(page, "20.0000", "Secret staff reason 4821");
    await go(page, "/en/account/wallet");

    await expect(card(page, "Available balance")).toContainText("$20.00");
    await expect(card(page, "Balance")).toContainText("$20.00");
    if (!isMobile) await expect(pill(page)).toHaveAccessibleName("Store balance: $20.00");

    const statement = statementCard(page, "Statement");
    await expect(vis(statement.getByText("Adjustment", { exact: true }))).toHaveCount(1);
    await expect(vis(statement.getByText("$20.00"))).not.toHaveCount(0);
    // The API's memo ("Balance adjustment") and the staff's reason are English text for staff: never on the page.
    await expect(page.getByText(/Balance adjustment|Secret staff reason/)).toHaveCount(0);
    expect(await page.content()).not.toContain("Secret staff reason");
    await expect(statement.getByText("No transactions yet")).toHaveCount(0);
  });

  test("the date range filters the statement and the fields follow the address", async ({ page }) => {
    await customerWith(page, "20.0000");
    const today = utcDay();
    const tomorrow = utcDay(1);
    await go(page, "/en/account/wallet");
    const statement = statementCard(page, "Statement");
    await expect(vis(statement.getByText("Adjustment", { exact: true }))).toHaveCount(1);
    const form = rangeForm(page, "Filter the statement by date");
    await hydrated(field(form, "From"));
    await expect(form.getByRole("link", { name: "Clear dates" })).toHaveCount(0);

    // Tomorrow holds nothing.
    await field(form, "From").fill(tomorrow);
    await field(form, "To").fill(tomorrow);
    await form.getByRole("button", { name: "Show" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/account/wallet\\?from=${tomorrow}&to=${tomorrow}$`));
    await expect(statement.getByRole("heading", { name: "Nothing in this period" })).toBeVisible();
    await expect(main(page).getByRole("link", { name: "Clear dates" })).toHaveCount(2); // the form's and the empty state's
    await expect(statement.getByText("Adjustment", { exact: true })).toHaveCount(0);
    await expect(field(form, "From")).toHaveValue(tomorrow);
    await expect(field(form, "To")).toHaveValue(tomorrow);

    // Clearing goes back to every line, and the fields empty with the address.
    await form.getByRole("link", { name: "Clear dates" }).click();
    await expect(page).toHaveURL(/\/en\/account\/wallet$/);
    await expect(vis(statement.getByText("Adjustment", { exact: true }))).toHaveCount(1);
    await expect(field(form, "From")).toHaveValue("");
    await expect(field(form, "To")).toHaveValue("");

    // Today holds the credit: one end alone also works, and an empty field is left out of the address.
    await hydrated(field(form, "From"));
    await field(form, "From").fill(today);
    await form.getByRole("button", { name: "Show" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/account/wallet\\?from=${today}$`));
    await expect(vis(statement.getByText("Adjustment", { exact: true }))).toHaveCount(1);
    await field(form, "To").fill(today);
    await form.getByRole("button", { name: "Show" }).click();
    await expect(page).toHaveURL(new RegExp(`from=${today}&to=${today}$`));
    await expect(vis(statement.getByText("Adjustment", { exact: true }))).toHaveCount(1);
  });

  test("a start after the end is refused on the field, and a hand-made address shows the same message", async ({ page }) => {
    await customerWith(page, "20.0000");
    const message = "The start date must be on or before the end date.";
    await go(page, "/en/account/wallet");
    const form = rangeForm(page, "Filter the statement by date");
    await hydrated(field(form, "From"));
    await field(form, "From").fill(utcDay(1));
    await field(form, "To").fill(utcDay(0));
    await form.getByRole("button", { name: "Show" }).click();
    await expect(form.getByText(message)).toBeVisible();
    await expect(field(form, "To")).toBeFocused();
    await expect(field(form, "To")).toHaveAttribute("aria-invalid", "true");
    await expect(field(form, "To")).toHaveAccessibleDescription(message);
    await expect(page).toHaveURL(/\/en\/account\/wallet$/);

    // Typing a new end clears the message.
    await field(form, "To").fill(utcDay(2));
    await expect(form.getByText(message)).toHaveCount(0);

    // The same range in the address: both ends are dropped, every line shows, the message is there.
    await go(page, `/en/account/wallet?from=${utcDay(1)}&to=${utcDay(0)}`);
    await expect(rangeForm(page, "Filter the statement by date").getByText(message)).toBeVisible();
    await expect(vis(statementCard(page, "Statement").getByText("Adjustment", { exact: true }))).toHaveCount(1);
  });

  test("a balance on hold shows the hold and zero available, never the reason", async ({ page, isMobile }) => {
    const id = await customerWith(page, "20.0000");
    await freezeWallet(id, "Secret hold reason 4821");
    await go(page, "/en/account/wallet");

    const notice = main(page).getByRole("alert").filter({ hasText: "Your balance is on hold" });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/Since .+ your balance cannot be used to pay/);
    await expect(card(page, "Available balance")).toContainText("$0.00");
    await expect(card(page, "Balance")).toContainText("$20.00");
    if (!isMobile) await expect(pill(page)).toHaveAccessibleName("Store balance: $0.00");
    // A bank top-up still works while the balance is on hold, so Add funds stays.
    await expect(main(page).getByRole("link", { name: "Add funds" })).toBeVisible();
    await expect(page.getByText(/Secret hold reason/)).toHaveCount(0);
    expect(await page.content()).not.toContain("Secret hold reason");
  });

  test("the shop header shows the balance pill and a Wallet item in the account menu", async ({ page, isMobile }) => {
    await customerWith(page, "20.0000");
    await go(page, "/en");
    const toWallet = page.locator('a[href="/en/account/wallet"][aria-label]');
    const menu = page.getByRole("button", { name: "Account menu" });
    await expect(menu).toBeVisible();
    // The pill (the one wallet link with a label) is in the header from `sm` up.
    if (isMobile) await expect(toWallet).toBeHidden();
    else await expect(toWallet).toHaveAccessibleName("Store balance: $20.00");
    await menu.click();
    await expect(page.getByRole("link", { name: "Wallet", exact: true })).toHaveAttribute("href", "/en/account/wallet");
  });

  test("GET /store/v1/me/wallet is never cached", async ({ page }) => {
    await signUpByLink(page);
    const res = await page.request.get("/store/v1/me/wallet");
    expect(res.status(), await res.text()).toBe(200);
    expect(res.headers()["cache-control"] ?? "").toContain("no-store");
    expect(await res.json()).toMatchObject({ enabled: true, currency: "USD", balance: "0.0000" });
  });

  test("a signed-out visit goes to the one sign-in page and comes back to the wallet", async ({ page }) => {
    await page.goto("/en/account/wallet");
    await expect(page).toHaveURL(/\/en\/sign-in\?/);
    const query = new URL(page.url()).searchParams;
    expect(query.get("next")).toBe("/en/account/wallet");
    expect(query.has("as"), "there is one sign-in, whatever the account").toBe(false);
  });

  test("the pages of a merchant rank send a retail account to the account home", async ({ page }) => {
    await signUpByLink(page);
    for (const path of ["/en/account/invoices", "/en/account/invoices/1"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/en\/account$/);
    }
  });
});

test.describe("narrow screens", () => {
  test.beforeEach(async ({ page }) => page.setViewportSize({ width: 360, height: 800 }));

  test("the English wallet has no horizontal overflow at 360 px, and the pill steps aside for the bell", async ({ page }) => {
    await customerWith(page, "20.0000");
    await go(page, "/en/account/wallet");
    await expect(card(page, "Available balance")).toContainText("$20.00");
    await expect(bell(page)).toBeVisible();
    await expect(pill(page)).toBeHidden();
    await expectNoHorizontalOverflow(page);
    await expectInsideViewport(page, bell(page));
    await expectInsideViewport(page, page.getByRole("button", { name: "Account menu" }));

    // The date fields and the statement list stay inside the screen.
    const form = rangeForm(page, "Filter the statement by date");
    await expectInsideViewport(page, field(form, "From"));
    await expectInsideViewport(page, field(form, "To"));
    await expectInsideViewport(page, form.getByRole("button", { name: "Show" }));
    await expect(vis(statementCard(page, "Statement").getByText("Adjustment", { exact: true }))).toHaveCount(1);
  });
});

test.describe("wallet of a merchant rank (the same page, the same cards and statement)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.merchant);
  });

  test("shows its four cards, its notes, the CSV button and the statement lines", async ({ page }) => {
    await go(page, "/en/account/wallet");
    await expect(page.getByRole("heading", { level: 1, name: "Wallet" })).toBeVisible();

    const usd = (amount: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(amount));
    const wallet = (await (await page.request.get("/client/wallet")).json()) as { balance: string; reserved: string; creditLimit: string; available: string };
    for (const [label, hint, amount] of [
      ["Available balance", "Balance plus credit limit", wallet.available],
      ["Balance", "Negative while you use your credit", wallet.balance],
      ["Reserved", "Held for open orders", wallet.reserved],
      ["Credit limit", "Extra spending allowed", wallet.creditLimit],
    ] as const) {
      await expect(card(page, label)).toContainText(usd(amount));
      await expect(card(page, label)).toContainText(hint);
    }
    await expect(main(page).getByText("If you just paid online")).toBeVisible();
    await expect(main(page).getByRole("link", { name: "Add funds" })).toHaveAttribute("href", "/en/account/wallet/add-funds");
    await expect(main(page).getByRole("button", { name: "Download statement (CSV)" })).toBeVisible();

    await expect(main(page).getByRole("heading", { level: 2, name: "Account statement" })).toBeVisible();
    // The newest line of the API, with its description (the statement of a merchant rank keeps its memo column).
    const lines = (await (await page.request.get("/client/wallet/statement?_start=0&_end=1")).json()) as { kind: string; memo: string; amount: string }[];
    if (lines.length === 0) {
      await expect(main(page).getByRole("heading", { name: "No transactions yet" })).toBeVisible();
    } else if (lines[0].memo) {
      await expect(vis(main(page).getByText(lines[0].memo, { exact: true })).first()).toBeVisible();
    }
  });

  test("the table has its five columns from md up", async ({ page, isMobile }) => {
    test.skip(isMobile, "The table shows from md up; phones get the compact list.");
    await go(page, "/en/account/wallet");
    const lines = (await (await page.request.get("/client/wallet/statement?_start=0&_end=1")).json()) as unknown[];
    test.skip(lines.length === 0, "The demo merchant has no statement lines.");
    const columns = main(page).getByRole("columnheader");
    await expect(columns).toHaveText(["Date", "Type", "Description", "Amount", "Balance after"]);
  });

  test("the store balance routes refuse a merchant rank and its top-up page leads to the invoices", async ({ page }) => {
    const res = await page.request.get("/store/v1/me/wallet");
    expect(res.status(), await res.text()).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("RANK_NOT_ALLOWED");
    await page.goto("/en/account/wallet/top-ups/1");
    await expect(page).toHaveURL(/\/en\/account\/invoices$/);
  });
});

test.describe("the wallet follows the rank", () => {
  test("a merchant that becomes retail finds its balance in the store wallet, with the move named", async ({ page }) => {
    const account = await freshAccount(page, { rank: "merchant" });
    await creditAccount(account.id, "20.0000");
    // The move ends the sessions of the account: it signs in again and meets the page of its new rank at the same address.
    await changeRank(account.id, "retail");
    await signIn(page, account);
    await go(page, "/en/account/wallet");
    await expect(card(page, "Available balance")).toContainText("$20.00");
    await expect(card(page, "Reserved")).toHaveCount(0);
    await expect(vis(statementCard(page, "Statement").getByText("Balance transfer", { exact: true }))).toHaveCount(1);
  });
});
