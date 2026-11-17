// Support tickets: the public form, the conversation page opened from the link, replying, the rating, and the friendly
// 404. Staff answers come from the admin API of the isolated backend (the seeded Support agent), because the customer
// side cannot create them. Throwaway emails keep the "3 tickets per hour per email" limit away from the demo customers.
import { createHmac } from "node:crypto";
import { expect, test } from "./fixtures";
import { type Page } from "@playwright/test";
import { ACCOUNTS, signInCustomer } from "./helpers";

const DEV_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const API_ORIGIN = process.env.E2E_API_ORIGIN ?? "http://localhost:3100";
/** Seeded demo order of Daniel (tracking token, handoff §11.1): links a ticket to an order and returns its token. */
const ORDER_TOKEN = "t_4056k559090000000000";

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

/** Cloudflare's script replaced by a stub that hands out the dev token at once (and again after `reset`). */
async function stubTurnstile(page: Page) {
  await page.route("**/challenges.cloudflare.com/turnstile/v0/api.js*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `var w={};window.turnstile={render:function(el,o){var id="w"+Math.random();w[id]=o;setTimeout(function(){o.callback("${DEV_TOKEN}")},30);return id},reset:function(id){var o=w[id];if(o)setTimeout(function(){o.callback("${DEV_TOKEN}")},30)},remove:function(id){delete w[id]}};`,
    }),
  );
}

// ── Staff side (admin API, seeded Support agent: password and TOTP secret are public dev data, handoff §9.2)
function base32(text: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of text) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret: string): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hmac = createHmac("sha1", base32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const code = (((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]) % 1_000_000;
  return String(code).padStart(6, "0");
}
async function staff(page: Page) {
  // Staff calls go straight to the API as this machine (the seeded admin IP allow-list is localhost); they must not
  // carry the per-test client IP the fixture adds (e2e/fixtures.ts).
  const headers = { "Content-Type": "application/json", Origin: "http://localhost:5175", "X-Forwarded-For": "127.0.0.1" };
  const login = await page.request.post(`${API_ORIGIN}/admin/auth/login`, {
    headers,
    data: { email: "lina@gsm-supply.example", password: "demo-password" },
  });
  expect(login.status(), await login.text()).toBe(200);
  const pending = login.headers()["x-csrf-token"];
  const cookie1 = login.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value.split(";")[0]).join("; ");
  // A TOTP code works once: if another run just used this window's code, wait for the next window and retry.
  const twofa = () =>
    page.request.post(`${API_ORIGIN}/admin/auth/2fa`, {
      headers: { ...headers, Cookie: cookie1, "X-CSRF-Token": pending },
      data: { code: totp("KMG4IZYMUXD3VSCZ6VRP5TRPN3VCYBEW") },
    });
  let second = await twofa();
  if (second.status() === 422) {
    await page.waitForTimeout((30 - (Math.floor(Date.now() / 1000) % 30) + 1) * 1000);
    second = await twofa();
  }
  expect(second.status(), await second.text()).toBe(204);
  const cookie = second.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value.split(";")[0]).join("; ");
  const auth = { ...headers, Cookie: cookie, "X-CSRF-Token": second.headers()["x-csrf-token"] };
  return {
    async idOf(number: string): Promise<number> {
      const res = await page.request.get(`${API_ORIGIN}/admin/support-tickets?q=${encodeURIComponent(number)}`, { headers: auth });
      const rows = (await res.json()) as { id: number; number: string }[];
      const row = rows.find((r) => r.number === number);
      if (!row) throw new Error(`staff cannot find ${number}`);
      return row.id;
    },
    async reply(id: number, body: string) {
      const res = await page.request.post(`${API_ORIGIN}/admin/support-tickets/${id}/reply`, { headers: auth, data: { body } });
      expect(res.status(), await res.text()).toBe(201);
    },
    async setStatus(id: number, status: string) {
      const res = await page.request.patch(`${API_ORIGIN}/admin/support-tickets/${id}`, { headers: auth, data: { status } });
      expect(res.status(), await res.text()).toBe(200);
    },
  };
}

