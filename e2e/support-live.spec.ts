// Support as a live chat (feature 28, backend plan `docs/briefs/28-support-live-chat.md` §4.2): a ticket page changes the moment
// the other side writes, with no reload; typing, "Seen", files, "My tickets" and the merchant's portal thread work on the same
// layer. Runs against the isolated demo backend (:3100) built from the feature-28 branch. Written to be run by the lead.
// Rules (F03): every test that changes data uses throwaway emails or a fresh customer or merchant; nothing global is switched.
// Staff act through the admin API as the seeded Owner (`adminCall`; the Owner holds `support:read` and `support:reply`), because
// the customer side cannot create them. Tickets are filed through the public route (`POST /store/v1/tickets`, dev Turnstile
// token): an `orderToken` makes the answer carry the ticket's token, so the test can open the page at once.
// A stream is "open" when the browser got the response of the stream route; the `ready` frame follows at once and the API
// registers the connection before it answers, so an event sent after that reaches the page as a live event (a short pause
// covers the frame itself). The wait for that response is armed BEFORE the page is opened: `waitForResponse` only sees
// responses that arrive after the call.
// Locators are scoped to the conversation (`role="log"`): Next keeps the previous route hidden in the DOM.
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { adminCall, API_ORIGIN, staff } from "./admin";
import { expect, test } from "./fixtures";
import { DEV_TURNSTILE_TOKEN, freshCustomer, freshMerchant, go, signInMerchant, uniqueEmail } from "./helpers";

/** Seeded demo order (tracking token): a ticket filed with it comes back with its own token. */
const ORDER_TOKEN = "t_4056k559090000000000";
const tag = () => Math.random().toString(36).slice(2, 8);

// ── The page under test ─────────────────────────────────────────────────────────────────────────────────────────────

const log = (page: Page) => page.getByRole("log");
const box = (page: Page) => page.locator('textarea[name="body"]');

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

/** Arms the wait for the response of a stream route (status 200). Call it BEFORE `page.goto`. */
function streamOpened(page: Page, path: string) {
  return page.waitForResponse((response) => new URL(response.url()).pathname === path && response.status() === 200);
}

/** Counts the 200 responses of a stream route from now on (a page may open two streams of one route: the bell's and its own). */
function countStreams(page: Page, path: string): () => number {
  let count = 0;
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === path && response.status() === 200) count += 1;
  });
  return () => count;
}

/** Counts the typing pings the page sends to `pathSuffix` (`/typing`). */
function countPosts(page: Page, pathSuffix: string): string[] {
  const seen: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.endsWith(pathSuffix)) seen.push(request.url());
  });
  return seen;
}

// ── Filing tickets ──────────────────────────────────────────────────────────────────────────────────────────────────

