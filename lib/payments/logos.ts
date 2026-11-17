// Logos of payment methods (feature 32, ready-made payment methods). Pure and safe anywhere: the three places that offer
// a method (the customer's and the merchant's top-up forms, the checkout) are Client Components, so no file is read here.
// The order of a logo is the API's: the picture staff uploaded (`logoUrl`, `/store/v1/media/<name>`), else the bundled logo
// of the method's `preset` (`public/images/payments/<file>`), else an icon. Which bundled files exist comes from
// `lib/payment-logo-sizes.json`, which `npm run logos` writes (scripts/logo-sizes.mjs), the way the brand logos are listed
// in `lib/logo-sizes.json`: a file that is not listed is not shown, the icon is. docs/LOGOS.md has each file's source.
import paymentLogoSizes from "@/lib/payment-logo-sizes.json";
import { servicePicture } from "@/lib/logo-names";

/** `methodType` of a payment method (the top-up vocabulary of the API). */
export type PaymentMethodType = "bank" | "card" | "usdt" | "wise";

/**
 * The generic icon of a method that has no logo: a bank (`Landmark`), a coin (crypto), a card, or banknotes for a money
 * transfer service (`wise`).
 */
export type PaymentIconKind = "bank" | "crypto" | "card" | "transfer";

type Preset = {
  /** The logo file in `public/images/payments`, or null when the preset has none (it shows an icon). */
  logo: string | null;
  methodType: PaymentMethodType;
};

/**
 * The ready-made methods of the catalog (`GET /admin/payment-gateway-presets`, plan 32 §3): the logo file of each and the
 * top-up method it stands for. `binance_pay_auto` shares the logo of `binance_pay`. Keys the site does not know (a preset
 * a later backend adds) show their icon.
 */
const PRESETS: ReadonlyMap<string, Preset> = new Map([
  ["bank_transfer", { logo: null, methodType: "bank" }],
  ["crypto_transfer", { logo: null, methodType: "usdt" }],
  ["vodafone_cash", { logo: "vodafone_cash.png", methodType: "bank" }],
  ["fawry_transfer", { logo: "fawry_transfer.png", methodType: "bank" }],
  ["instapay", { logo: "instapay.png", methodType: "bank" }],
  ["binance_pay", { logo: "binance_pay.png", methodType: "usdt" }],
  ["nowpayments", { logo: "nowpayments.png", methodType: "usdt" }],
  ["binance_pay_auto", { logo: "binance_pay.png", methodType: "usdt" }],
]);

const sizes = paymentLogoSizes as Record<string, number[] | undefined>;

/**
 * The path of the bundled logo of a preset (`/images/payments/vodafone_cash.png`), or null when the preset has no logo, is
 * not known, or its file is not in `lib/payment-logo-sizes.json` (not added yet, or `npm run logos` not run since it was).
 */
export function bundledPaymentLogo(preset: string | null | undefined): string | null {
  const file = preset ? PRESETS.get(preset)?.logo : null;
  if (!file || !sizes[`payments/${file}`]) return null;
  return `/images/payments/${file}`;
}

/**
 * The pictures a method may be drawn with, best first: the uploaded logo (only a `/store/v1/media/<name>` path of this site
 * is trusted, the same check as a service picture), then the bundled logo of the preset. Empty: the caller draws the icon.
 * More than one so a picture that fails to load (a deleted or unreachable upload) falls back to the next.
 */
export function paymentLogoSources(input: { logoUrl?: string | null; preset?: string | null }): string[] {
  return [servicePicture(input.logoUrl), bundledPaymentLogo(input.preset)].filter((source) => source !== null);
}

/**
 * The icon of a method without a logo. From `methodType` when the API sends it (the top-up lists): bank → bank, usdt →
 * coin, card → card, wise → banknotes (the icons the two top-up forms showed before logos). Without it (the checkout lists
 * only `code`): the preset's top-up method, else the words of the code (`crypto`, `usdt`, `btc` → coin; `bank` → bank),
 * else a card.
 */
export function paymentIconKind(input: { methodType?: PaymentMethodType; preset?: string | null; code?: string }): PaymentIconKind {
  const type = input.methodType ?? (input.preset ? PRESETS.get(input.preset)?.methodType : undefined);
  if (type === "bank") return "bank";
  if (type === "usdt") return "crypto";
  if (type === "wise") return "transfer";
  if (type === "card") return "card";
  if (input.code && /crypto|usdt|btc/i.test(input.code)) return "crypto";
  if (input.code && /bank/i.test(input.code)) return "bank";
  return "card";
}
