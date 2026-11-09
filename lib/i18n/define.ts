// Typed message namespaces. A namespace holds both languages side by side, and TypeScript forces `ar` to have exactly
// the keys of `en`:
//   export const checkout = defineMessages({ en: { pay: "Pay {amount}" }, ar: { pay: "ادفع {amount}" } });
// Server Components read one language with `getMessages(checkout)` (lib/i18n/server.ts) and pass the strings a Client
// Component needs as props, so translations never ship to the browser in bulk. Safe to import anywhere.
import type { Locale } from "./config";

export type Messages<T> = { [K in keyof T]: T[K] extends string ? string : Messages<T[K]> };
export type Namespace<T> = Record<Locale, Messages<T>>;

export function defineMessages<const T extends Record<string, unknown>>(messages: {
  en: T;
  ar: Messages<T>;
}): Namespace<T> {
  return messages as Namespace<T>;
}

/** Replaces `{name}` placeholders: `fmt("Pay {amount}", { amount: "$5" })`. Unknown placeholders stay as they are. */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export type PluralForms = { other: string; zero?: string; one?: string; two?: string; few?: string; many?: string };

/**
 * Picks the plural form for `count` (Arabic has zero/one/two/few/many/other) and fills `{count}`.
 * `plural('ar', 3, { one: 'خدمة واحدة', two: 'خدمتان', few: '{count} خدمات', other: '{count} خدمة' })`.
 */
export function plural(locale: Locale, count: number, forms: PluralForms, formattedCount?: string): string {
  const rule = new Intl.PluralRules(locale).select(count) as keyof PluralForms;
  const template = (count === 0 && forms.zero) || forms[rule] || forms.other;
  return fmt(template, { count: formattedCount ?? String(count) });
}