/** A guest ticket through the public route. With the demo order's token the answer carries the ticket's own token. */
async function fileTicket(request: APIRequestContext, options: { email?: string; subject?: string; withOrder?: boolean } = {}) {
  const withOrder = options.withOrder ?? true;
  const res = await request.post("/store/v1/tickets", {
    headers: { "X-Turnstile-Token": DEV_TURNSTILE_TOKEN },
    data: {
      email: options.email ?? uniqueEmail("chat"),
      subject: options.subject ?? `Live chat ${tag()}`,
      message: "Hello, I need help with my unlock.",
      category: "delay",
      ...(withOrder ? { orderToken: ORDER_TOKEN } : {}),
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const ticket = (await res.json()) as { number: string; token?: string };
  if (withOrder) expect(ticket.token, "an order token makes the answer carry the ticket token").toBeTruthy();
  return { number: ticket.number, token: ticket.token ?? "" };
}

// ── Staff: the admin API (as the seeded Owner) ──────────────────────────────────────────────────────────────────────

type AdminRow = { id: number; number: string; requesterSeenMessageId?: number | null; staffSeenMessageId?: number | null };

async function ticketRow(number: string): Promise<AdminRow> {
  const { body } = await adminCall<AdminRow[]>("GET", `/admin/support-tickets?q=${encodeURIComponent(number)}`);
  const row = body.find((candidate) => candidate.number === number);
  if (!row) throw new Error(`staff cannot find ${number}`);
  return row;
}
const ticketIdOf = async (number: string) => (await ticketRow(number)).id;

/** A public reply; the id of the message when the answer carries it. */
async function agentReply(id: number, body: string): Promise<number | undefined> {
  const { body: message } = await adminCall<{ id?: number } | undefined>("POST", `/admin/support-tickets/${id}/reply`, { json: { body } });
  return typeof message?.id === "number" ? message.id : undefined;
}
const agentTyping = (id: number) => adminCall("POST", `/admin/support-tickets/${id}/typing`, { json: { mode: "reply" } });
const agentRead = (id: number, upToMessageId: number) => adminCall("POST", `/admin/support-tickets/${id}/read`, { json: { upToMessageId } });
/** Staff close (`resolved`) or reopen (`open`) the ticket: the requester gets `ticket.updated`. */
const setTicketStatus = (id: number, status: "resolved" | "open") => adminCall("PATCH", `/admin/support-tickets/${id}`, { json: { status } });

type StaffFrame = { event: string; data: unknown };

/**
 * Reads `GET /admin/stream` as the Owner (a Node `fetch` with the staff cookies; the browser under test is not involved) and
 * collects its frames. Close it in a `finally`: the API allows three open streams per session.
 */
async function watchStaffStream() {
  const session = await staff();
  const controller = new AbortController();
  const frames: StaffFrame[] = [];
  const res = await fetch(`${API_ORIGIN}/admin/stream`, {
    headers: { Cookie: session.cookie, Origin: "http://localhost:5175", "X-Forwarded-For": "127.0.0.1", Accept: "text/event-stream" },
    signal: controller.signal,
  });
  if (res.status !== 200 || !res.body) throw new Error(`GET /admin/stream answered ${res.status}`);
  const body = res.body;
  void (async () => {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) {
          const raw = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          let event = "";
          let data = "";
          for (const line of raw.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!event) continue;
          try {
            frames.push({ event, data: JSON.parse(data) });
          } catch {
            frames.push({ event, data });
          }
        }
      }
    } catch {
      // aborted by `close()`
    }
  })();
  return {
    frames,
    /** Waits for the first frame (`ready`): events sent after it reach this reader. */
    async ready() {
      await expect.poll(() => frames.some((frame) => frame.event === "ready"), { timeout: 15_000 }).toBe(true);
    },
    close: () => controller.abort(),
  };
}

// ── Customer: the token page ────────────────────────────────────────────────────────────────────────────────────────

