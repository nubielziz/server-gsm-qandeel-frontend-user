// The shop-currency cookie's name. Its own module because the Client Components that write or read it in the browser
// (currency switcher, profile and preferences forms, search combobox) cannot import lib/currency.ts, which reads
// cookies on the server (next/headers).

/** Cookie that remembers the shop currency (ISO 4217) chosen in the header switcher. */
export const CURRENCY_COOKIE = "gsm_currency";
