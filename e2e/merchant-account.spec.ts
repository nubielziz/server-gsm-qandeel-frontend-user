// Merchant account (plan F22): the verification-mail resend, address, tax id and email language in the profile, the
// language switch that saves the merchant's language, "Made by support" API keys, the translated Announcements row and
// the service page's own address in the other language. Real browser -> Next -> the isolated demo backend (:3100) and Mailpit.
// Rules: one throwaway merchant per test (the resend limiter is 5 an hour per merchant, and the demo merchant is never
// changed); nothing is switched off globally. `mustChangePassword` has no e2e: no staff route sets the flag on a full
// session, so the gate's decision is a unit test (components/merchant/must-change-password-gate.test.tsx) and the lead
// checks it by hand (plan section 7).
import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import { approveMerchant, merchantIdByEmail, staffApiKeyFor } from "./admin";
import { BASE_URL, freshMerchant, go, signInMerchant, tokenOf, waitForLink } from "./helpers";

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

/** The page has no horizontal scroll (a layout check for the Arabic page). */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
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

  test("Arabic: the labels, the resend and its answer are Arabic, and the page does not scroll sideways", async ({ page }) => {
    await signedInMerchant(page);
    await go(page, "/ar/merchant/settings");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByLabel(/^العنوان/)).toBeVisible();
    await expect(page.getByLabel(/^الرقم الضريبي/)).toBeVisible();
    await expect(page.getByLabel("لغة رسائلنا")).toBeVisible();
    await expect(page.getByText("لم يتم التحقق", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "إعادة إرسال رسالة التحقق" }).click();
    await expect(page.getByText("أرسلنا رابطًا جديدًا. الروابط السابقة لم تعد تعمل.")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe("profile: address, tax id, email language", () => {
  test("address and tax id are saved on their own, survive a reload, and a 301-character address is refused on its field", async ({ page }) => {
    await signedInMerchant(page);
    await go(page, "/en/merchant/settings");

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

  test("changing the language of our emails sends { locale: \"ar\" } and nothing else", async ({ page }) => {
    await signedInMerchant(page);
    await go(page, "/en/merchant/settings");
    const language = page.getByLabel("Language of our emails");
    await expect(language).toHaveValue("en");
    await expect(page.getByText("We write our emails and notifications to you in this language.")).toBeVisible();

    await language.selectOption("ar");
    const patch = page.waitForRequest((r) => r.url().endsWith("/client/profile") && r.method() === "PATCH");
    await page.getByRole("button", { name: "Save changes" }).click();
    expect((await patch).postDataJSON()).toEqual({ locale: "ar" });
    await expect(page.getByText("Profile updated").first()).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Language of our emails")).toHaveValue("ar");
    // The page language did not change: only the language of the emails did.
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test.describe("language switch", () => {
  test("a signed-in merchant's switch saves the language before it navigates", async ({ page, isMobile }) => {
    test.skip(isMobile, "the header switcher sits in the menu drawer on a phone: same code path");
    await signedInMerchant(page);
    await page.goto("/en/services");
    const switcher = page.locator('a[hreflang="ar"]:visible').first();
    // Until the page is hydrated the link is a plain fallback to /ar: wait for the real one before clicking.
    await expect(switcher).toHaveAttribute("href", "/ar/services");

    const patch = page.waitForRequest((r) => r.url().endsWith("/client/profile") && r.method() === "PATCH");
    await switcher.click();
    expect((await patch).postDataJSON()).toEqual({ locale: "ar" });
    await expect(page).toHaveURL(/\/ar\/services$/);
    await expect(async () => {
      const me = await page.request.get("/client/auth/me");
      expect((await me.json()).locale).toBe("ar");
    }).toPass();
  });

  test("a signed-out visitor's switch is a plain link: no account call", async ({ page, isMobile }) => {
    test.skip(isMobile, "the header switcher sits in the menu drawer on a phone: same code path");
    const calls: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "PATCH") calls.push(r.url());
    });
    await page.goto("/en/services");
    const switcher = page.locator('a[hreflang="ar"]:visible').first();
    await expect(switcher).toHaveAttribute("href", "/ar/services");
    await switcher.click();
    await expect(page).toHaveURL(/\/ar\/services$/);
    expect(calls).toEqual([]);
  });

  test("on a service page the switcher goes to the other language's own slug", async ({ page, isMobile }) => {
    test.skip(isMobile, "the header switcher sits in the menu drawer on a phone: same code path");
    // The slug differs per language (e2e/service-display.spec.ts reads the same pair).
    await page.goto("/en/services/icloud-clean-lost-check");
    const link = page.locator('link[rel="alternate"][hreflang="ar"]');
    await expect(link).toHaveAttribute("href", /\/ar\/services\/fahs-icloud$/);
    const alternate = new URL((await link.getAttribute("href")) ?? "");

    const switcher = page.locator('a[hreflang="ar"]:visible').first();
    await expect(switcher).toHaveAttribute("href", /^\/ar\/services\//);
    if (alternate.origin === new URL(page.url()).origin) {
      // The link target is the alternate's own path, not the swapped path.
      await expect(switcher).toHaveAttribute("href", "/ar/services/fahs-icloud");
    } else {
      // The page's metadataBase is another origin than the one under test (build with NEXT_PUBLIC_SITE_URL=<base URL>):
      // the switcher then uses the swapped path and the page redirects to the same slug.
      test.info().annotations.push({ type: "note", description: `metadataBase ${alternate.origin} differs from ${new URL(page.url()).origin}: href check skipped` });
    }
    await switcher.click();
    await expect(page).toHaveURL(/\/ar\/services\/fahs-icloud$/);

    // And back: the Arabic page's link leads to the English slug.
    const back = page.locator('a[hreflang="en"]:visible').first();
    await expect(back).toHaveAttribute("href", /^\/en\/services\//);
    await back.click();
    await expect(page).toHaveURL(/\/en\/services\/icloud-clean-lost-check$/);
  });

  test("on a page without an address of its own the switcher swaps the language of the path (not the root layout's /ar)", async ({ page, isMobile }) => {
    test.skip(isMobile, "the header switcher sits in the menu drawer on a phone: same code path");
    // The support page sets no alternates, so it inherits the root layout's generic ones (hreflang ar = /ar, the home page).
    await page.goto("/en/support");
    await expect(page.locator('link[rel="alternate"][hreflang="ar"]')).toHaveAttribute("href", /\/ar$/);
    const switcher = page.locator('a[hreflang="ar"]:visible').first();
    await expect(switcher).toHaveAttribute("href", "/ar/support");
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

  test("Arabic: the badge is Arabic", async ({ page }) => {
    const merchant = await approvedMerchant(page);
    const supportKey = await staffApiKeyFor(merchant.id, `مفتاح الدعم ${Date.now()}`);
    await page.goto("/ar/merchant/api-keys");
    const card = page.locator("article", { has: page.getByRole("heading", { name: supportKey.name }) });
    await expect(card.getByText("أنشأه الدعم")).toBeVisible();
    await expectNoHorizontalScroll(page);
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

  test("Arabic: the row is translated, not the API's English label", async ({ page }) => {
    await approvedMerchant(page);
    await go(page, "/ar/merchant/settings/notifications");
    const announcements = page.getByRole("group", { name: "الإعلانات" });
    await expect(announcements).toBeVisible();
    await expect(page.getByText("أخبار وعروض وتحديثات من فريقنا.")).toBeVisible();
    await expect(page.getByText("Announcements", { exact: true })).toHaveCount(0);
    await expect(announcements.getByRole("switch", { name: "تيليجرام" })).toBeDisabled();
    await expect(announcements.getByRole("switch", { name: "تيليجرام" })).toBeChecked();

    await announcements.getByRole("switch", { name: "البريد" }).uncheck();
    const saved = page.waitForResponse((r) => r.url().endsWith("/client/notification-preferences") && r.request().method() === "PUT");
    await page.getByRole("button", { name: "حفظ التغييرات" }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByText("تم حفظ إعدادات الإشعارات").first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
