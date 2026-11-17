// The customer's profile card in the account settings (plan F23, BH §7.2): name, phone and country are edited with
// `PATCH /store/v1/me`, only the changed keys are sent, `""` clears the phone, a country change refreshes the shop
// currency from the answer, and the 422 texts sit on their fields. Every test uses a throwaway customer (the shared demo
// accounts stay as the other specs expect them). Runs against the isolated demo backend (:3100) only.
import type { Page, Request } from "@playwright/test";
import { expect, test } from "./fixtures";
import { freshCustomer, go } from "./helpers";

type Me = { name: string; phone: string; country: string; currency: string | null; email: string };

async function me(page: Page): Promise<Me> {
  const res = await page.request.get("/store/v1/me");
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as Me;
}

/** The profile card of the settings page. */
const profile = (page: Page) => page.locator("section#profile");
const field = (page: Page, name: "name" | "phone" | "email") => profile(page).locator(`input[name="${name}"]`);
const countrySelect = (page: Page) => profile(page).locator('select[name="country"]');
const save = (page: Page) => profile(page).getByRole("button", { name: "Save profile" });

/** Every `PATCH /store/v1/me` body the page sends. */
function recordPatches(page: Page): string[] {
  const bodies: string[] = [];
  page.on("request", (request: Request) => {
    if (request.method() === "PATCH" && new URL(request.url()).pathname === "/store/v1/me") bodies.push(request.postData() ?? "");
  });
  return bodies;
}

async function shopCurrencyCookie(page: Page): Promise<string | undefined> {
  return (await page.context().cookies()).find((cookie) => cookie.name === "gsm_currency")?.value;
}

test("saving the name and the phone sends only those keys, shows the toast, and a reload keeps them", async ({ page }) => {
  await freshCustomer(page);
  await go(page, "/en/account/settings");
  await expect(profile(page).getByRole("heading", { name: "Profile" })).toBeVisible();
  // The section links must not widen the page: no sideways scroll at phone width (they scroll inside their own row).
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await expect(field(page, "email")).toHaveAttribute("readonly", "");
  await expect(profile(page).getByText("To change your email address, contact support.")).toBeVisible();

  const patches = recordPatches(page);
  await field(page, "name").fill("  Amal Haddad ");
  await field(page, "phone").fill("+962 79 000 0000");
  await save(page).click();
  await expect(page.getByText("Profile saved")).toBeVisible();
  expect(patches).toHaveLength(1);
  expect(JSON.parse(patches[0])).toEqual({ name: "Amal Haddad", phone: "+962 79 000 0000" });

  expect(await me(page)).toMatchObject({ name: "Amal Haddad", phone: "+962 79 000 0000" });
  await page.reload();
  await expect(field(page, "name")).toHaveValue("Amal Haddad");
  await expect(field(page, "phone")).toHaveValue("+962 79 000 0000");

  // Nothing changed: no request, a hint.
  await save(page).click();
  await expect(page.getByText("No changes to save")).toBeVisible();
  expect(patches).toHaveLength(1);

  // The overview shows what was saved and now links to this card.
  await go(page, "/en/account");
  await expect(page.getByRole("main").getByText("Amal Haddad", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit profile" })).toHaveAttribute("href", "/en/account/settings#profile");
});

test("a one-letter name is refused on its field, with focus on it, and nothing is sent", async ({ page }) => {
  await freshCustomer(page);
  await go(page, "/en/account/settings");
  const patches = recordPatches(page);

  await field(page, "name").fill("A");
  await save(page).click();
  await expect(field(page, "name")).toHaveAttribute("aria-invalid", "true");
  await expect(profile(page).getByText("Enter your name, from 2 to 120 characters.")).toBeVisible();
  await expect(field(page, "name")).toBeFocused();
  expect(patches).toHaveLength(0);

  // A long name is cut by the field itself, so the API's limit never surprises anyone.
  await expect(field(page, "name")).toHaveAttribute("maxlength", "120");
  await expect(field(page, "phone")).toHaveAttribute("maxlength", "40");

  // The API's own 422 on the name reads the same (the answer is mocked: the browser check normally stops this first).
  await page.route("**/store/v1/me", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 422,
          contentType: "application/problem+json",
          body: JSON.stringify({ type: "x", title: "x", status: 422, code: "VALIDATION_FAILED", errors: [{ field: "name", code: "too_small", message: "Enter the customer’s name." }] }),
        })
      : route.continue(),
  );
  await field(page, "name").fill("Amal Haddad");
  await save(page).click();
  await expect.poll(() => patches.length).toBe(1);
  await expect(profile(page).getByText("Enter your name, from 2 to 120 characters.")).toBeVisible();
  await expect(field(page, "name")).toBeFocused();
});

