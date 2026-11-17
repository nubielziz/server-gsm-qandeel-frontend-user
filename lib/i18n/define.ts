// Typed message namespaces. A namespace holds the site's texts under its one language, `en`:
//   export const checkout = defineMessages({ en: { pay: "Pay {amount}" } });
// Server Components read it with `getMessages(checkout)` (lib/i18n/server.ts) and pass the strings a Client
// Component needs as props, so the texts never ship to the browser in bulk. Safe to import anywhere.
import type { Locale } from "./config";

export type Messages<T> = { [K in keyof T]: T[K] extends string ? string : Messages<T[K]> };
export type Namespace<T> = Record<Locale, Messages<T>>;

export function defineMessages<const T extends Record<string, unknown>>(messages: { en: T }): Namespace<T> {
  return messages as Namespace<T>;
}

/** Replaces `{name}` placeholders: `fmt("Pay {amount}", { amount: "$5" })`. Unknown placeholders stay as they are. */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/** English plural forms; `zero`, when given, is used for a count of 0 ("No services"). */
export type PluralForms = { other: string; zero?: string; one?: string };

/**
 * Picks the plural form for `count` and fills `{count}`:
 * `plural('en', 3, { one: '{count} service', other: '{count} services' })` → `3 services`.
 */
export function plural(locale: Locale, count: number, forms: PluralForms, formattedCount?: string): string {
  const rule = new Intl.PluralRules(locale).select(count) as keyof PluralForms;
  const template = (count === 0 && forms.zero) || forms[rule] || forms.other;
  return fmt(template, { count: formattedCount ?? String(count) });
}
