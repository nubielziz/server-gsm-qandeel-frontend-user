// The unsubscribe page behind the link of marketing emails (plan F11, BH §4.2, §4.4). Before this page the mail's visible
// link (`STORE_BASE_URL/unsubscribe?token=…`) answered 404. Runs against the isolated demo backend (:3100) and Mailpit
// (:8025); the throwaway customer is the only account whose data changes.
// The page must never submit by itself (mail scanners open links): every test that has a good token first checks that the
// customer is still subscribed, and only a press on the button changes that.
import type { Page } from "@playwright/test";
import { customerIdByEmail, sendCampaign } from "./admin";
import { expect, test } from "./fixtures";
import { freshCustomer, go, tokenOf, waitForLink } from "./helpers";

/** A token the API cannot have issued: well-formed (10 or more characters), but wrong. */
const WRONG_TOKEN = "zzzz.0123456789abcdef0123456789abcdef";

async function marketingOptIn(page: Page): Promise<boolean> {
  const res = await page.request.get("/store/v1/me");
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { marketingOptIn: boolean }).marketingOptIn;
}

test("the emailed link opens the page, which asks first; the button turns marketing email off", async ({ page }) => {
  const email = await freshCustomer(page);

  // Opt in (the customer's own PATCH, with the store surface's CSRF token), then staff send a marketing campaign by email.
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "csrf_token_store")?.value;
  const optIn = await page.request.patch("/store/v1/me", { headers: { "X-CSRF-Token": csrf ?? "" }, data: { marketingOptIn: true } });
  expect(optIn.status(), await optIn.text()).toBe(200);
  expect(await marketingOptIn(page)).toBe(true);
  await sendCampaign({
    to: { type: "customer", id: await customerIdByEmail(email) },
    title: "Spring offers",
    body: "Big offers this week",
    purpose: "marketing",
    channels: ["email"],
  });

  // The visible link of the mail: `/unsubscribe?token=` on the shop host, with no language (the proxy adds it).
  const link = await waitForLink(page, email, /^\/unsubscribe\?token=/);
  expect(tokenOf(link)).not.toBe("");

  await go(page, link);
  await expect(page).toHaveURL(/\/en\/unsubscribe\?token=/);
  await expect(page.getByRole("heading", { level: 1, name: "Stop marketing emails" })).toBeVisible();
  await expect(page.getByText("Nothing changes until you press it.")).toBeVisible();
  const button = page.getByRole("button", { name: "Stop marketing emails" });
  await expect(button).toBeVisible();

  // Never auto-submitted: a scanner that opened the page changed nothing.
  await page.waitForTimeout(1_000);
  expect(await marketingOptIn(page)).toBe(true);
  await expect(page.getByText("You will get no more marketing emails.")).toHaveCount(0);

  const unsubscribe = page.waitForRequest((request) => request.method() === "POST" && request.url().includes("/store/v1/marketing/unsubscribe/"));
  await page.getByRole("button", { name: "Stop marketing emails" }).click();
  const request = await unsubscribe;
  // The token goes in the path (encoded), the route takes no body and no Content-Type.
  expect(new URL(request.url()).pathname).toBe(`/store/v1/marketing/unsubscribe/${encodeURIComponent(tokenOf(link))}`);
  expect(request.postData()).toBeNull();
  expect(request.headers()["content-type"]).toBeUndefined();

  await expect(page.getByText("You will get no more marketing emails.")).toBeVisible();
  await expect(page.getByText("You are unsubscribed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop marketing emails" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to the shop" })).toHaveAttribute("href", "/en");
  expect(await marketingOptIn(page)).toBe(false);
});

test("a wrong token, a short one and a missing one all say the link is not valid", async ({ page }) => {
  // A well-formed token the API did not issue: 410 TOKEN_INVALID.
  await go(page, `/en/unsubscribe?token=${WRONG_TOKEN}`);
  await page.getByRole("button", { name: "Stop marketing emails" }).click();
  await expect(page.getByText("This link is not valid")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop marketing emails" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to the shop" })).toBeVisible();

  // Too short for the API (422): the same words.
  await go(page, "/en/unsubscribe?token=abc");
  await page.getByRole("button", { name: "Stop marketing emails" }).click();
  await expect(page.getByText("This link is not valid")).toBeVisible();

  // No token: nothing to send, so no button at all.
  await page.goto("/en/unsubscribe");
  await expect(page.getByText("This link is not valid")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop marketing emails" })).toHaveCount(0);

  // A token longer than the API reads is refused before any request.
  let calls = 0;
  await page.route("**/store/v1/marketing/unsubscribe/**", async (route) => {
    calls += 1;
    await route.continue();
  });
  await page.goto(`/en/unsubscribe?token=${"a".repeat(101)}`);
  await expect(page.getByText("This link is not valid")).toBeVisible();
  expect(calls).toBe(0);
});

test("the page is never indexed and sends no referrer", async ({ page }) => {
  await page.goto(`/en/unsubscribe?token=${WRONG_TOKEN}`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
});

test("the Arabic page is right-to-left and translated", async ({ page }) => {
  await go(page, `/ar/unsubscribe?token=${WRONG_TOKEN}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { level: 1, name: "إيقاف الرسائل التسويقية" })).toBeVisible();
  await expect(page.getByText("لن يتغيّر شيء قبل أن تضغطه.")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole("button", { name: "إيقاف الرسائل التسويقية" }).click();
  await expect(page.getByText("هذا الرابط غير صالح")).toBeVisible();
  await expect(page.getByRole("link", { name: "العودة إلى المتجر" })).toHaveAttribute("href", "/ar");
});