test("a country change lists the shop's countries, saves, and moves the currency select and the cookie to the answer's currency", async ({ page }) => {
  await freshCustomer(page);
  const config = (await (await page.request.get("/store/v1/config")).json()) as { taxRates: { country: string }[] };
  const sellable = [...new Set(config.taxRates.map((rate) => rate.country))].sort();
  expect(sellable).toContain("GB");

  await go(page, "/en/account/settings");
  // Only the countries with a tax rate are offered (the account has none saved, so the first option asks for one).
  const options = await countrySelect(page).locator("option").evaluateAll((all) => all.map((option) => (option as HTMLOptionElement).value));
  expect(options.filter((code) => code !== "").sort()).toEqual(sellable);
  await expect(countrySelect(page)).toHaveValue("");

  const patches = recordPatches(page);
  await countrySelect(page).selectOption("GB");
  await save(page).click();
  await expect(page.getByText("Profile saved")).toBeVisible();
  await expect(page.getByText("Prices are now shown in")).toBeVisible();
  expect(patches).toHaveLength(1);
  expect(JSON.parse(patches[0])).toEqual({ country: "GB" });

  // The API reset the currency to the country's default; the site follows the answer, not its own guess.
  const after = await me(page);
  expect(after.country).toBe("GB");
  expect(after.currency, "the API gives a currency to this country").toBeTruthy();
  await expect.poll(() => shopCurrencyCookie(page)).toBe(after.currency);
  await expect(page.locator('select[name="currency"]')).toHaveValue(after.currency!);

  // The saved country stays after a reload, and it can be changed but no longer left empty.
  await page.reload();
  await expect(countrySelect(page)).toHaveValue("GB");
  await expect(countrySelect(page).locator('option[value=""]')).toHaveCount(0);
});

test("a country the shop does not sell to (422 unsupported) is explained on the country field and changes nothing else", async ({ page }) => {
  await freshCustomer(page);
  await go(page, "/en/account/settings");
  await page.route("**/store/v1/me", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 422,
          contentType: "application/problem+json",
          body: JSON.stringify({ type: "x", title: "x", status: 422, code: "VALIDATION_FAILED", errors: [{ field: "country", code: "unsupported", message: "Choose a country." }] }),
        })
      : route.continue(),
  );

  await countrySelect(page).selectOption("GB");
  await save(page).click();
  await expect(profile(page).getByText("We do not sell to this country yet.")).toBeVisible();
  await expect(countrySelect(page)).toHaveAttribute("aria-invalid", "true");
  await expect(countrySelect(page)).toBeFocused();
  expect(await shopCurrencyCookie(page)).toBeUndefined();
  expect((await me(page)).country).toBe("");
});

test("emptying the phone sends an empty string, and the API clears it", async ({ page }) => {
  await freshCustomer(page);
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "csrf_token_store")?.value ?? "";
  const seeded = await page.request.patch("/store/v1/me", { headers: { "X-CSRF-Token": csrf }, data: { phone: "+962 79 111 2222" } });
  expect(seeded.status(), await seeded.text()).toBe(200);

  await go(page, "/en/account/settings");
  await expect(field(page, "phone")).toHaveValue("+962 79 111 2222");
  const patches = recordPatches(page);
  await field(page, "phone").fill("");
  await save(page).click();
  await expect(page.getByText("Profile saved")).toBeVisible();
  expect(patches).toHaveLength(1);
  expect(JSON.parse(patches[0])).toEqual({ phone: "" });
  expect((await me(page)).phone).toBe("");
  await page.reload();
  await expect(field(page, "phone")).toHaveValue("");
});

// Group C (plan 30 §9.1): a name typed in Arabic script is data. It is saved and read back as typed on the English page
// (the escapes are the letters of an Arabic name; no Arabic script in this file).
test("a name typed in Arabic script is saved as typed, and a one-letter one is refused like any other", async ({ page }) => {
  const arabicName = "\u0623\u0645\u0644 \u062D\u062F\u0627\u062F";
  await freshCustomer(page);
  await go(page, "/en/account/settings");
  await field(page, "name").fill(arabicName);
  await field(page, "phone").fill("+962790000000");
  await countrySelect(page).selectOption("DE");
  await save(page).click();
  await expect(page.getByText("Profile saved")).toBeVisible();
  expect(await me(page)).toMatchObject({ name: arabicName, phone: "+962790000000", country: "DE" });

  await field(page, "name").fill("\u0623");
  await save(page).click();
  await expect(profile(page).getByText("Enter your name, from 2 to 120 characters.")).toBeVisible();
});