test.describe("customer: the token page", () => {
  test("a staff reply shows with no reload, is marked seen, and the receipt moves from Sent to Seen", async ({ page }) => {
    const { number, token } = await fileTicket(page.request);
    const id = await ticketIdOf(number);
    const opened = streamOpened(page, `/store/v1/tickets/${token}/stream`);
    await go(page, `/en/support/tickets/${token}`);
    await hydrated(box(page));
    await opened;
    await page.waitForTimeout(500);
    await markPage(page);

    const reply = `Agent reply ${tag()}`;
    const replyId = await agentReply(id, reply);
    // Without the stream this would need a reload; the stream brings it in a second or two.
    await expect(log(page).getByText(reply)).toBeVisible({ timeout: 20_000 });
    await expectNotReloaded(page);
    // The page is visible and the end of the conversation is on screen: it tells the API the reply was read.
    await expect
      .poll(async () => (await ticketRow(number)).requesterSeenMessageId ?? 0, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(replyId ?? 1);

    // The team is typing: a line under the conversation, gone by itself a few seconds later.
    await agentTyping(id);
    await expect(page.getByText("Support is typing…")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Support is typing…")).toBeHidden({ timeout: 15_000 });

    // The visitor writes: `Enter` sends, the answer is appended once (the event with the same id is ignored), focus stays.
    const sent = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/tickets/${token}/messages`));
    await box(page).fill("Thank you, that works.");
    await box(page).press("Enter");
    const messageId = ((await (await sent).json()) as { id: number }).id;
    const mine = log(page).locator("li", { hasText: "Thank you, that works." });
    await expect(mine).toHaveCount(1);
    await expect(mine.getByText(/Sent$/)).toBeVisible();
    await expect(box(page)).toHaveValue("");
    await expect(box(page)).toBeFocused();
    await page.waitForTimeout(1_000);
    await expect(mine).toHaveCount(1);

    // The agent opens it: "Seen" reaches the customer with no reload.
    await agentRead(id, messageId);
    await expect(mine.getByText(/Seen$/)).toBeVisible({ timeout: 20_000 });
    await expectNotReloaded(page);

    // `Shift+Enter` is a new line, not a send.
    await box(page).fill("line one");
    await box(page).press("Shift+Enter");
    await box(page).pressSequentially("line two");
    await box(page).press("Enter");
    await expect(log(page).locator("p.whitespace-pre-wrap", { hasText: "line one" })).toHaveText("line one\nline two", { useInnerText: true });
  });

  test("typing reaches staff as ticket.typing at most once every 3 s", async ({ page }) => {
    const { number, token } = await fileTicket(page.request);
    const id = await ticketIdOf(number);
    const watcher = await watchStaffStream();
    try {
      await watcher.ready();
      const pings = countPosts(page, `/tickets/${token}/typing`);
      await go(page, `/en/support/tickets/${token}`);
      await hydrated(box(page));

      // Twelve keystrokes in about half a second: one ping.
      await box(page).pressSequentially("hello, I am typing", { delay: 40 });
      await expect
        .poll(() => watcher.frames.some((frame) => frame.event === "ticket.typing" && (frame.data as { ticketId?: number }).ticketId === id), { timeout: 15_000 })
        .toBe(true);
      const typing = watcher.frames.find((frame) => frame.event === "ticket.typing")?.data as { by?: string };
      expect(typing.by).toBe("requester");
      expect(pings).toHaveLength(1);

      // After the gap the next keystroke pings again.
      await page.waitForTimeout(3_200);
      await box(page).pressSequentially("!");
      await expect.poll(() => pings.length).toBe(2);
    } finally {
      watcher.close();
    }
  });

  test("a PDF goes with a message, a refused type is refused on the spot, and the download answers 302", async ({ page }) => {
    const { token } = await fileTicket(page.request);
    await go(page, `/en/support/tickets/${token}`);
    await hydrated(box(page));

    // A file the page can already refuse: no upload is started, the chip says why, and it can be removed.
    await page.locator('input[type="file"]').setInputFiles({ name: "run.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
    const attached = page.getByRole("list", { name: "Attached files" });
    await expect(attached.getByText("Attach a PDF, JPG or PNG file.")).toBeVisible();
    await attached.getByRole("button", { name: "Remove run.exe" }).click();
    await expect(attached).toHaveCount(0);

    // A real PDF, with no text: a message may be files only.
    await page.locator('input[type="file"]').setInputFiles({
      name: "receipt.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"),
    });
    await expect(attached.getByText("receipt.pdf")).toBeVisible();
    await expect(attached.getByText("Uploading…")).toHaveCount(0, { timeout: 15_000 });
    await page.getByRole("button", { name: "Send reply" }).click();

    const link = log(page).getByRole("link", { name: /receipt\.pdf/ });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(log(page).locator("img")).toHaveCount(0); // never an inline preview
    const href = await link.getAttribute("href");
    expect(href).toMatch(new RegExp(`^/store/v1/tickets/${token}/files/\\d+$`));
    const download = await page.request.get(href!, { maxRedirects: 0 });
    expect(download.status()).toBe(302);
    expect(download.headers()["location"]).toBeTruthy();
    await expect(attached).toHaveCount(0); // sent: the box is empty again
  });

  test("a reply written before the stream opens shows once the stream is live (a stream without a cursor replays nothing)", async ({ page }) => {
    const { number, token } = await fileTicket(page.request);
    const id = await ticketIdOf(number);
    // The stream's request is held: the page is drawn from the server's read, and the reply is written BEFORE the stream opens,
    // so no event will ever carry it. The page has to read the ticket again by itself when the stream becomes live.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/store/v1/tickets/${token}/stream*`, async (route) => {
      await gate;
      await route.continue();
    });
    const opened = streamOpened(page, `/store/v1/tickets/${token}/stream`);
    await go(page, `/en/support/tickets/${token}`);
    await hydrated(box(page));
    await markPage(page);

    const reply = `Early reply ${tag()}`;
    await agentReply(id, reply);
    await expect(log(page).getByText(reply)).toHaveCount(0);
    release();
    await opened;
    await expect(log(page).getByText(reply)).toBeVisible({ timeout: 20_000 });
    await expectNotReloaded(page);
  });

  test("without the stream the page reads the ticket again every 30 s", async ({ page }) => {
    const { number, token } = await fileTicket(page.request);
    const id = await ticketIdOf(number);
    // The page's clock jumps instead of waiting; its stream is refused, so only the poll can bring the reply.
    await page.clock.install();
    await page.route(`**/store/v1/tickets/${token}/stream*`, (route) =>
      route.fulfill({ status: 503, contentType: "application/problem+json", body: JSON.stringify({ status: 503, code: "UNAVAILABLE", title: "Unavailable" }) }),
    );
    await page.goto(`/en/support/tickets/${token}`);
    await hydrated(box(page));

    const reply = `Poll reply ${tag()}`;
    await agentReply(id, reply);
    await expect(async () => {
      await page.clock.fastForward(31_000);
      await expect(log(page).getByText(reply)).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 30_000 });
  });

  test("an Arabic page gets the reply and the typing line in Arabic, right to left", async ({ page }) => {
    const { number, token } = await fileTicket(page.request);
    const id = await ticketIdOf(number);
    const opened = streamOpened(page, `/store/v1/tickets/${token}/stream`);
    await go(page, `/ar/support/tickets/${token}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await hydrated(box(page));
    await opened;
    await page.waitForTimeout(500);

    const reply = `رد مباشر ${tag()}`;
    await agentReply(id, reply);
    await expect(log(page).getByText(reply)).toBeVisible({ timeout: 20_000 });
    await agentTyping(id);
    await expect(page.getByText("فريق الدعم يكتب…")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("إرفاق ملف")).toBeVisible();
  });
});

// ── Customer: a closed ticket (owner, 2026-11-15) ───────────────────────────────────────────────────────────────────
// A resolved ticket takes no more messages from the requester (`409 TICKET_RESOLVED` from the API): the page swaps the reply
// box for the closed notice, live, and brings the box back when staff reopen the ticket.

test.describe("customer: a closed ticket", () => {
  const notice = (page: Page) => page.getByRole("group", { name: "This ticket is closed" });

  test("after staff resolve, the page shows the closed notice live and no reply box; after a reopen the box returns", async ({ page }) => {
    const { number, token } = await fileTicket(page.request);
    const id = await ticketIdOf(number);
    const opened = streamOpened(page, `/store/v1/tickets/${token}/stream`);
    await go(page, `/en/support/tickets/${token}`);
    await hydrated(box(page));
    await opened;
    await page.waitForTimeout(500);
    await markPage(page);
    await expect(notice(page)).toHaveCount(0);

    // The visitor is still writing when staff close the ticket.
    await box(page).fill("A reply I never sent");
    await setTicketStatus(id, "resolved");
    await expect(notice(page)).toBeVisible({ timeout: 20_000 });
    await expectNotReloaded(page);
    // No reply box, no attach control, no send button; the draft is gone, and the notice says so.
    await expect(box(page)).toHaveCount(0);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send reply" })).toHaveCount(0);
    await expect(notice(page).getByText("The reply you were writing was not sent and has been cleared.")).toBeVisible();
    await expect(notice(page).getByText("A reply I never sent")).toHaveCount(0);
    // A guest's way on is the public form; the rating appears as before; the status badge follows.
    await expect(notice(page).getByRole("link", { name: "Open a new ticket" })).toHaveAttribute("href", "/en/support");
    await expect(page.getByRole("button", { name: "Send rating" })).toBeVisible();
    await expect(page.getByText("Resolved").first()).toBeVisible();
    // The notice sits in a polite live region, so its arrival is announced.
    await expect(page.locator('[aria-live="polite"]').filter({ has: notice(page) })).toHaveCount(1);

    // Staff reopen it: the box comes back (empty: the draft was discarded) and the notice goes, still with no reload.
    await setTicketStatus(id, "open");
    await expect(box(page)).toBeVisible({ timeout: 20_000 });
    await expect(box(page)).toHaveValue("");
    await expect(notice(page)).toHaveCount(0);
    await expect(page.locator('input[type="file"]')).toHaveCount(1);
    await expectNotReloaded(page);
  });

  test("a reply sent just after staff closed it (409 TICKET_RESOLVED) shows the notice and keeps the text to copy", async ({ page }) => {
    const { number, token } = await fileTicket(page.request);
    const id = await ticketIdOf(number);
    // The stream is refused, so the page cannot hear about the close: only the refused send tells it.
    await page.route(`**/store/v1/tickets/${token}/stream*`, (route) =>
      route.fulfill({ status: 503, contentType: "application/problem+json", body: JSON.stringify({ status: 503, code: "UNAVAILABLE", title: "Unavailable" }) }),
    );
    await go(page, `/en/support/tickets/${token}`);
    await hydrated(box(page));
    await setTicketStatus(id, "resolved");

    const text = `My question after the close ${tag()}`;
    const answered = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/tickets/${token}/messages`));
    await box(page).fill(text);
    await page.getByRole("button", { name: "Send reply" }).click();
    const answer = await answered;
    expect(answer.status()).toBe(409);
    expect(((await answer.json()) as { code?: string }).code).toBe("TICKET_RESOLVED");

    await expect(notice(page)).toBeVisible();
    await expect(box(page)).toHaveCount(0);
    // The text stays in the notice, read-only, to copy; it is not in the conversation.
    const unsent = notice(page).getByRole("textbox", { name: "Your message (not sent)" });
    await expect(unsent).toHaveValue(text);
    await expect(unsent).toHaveAttribute("readonly", "");
    await expect(log(page).getByText(text)).toHaveCount(0);
    await expect(notice(page).getByText("was not sent and has been cleared")).toHaveCount(0);
  });
});

