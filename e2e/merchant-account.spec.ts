// Merchant account: the address and tax id in the profile, the "Made by support" API keys and the Announcements row, plus the
// mark on an address that is not verified. Real browser -> Next -> the isolated demo backend (:3100).
// Rules: one throwaway merchant per test (the demo merchant is never changed), made the way the product makes one: staff create
// it and it sets its password from the invitation (`freshAccount`); the one that needs an unverified email gets it from a staff
// change of the address (`unverified`); nothing is switched off globally. `mustChangePassword` has no e2e: no staff route sets
// the flag on a full session, so the gate's decision is a unit test (components/merchant/must-change-password-gate.test.tsx)
// and a person checks it by hand.
import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import { staffApiKeyFor } from "./admin";
import { BASE_URL, freshAccount, go, hydrated, signIn } from "./helpers";

/** A signed-in throwaway merchant: active, its email verified, or not verified yet with `unverified`. */
async function signedInMerchant(page: Page, options: { unverified?: boolean } = {}) {
  const account = await freshAccount(page, { rank: "merchant", ...options });
  const csrf = await signIn(page, account);
  return { ...account, csrf };
}

test.describe("an address that is not verified", () => {
  test("is marked, tells where the link went, and offers no button that sends another one", async ({ page }) => {
    await signedInMerchant(page, { unverified: true });
    await go(page, "/en/account/settings");
    await expect(page.getByText("Not verified", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/not verified yet\. Open the link in the email we sent you/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Resend verification email" })).toHaveCount(0);
  });

  test("a verified address shows the Verified badge and the hint to contact support", async ({ page }) => {
    await signedInMerchant(page);
    await go(page, "/en/account/settings");
    await expect(page.getByText("Verified", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("To change your email address, contact support.")).toBeVisible();
    await expect(page.getByText("Not verified", { exact: true })).toHaveCount(0);
  });
});

test.describe("profile: address and tax id", () => {
  test("address and tax id are saved on their own, survive a reload, and a 301-character address is refused on its field", async ({ page }) => {
    await signedInMerchant(page);
    await go(page, "/en/account/settings");
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
    const merchant = await signedInMerchant(page);
    const supportKey = await staffApiKeyFor(merchant.id, `Support key ${Date.now()}`);
    const own = await page.request.post("/client/api-keys", {
      headers: { Origin: new URL(BASE_URL).origin, "X-CSRF-Token": merchant.csrf, "Content-Type": "application/json" },
      data: { name: `Own key ${Date.now()}`, scopes: ["dhru"] },
    });
    expect(own.status(), await own.text()).toBe(201);
    const ownName = ((await own.json()) as { key: { name: string } }).key.name;

    await page.goto("/en/account/settings/api-keys");
    const card = (name: string) => page.locator("article", { has: page.getByRole("heading", { name }) });
    await expect(card(supportKey.name)).toBeVisible();
    await expect(card(supportKey.name).getByText("Made by support")).toBeVisible();
    await expect(card(ownName)).toBeVisible();
    await expect(card(ownName).getByText("Made by support")).toHaveCount(0);
  });
});

test.describe("notification preferences: Announcements", () => {
  test("the row has the site's own title and one Email switch, and saving it answers 200", async ({ page }) => {
    await signedInMerchant(page);
    await go(page, "/en/account/settings/notifications");

    const announcements = page.getByRole("group", { name: "Announcements" });
    await expect(page.getByText("News, offers and updates from our team.")).toBeVisible();
    await expect(announcements.getByRole("switch", { name: "Email" })).toBeChecked();
    await expect(announcements.getByRole("switch")).toHaveCount(1);

    await announcements.getByRole("switch", { name: "Email" }).uncheck();
    const saved = page.waitForResponse((r) => r.url().endsWith("/client/notification-preferences") && r.request().method() === "PUT");
    await page.getByRole("button", { name: "Save changes" }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    // One row, the Email value (an older API also gets back the extra flag it showed).
    expect(response.request().postDataJSON()).toMatchObject({ events: [{ event: "broadcast.announcement", email: false }] });
    await expect(page.getByText("Notification settings saved").first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole("group", { name: "Announcements" }).getByRole("switch", { name: "Email" })).not.toBeChecked();
  });
});
