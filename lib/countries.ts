// ISO 3166-1 alpha-2 countries with names in English (Intl.DisplayNames, no data files).
// The API wants upper-case 2-letter codes (checkout `country` locks the tax; merchant sign-up and profile `country`).
// Safe to import anywhere.
import { INTL_LOCALE } from "@/lib/i18n/config";

export const COUNTRY_CODES = [
  "AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ","BA","BB","BD","BE","BF","BG","BH",
  "BI","BJ","BL","BM","BN","BO","BQ","BR","BS","BT","BV","BW","BY","BZ","CA","CC","CD","CF","CG","CH","CI","CK","CL",
  "CM","CN","CO","CR","CU","CV","CW","CX","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE","EG","EH","ER","ES","ET",
  "FI","FJ","FK","FM","FO","FR","GA","GB","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU",
  "GW","GY","HK","HM","HN","HR","HT","HU","ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT","JE","JM","JO","JP","KE",
  "KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY","MA","MC",
  "MD","ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ","NA","NC",
  "NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT",
  "PW","PY","QA","RE","RO","RS","RU","RW","SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR",
  "SS","ST","SV","SX","SY","SZ","TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ","UA",
  "UG","UM","US","UY","UZ","VA","VC","VE","VG","VI","VN","VU","WF","WS","XK","YE","YT","ZA","ZM","ZW",
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];
export type CountryOption = { code: string; name: string };

let list: CountryOption[] | undefined;

/** All countries as `{ code, name }`, sorted by name in English. */
export function countryOptions(): CountryOption[] {
  if (!list) {
    const names = new Intl.DisplayNames([INTL_LOCALE], { type: "region" });
    const collator = new Intl.Collator(INTL_LOCALE);
    list = COUNTRY_CODES.map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) =>
      collator.compare(a.name, b.name),
    );
  }
  return list;
}

/**
 * The countries the shop sells to, as `{ code, name }` sorted by name: the countries of its tax rates (`GET /store/v1/config`
 * `taxRates`), the same list the account profile offers. While the shop has tax rates in force the server refuses sign-up, the
 * finish form and the profile for any other country. A shop with no tax rate yet gets every country: the server then accepts any
 * code of the ISO list (`COUNTRY_CODES`, backend decision 079), so the menu is never empty and never offers a refused country.
 * Used by the sign-up form, the "finish your account" form and the merchant application (`readShopCountries`).
 */
export function shopCountryOptions(taxRates: readonly { country: string }[]): CountryOption[] {
  const codes = new Set(taxRates.map((rate) => rate.country.toUpperCase()));
  if (codes.size === 0) return countryOptions();
  const collator = new Intl.Collator(INTL_LOCALE);
  return [...codes].map((code) => ({ code, name: countryName(code) })).sort((a, b) => collator.compare(a.name, b.name));
}

/** One country's name in English ("JO" → "Jordan"); the code itself when unknown or empty. */
export function countryName(code: string): string {
  if (!code) return "";
  try {
    return new Intl.DisplayNames([INTL_LOCALE], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
