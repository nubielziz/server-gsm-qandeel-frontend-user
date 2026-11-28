// The countries a form of the auth pages offers: the shop's tax-rate countries when the shop has any, else the full list
// (`shopCountryOptions`). The server accepts a country of the full ISO list when no tax window is in force and only the countries of
// the windows in force otherwise, so this is the menu that never offers a refused country and is never empty. The read is the shop's
// cached config (shared data, never personal). If the config cannot be read the full list is offered, so a form never fails to
// draw because of it (the server still judges the country, on its field). Server only (the config is read through `'use cache'`).
import { getStoreConfig } from "@/lib/api/public";
import { countryOptions, shopCountryOptions, type CountryOption } from "@/lib/countries";

/**
 * The menu of countries for the sign-up form, the "finish your account" form and the merchant application.
 *
 * @returns `{ code, name }` sorted by name: the countries of the shop's tax rates, else every country
 */
export async function readShopCountries(): Promise<CountryOption[]> {
  try {
    return shopCountryOptions((await getStoreConfig()).taxRates);
  } catch {
    return countryOptions();
  }
}