// ── Customer: My tickets ────────────────────────────────────────────────────────────────────────────────────────────

test.describe("customer: My tickets", () => {
  test("a signed-in customer opens a ticket, finds it (and a guest ticket on their address) in the list, and sees a reply arrive in it", async ({
    page,
    request,
  }) => {
    const email = await freshCustomer(page);
    await page.goto("/en/account/tickets");
    await expect(page.getByRole("heading", { level: 1, name: "My tickets" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "You have no tickets yet" })).toBeVisible();
    await expect(page.locator('a[href="/en/account/tickets"]')).not.toHaveCount(0); // the account navigation's item

    // A ticket filed as a guest with the customer's address belongs to them.
    const guest = await fileTicket(request, { email, withOrder: false });

    // A ticket opened signed in: no email, no security check; the customer lands on the token page.
    await go(page, "/en/account/tickets/new");
    const subject = `Signed-in ticket ${tag()}`;
    await page.locator('input[name="subject"]').fill(subject);
    await page.locator('textarea[name="message"]').fill("Opened from my account.");
    await page.getByRole("button", { name: "Open ticket" }).click();
    await expect(page).toHaveURL(/\/en\/support\/tickets\/[\w-]{16,}$/);
    await expect(page.getByRole("heading", { level: 1, name: subject })).toBeVisible();
    await expect(log(page).getByText("Opened from my account.")).toBeVisible();
    const number = (await page.getByText(/^Ticket T-\d+ · /).first().innerText()).match(/T-\d+/)![0];

    // The list shows both, newest activity first.
    const bellAndRefresh = countStreams(page, "/store/v1/me/stream");
    await page.goto("/en/account/tickets");
    const rows = page.locator("tr[data-ticket-number]");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toHaveAttribute("data-ticket-number", number);
    await expect(page.locator(`tr[data-ticket-number="${guest.number}"]`)).toBeVisible();
    await expect(page.getByRole("link", { name: `Open ticket ${number}`, exact: true })).toHaveAttribute("href", /\/en\/support\/tickets\/[\w-]+$/);
    // The bell's stream and the list's own: the list refreshes from events.
    await expect.poll(bellAndRefresh, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    await page.waitForTimeout(500);
    await markPage(page);

    // An agent replies: the row gets its "new reply" mark with no reload.
    await agentReply(await ticketIdOf(number), `List reply ${tag()}`);
    await expect(page.getByRole("link", { name: `Open ticket ${number} · New reply`, exact: true })).toBeVisible({ timeout: 20_000 });
    await expectNotReloaded(page);

    // Opening it shows the reply and reads it.
    await page.getByRole("link", { name: `Open ticket ${number} · New reply`, exact: true }).click();
    await expect(page).toHaveURL(/\/en\/support\/tickets\//);
    await expect(log(page).getByText(/List reply/)).toBeVisible();
  });

  test("a customer does not see another customer's tickets", async ({ page }) => {
    await freshCustomer(page);
    await page.goto("/en/account/tickets");
    await expect(page.getByRole("heading", { name: "You have no tickets yet" })).toBeVisible();
    await expect(page.locator("tr[data-ticket-number]")).toHaveCount(0);
  });
});

// ── Merchant: the portal ────────────────────────────────────────────────────────────────────────────────────────────

test.describe("merchant: support in the portal", () => {
  test("a merchant opens a ticket, gets the agent's reply live and marks it seen", async ({ page }) => {
    const account = await freshMerchant(page);
    await signInMerchant(page, account);
    const bellStream = streamOpened(page, "/client/stream");
    await go(page, "/en/merchant/support/new");
    await expect(page.getByRole("heading", { level: 1, name: "New ticket" })).toBeVisible();
    await bellStream;
    await page.waitForTimeout(500);
    const subject = `Merchant ticket ${tag()}`;
    await page.locator('input[name="subject"]').fill(subject);
    await page.locator('textarea[name="message"]').fill("A question from the portal.");

    // The bell's merchant stream is open already; the thread opens a client of its own. Wait for that one.
    const threadStream = streamOpened(page, "/client/stream");
    await page.getByRole("button", { name: "Open ticket" }).click();
    await expect(page).toHaveURL(/\/en\/merchant\/support\/\d+$/);
    await expect(page.getByRole("heading", { level: 1, name: subject })).toBeVisible();
    await expect(log(page).getByText("A question from the portal.")).toBeVisible();
    await hydrated(box(page));
    await threadStream;
    await page.waitForTimeout(1_000);
    await markPage(page);

    const number = (await page.getByText(/^Ticket T-\d+ · /).first().innerText()).match(/T-\d+/)![0];
    const id = await ticketIdOf(number);
    const reply = `Portal reply ${tag()}`;
    const replyId = await agentReply(id, reply);
    await expect(log(page).getByText(reply)).toBeVisible({ timeout: 20_000 });
    await expectNotReloaded(page);
    await expect
      .poll(async () => (await ticketRow(number)).requesterSeenMessageId ?? 0, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(replyId ?? 1);

    // The merchant answers from the thread; the list shows the ticket.
    await box(page).fill("Thanks, got it.");
    await page.getByRole("button", { name: "Send reply" }).click();
    await expect(log(page).getByText("Thanks, got it.")).toBeVisible();
    await page.goto("/en/merchant/support");
    await expect(page.getByRole("heading", { level: 1, name: "Support" })).toBeVisible();
    await expect(page.locator(`tr[data-ticket-number="${number}"]`)).toBeVisible();
  });

  test("another merchant's ticket id is a 404 page, not a thread", async ({ page }) => {
    const account = await freshMerchant(page);
    await signInMerchant(page, account);
    await page.goto("/en/merchant/support/99999999");
    await expect(page.getByRole("heading", { level: 1, name: "We could not find this ticket" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to support" })).toHaveAttribute("href", "/en/merchant/support");
  });
});
