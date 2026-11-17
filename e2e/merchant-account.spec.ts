// Merchant account (plan F22): the verification-mail resend, address and tax id in the profile, "Made by support" API
// keys and the Announcements row. Real browser -> Next -> the isolated demo backend (:3100) and Mailpit.
// Rules: one throwaway merchant per test (the resend limiter is 5 an hour per merchant, and the demo merchant is never
// changed); nothing is switched off globally. `mustChangePassword` has no e2e: no staff route sets the flag on a full
// session, so the gate's decision is a unit test (components/merchant/must-change-password-gate.test.tsx) and the lead
// checks it by hand (plan section 7).
import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import { approveMerchant, merchantIdByEmail, staffApiKeyFor } from "./admin";
import { BASE_URL, freshMerchant, go, hydrated, signInMerchant, tokenOf, waitForLink } from "./helpers";

const VERIFY_LINK = /\/merchant\/verify-email\?token=/;

/** A signed-in throwaway merchant, still pending (the profile, the security page and the resend work for a pending one). */
async function signedInMerchant(page: Page) {
  const account = await freshMerchant(page);
  const csrf = await signInMerchant(page, account);
  return { ...account, csrf };
}

/** A signed-in throwaway merchant that staff approved (notifications and API keys need an approved account). */
async function approvedMerchant(page: Page) {
  const account = await freshMerchant(page);
  const id = await merchantIdByEmail(account.email);
  await approveMerchant(id);
  const csrf = await signInMerchant(page, account);
  return { ...account, id, csrf };
}

test.describe("verification mail: resend", () => {
  test("a new link arrives, the success text says older links stop working, and they do", async ({ page }) => {
    const account = await freshMerchant(page);
    const first = await waitForLink(page, account.email, VERIFY_LINK);
    await signInMerchant(page, account);

    await go(page, "/en/merchant/settings");
    await expect(page.getByText("Not verified", { exact: true })).toBeVisible();
    await expect(page.getByText(/not verified yet\. Open the link in the email we sent you/)).toBeVisible();
    await page.getByRole("button", { name: "Resend verification email" }).click();
    await expect(page.getByText("We sent a new link. Older links no longer work.")).toBeVisible();

    const second = await waitForLink(page, account.email, VERIFY_LINK, [first]);
    expect(second).not.toBe(first);

    // The first link was replaced by the newest one.
    const origin = new URL(BASE_URL).origin;
    const stale = await page.request.post("/client/auth/verify-email", {
      headers: { Origin: origin, "Content-Type": "application/json" },
      data: { token: tokenOf(first) },
    });
    expect(stale.status()).toBe(410);
  });

  test("verified in another tab: the resend says it is already verified and the badge turns to Verified", async ({ page }) => {
    const account = await freshMerchant(page);
    const link = await waitForLink(page, account.email, VERIFY_LINK);
    await signInMerchant(page, account);

    await go(page, "/en/merchant/settings");
    await expect(page.getByText("Not verified", { exact: true })).toBeVisible();

    // The link is used somewhere else while this page stays open.
    const verified = await page.request.post("/client/auth/verify-email", {
      headers: { Origin: new URL(BASE_URL).origin, "Content-Type": "application/json" },
      data: { token: tokenOf(link) },
    });
    expect(verified.status(), await verified.text()).toBe(204);

    await page.getByRole("button", { name: "Resend verification email" }).click();
    await expect(page.getByText("Your email is already verified.")).toBeVisible();
    await expect(page.getByText("Verified", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Not verified", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Resend verification email" })).toHaveCount(0);
    // The message stays after the refresh took the button away.
    await expect(page.getByText("Your email is already verified.")).toBeVisible();
  });

  test("a 429 shows the wait the API sent", async ({ page }) => {
    await signedInMerchant(page);
    await page.route("**/client/auth/verify-email/resend", (route) =>
      route.fulfill({
        status: 429,
        headers: { "content-type": "application/problem+json", "retry-after": "600" },
        body: JSON.stringify({
          type: "about:blank",
          title: "You are sending requests too quickly.",
          status: 429,
          code: "RATE_LIMITED",
          detail: "Too many requests. Try again in 600 seconds.",
        }),
      }),
    );
    await go(page, "/en/merchant/settings");
    await page.getByRole("button", { name: "Resend verification email" }).click();
    await expect(page.getByText("Too many attempts. Please wait and try again. Try again in about 10 min.")).toBeVisible();
    // The button is usable again (a second try is the visitor's choice).
    await expect(page.getByRole("button", { name: "Resend verification email" })).toBeEnabled();
  });
});