async function fillTicket(page: Page, values: { email?: string; subject: string; message: string; order?: string }) {
  if (values.email !== undefined) await page.locator('input[name="email"]').fill(values.email);
  await page.locator('input[name="subject"]').fill(values.subject);
  await page.locator('textarea[name="message"]').fill(values.message);
  if (values.order !== undefined) await page.locator('input[name="order"]').fill(values.order);
}

test.describe("new ticket form", () => {
  test.beforeEach(async ({ page }) => stubTurnstile(page));

  test("shows the form, the side cards and points signed-in customers to My tickets", async ({ page }) => {
    await go(page, "/en/support");
    await expect(page.getByRole("heading", { level: 1, name: "Contact support" })).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('select[name="category"] option')).toHaveCount(8);
    await expect(page.getByRole("link", { name: /Open the help center/ })).toHaveAttribute("href", "/en/help");
    await expect(page.getByRole("link", { name: /Track an order/ }).first()).toBeVisible();
    await expect(page.getByText(/Your tickets are also under My tickets in your account/)).toBeVisible();
    // Attachments are not supported by the API: no file inputs or attach buttons.
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });

  test("empty submit shows field errors and focuses the first one", async ({ page }) => {
    await go(page, "/en/support");
    await page.getByRole("button", { name: "Send ticket" }).click();
    await expect(page.locator('input[name="email"]')).toBeFocused();
    await expect(page.locator('input[name="subject"]')).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator('textarea[name="message"]')).toHaveAttribute("aria-invalid", "true");
  });

  test("an order link makes the email optional and is prefilled from ?order=", async ({ page }) => {
    await go(page, `/en/support?order=${ORDER_TOKEN}`);
    await expect(page.locator('input[name="order"]')).toHaveValue(ORDER_TOKEN);
    await expect(page.locator('input[name="email"]')).not.toHaveAttribute("required", "");
  });

  test("a signed-in customer has the email prefilled", async ({ page }) => {
    await signInCustomer(page);
    await go(page, "/en/support");
    await expect(page.locator('input[name="email"]')).toHaveValue(ACCOUNTS.customer.email);
  });

  test("with an order link: ticket created, conversation opens, reply appears, staff answer and rating work", async ({ page }) => {
    const email = uniqueEmail("ticket");
    await go(page, "/en/support");
    await page.locator('select[name="category"]').selectOption("delay");
    await fillTicket(page, {
      email,
      subject: "My unlock is taking long",
      message: "Hello,\nthe order has been pending for two days.",
      order: `http://localhost:5175/en/track/${ORDER_TOKEN}`,
    });
    await page.getByRole("button", { name: "Send ticket" }).click();
    await expect(page).toHaveURL(/\/en\/support\/tickets\/[\w-]{16,}$/);
    await expect(page.getByRole("heading", { level: 1, name: "My unlock is taking long" })).toBeVisible();
    // Cache Components keeps the previous page hidden in the DOM: look inside the conversation only.
    await expect(page.getByRole("log").getByText("the order has been pending for two days.")).toBeVisible();
    await expect(page.getByText("Order delay").first()).toBeVisible();
    await expect(page.getByText(/^SF-\d+$/)).toBeVisible(); // related order in the information card
    const number = (await page.getByText(/^Ticket T-\d+ · /).first().innerText()).match(/T-\d+/)![0];
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    // Reply: appears in the conversation after the refresh, the box is cleared.
    await page.locator('textarea[name="body"]').fill("Any news? Thank you.");
    await page.getByRole("button", { name: "Send reply" }).click();
    await expect(page.getByText("Reply sent")).toBeVisible();
    await expect(page.getByRole("log").getByText("Any news? Thank you.")).toBeVisible();
    await expect(page.locator('textarea[name="body"]')).toHaveValue("");

    // The team answers and resolves: its message is on the start side, a rating appears.
    const lina = await staff(page);
    const id = await lina.idOf(number);
    await lina.reply(id, "We found the problem and fixed it.");
    await lina.setStatus(id, "resolved");
    await page.reload();
    const answer = page.getByRole("log").getByText("We found the problem and fixed it.");
    await expect(answer).toBeVisible();
    const box = await answer.boundingBox();
    const mine = await page.getByRole("log").getByText("Any news? Thank you.").boundingBox();
    expect(box!.x).toBeLessThan(mine!.x); // support (start side) sits left of you (end side) in English
    // A resolved ticket is closed to the customer (owner, 2026-11-15): no reply box and no attach control, but the closed
    // notice with the way to a new ticket (a guest: the public form; the order is not carried, its field takes a link).
    const closed = page.getByRole("group", { name: "This ticket is closed" });
    await expect(closed).toBeVisible();
    await expect(closed.getByRole("link", { name: "Open a new ticket" })).toHaveAttribute("href", "/en/support");
    await expect(page.locator('textarea[name="body"]')).toHaveCount(0);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send reply" })).toHaveCount(0);

    // The rating still works on a closed ticket.
    await expect(page.getByRole("button", { name: "Send rating" })).toBeDisabled();
    await page.getByRole("radiogroup", { name: "Rating" }).getByText("5", { exact: true }).click();
    await page.getByRole("button", { name: "Send rating" }).click();
    await expect(page.getByText("Thank you for rating this ticket 5 out of 5.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send rating" })).toHaveCount(0);

    // Writing on it is refused by the API itself: only staff reopen a ticket.
    const refused = await page.request.post(`/store/v1/tickets/${page.url().split("/").pop()}/messages`, { data: { body: "One more question." } });
    expect(refused.status()).toBe(409);
    expect(((await refused.json()) as { code?: string }).code).toBe("TICKET_RESOLVED");
    await expect(closed).toBeVisible();
    await expect(page.getByRole("log").getByText("One more question.")).toHaveCount(0);
  });

  test("with an email only: no token comes back, the page says a link was emailed, the mail link opens the ticket", async ({ page }) => {
    const email = uniqueEmail("emailonly");
    await go(page, "/en/support");
    await fillTicket(page, { email, subject: "How do I check an IMEI?", message: "I need help with the first step." });
    await page.locator('select[name="category"]').selectOption("howto");
    await page.getByRole("button", { name: "Send ticket" }).click();
    const done = page.getByRole("status").filter({ hasText: /Ticket T-\d+ received/ });
    await expect(done).toBeVisible();
    await expect(done.getByText(`We emailed a link to ${email}`)).toBeVisible();
    await expect(page).toHaveURL(/\/en\/support$/);

    // The only way back in: the link in the ticket email.
    const deadline = Date.now() + 25_000;
    let link = "";
    while (!link && Date.now() < deadline) {
      const list = await page.request.get(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=5`);
      for (const { ID } of ((await list.json()) as { messages?: { ID: string }[] }).messages ?? []) {
        const m = (await (await page.request.get(`http://localhost:8025/api/v1/message/${ID}`)).json()) as { Text?: string; HTML?: string };
        link = /https?:\/\/localhost:5175(\/support\/tickets\/[\w-]+)/.exec(`${m.Text}\n${m.HTML}`)?.[1] ?? "";
        if (link) break;
      }
      if (!link) await page.waitForTimeout(500);
    }
    expect(link).not.toBe("");
    await go(page, link);
    await expect(page).toHaveURL(/\/en\/support\/tickets\//);
    await expect(page.getByRole("heading", { level: 1, name: "How do I check an IMEI?" })).toBeVisible();
    await expect(page.getByText("I need help with the first step.")).toBeVisible();
  });

  test("an order link that matches nothing is refused on its own field", async ({ page }) => {
    await go(page, "/en/support");
    await fillTicket(page, {
      email: uniqueEmail("badorder"),
      subject: "Order question",
      message: "Please check this order.",
      order: "http://localhost:5175/en/track/t_doesnotexist000000000",
    });
    await page.getByRole("button", { name: "Send ticket" }).click();
    await expect(page.locator('input[name="order"]')).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("We could not find an order for this link.")).toBeVisible();
  });
});

test.describe("ticket page", () => {
  test("an unknown token shows a friendly page with a way to send a new ticket, never indexed", async ({ page }) => {
    await go(page, "/en/support/tickets/this-token-does-not-exist-1234");
    await expect(page.getByRole("heading", { level: 1, name: "We could not find this ticket" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Send a new ticket" })).toHaveAttribute("href", "/en/support");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator("body")).not.toContainText(/stack|exception|undefined/i);
  });
});