test.describe("profile: address and tax id", () => {
  test("address and tax id are saved on their own, survive a reload, and a 301-character address is refused on its field", async ({ page }) => {
    await signedInMerchant(page);
    await go(page, "/en/merchant/settings");
    // The profile form hydrates a moment after the header's search box, which is all `go` waits for.
    await hydrated(page);

    const address = page.getByLabel(/^Address/);
    const taxId = page.getByLabel(/^Tax ID/);
    await expect(address).toHaveAttribute("maxlength", "300");
    await expect(taxId).toHaveAttribute("maxlength", "40");
    await address.fill("12 Rainbow Street\nAmman");
    await taxId.fill("TX-4455");
    const patch = page.waitForRequest((r) => r.url().endsWith("/client/profile") && r.method() === "PATCH");
    await page.getByRole("button", { name: "Save changes" }).click();
    // Only the changed keys go out.
    expect((await patch).postDataJSON()).toEqual({ address: "12 Rainbow Street\nAmman", taxId: "TX-4455" });
    await expect(page.getByText("Profile updated").first()).toBeVisible();
    await page.reload();
    // The reloaded form must be live before the 301 characters are put in below: an input event before hydration is lost.
    await hydrated(page);
    await expect(page.getByLabel(/^Address/)).toHaveValue("12 Rainbow Street\nAmman");
    await expect(page.getByLabel(/^Tax ID/)).toHaveValue("TX-4455");
    await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();

    // The browser stops typing at 300 characters, so a longer value is put in directly: the API still refuses it, and
    // the refusal is shown on the field with focus on it.
    await page.getByLabel(/^Address/).evaluate((element, value) => {
      const area = element as HTMLTextAreaElement;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(area, value);
      area.dispatchEvent(new Event("input", { bubbles: true }));
    }, "a".repeat(301));
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("This value is too long or too large.")).toBeVisible();
    await expect(page.getByLabel(/^Address/)).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel(/^Address/)).toBeFocused();
  });
});

test.describe("API keys", () => {
  test("a key staff made shows \"Made by support\"; a key the merchant made does not", async ({ page }) => {
    const merchant = await approvedMerchant(page);
    const supportKey = await staffApiKeyFor(merchant.id, `Support key ${Date.now()}`);
    const own = await page.request.post("/client/api-keys", {
      headers: { Origin: new URL(BASE_URL).origin, "X-CSRF-Token": merchant.csrf, "Content-Type": "application/json" },
      data: { name: `Own key ${Date.now()}`, scopes: ["orders:read"] },
    });
    expect(own.status(), await own.text()).toBe(201);
    const ownName = ((await own.json()) as { key: { name: string } }).key.name;

    await page.goto("/en/merchant/api-keys");
    const card = (name: string) => page.locator("article", { has: page.getByRole("heading", { name }) });
    await expect(card(supportKey.name)).toBeVisible();
    await expect(card(supportKey.name).getByText("Made by support")).toBeVisible();
    await expect(card(ownName)).toBeVisible();
    await expect(card(ownName).getByText("Made by support")).toHaveCount(0);
  });
});

test.describe("notification preferences: Announcements", () => {
  test("the row has the site's own title, Telegram starts on and disabled, and saving Email alone answers 200", async ({ page }) => {
    await approvedMerchant(page);
    await go(page, "/en/merchant/settings/notifications");

    const announcements = page.getByRole("group", { name: "Announcements" });
    await expect(page.getByText("News, offers and updates from our team.")).toBeVisible();
    await expect(announcements.getByRole("switch", { name: "Email" })).toBeChecked();
    await expect(announcements.getByRole("switch", { name: "Telegram" })).toBeDisabled();
    await expect(announcements.getByRole("switch", { name: "Telegram" })).toBeChecked();

    await announcements.getByRole("switch", { name: "Email" }).uncheck();
    const saved = page.waitForResponse((r) => r.url().endsWith("/client/notification-preferences") && r.request().method() === "PUT");
    await page.getByRole("button", { name: "Save changes" }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    // The row goes back with the Telegram value the GET showed: no "Link Telegram first".
    expect(response.request().postDataJSON()).toEqual({ events: [{ event: "broadcast.announcement", email: false, telegram: true }] });
    await expect(page.getByText("Notification settings saved").first()).toBeVisible();
    await expect(page.getByText("Link Telegram first.")).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("group", { name: "Announcements" }).getByRole("switch", { name: "Email" })).not.toBeChecked();
    await expect(page.getByRole("group", { name: "Announcements" }).getByRole("switch", { name: "Telegram" })).toBeChecked();
  });
});
