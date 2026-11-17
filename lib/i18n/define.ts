// Text helpers for the message namespaces (lib/i18n/messages/*.ts: plain objects of English strings). Server Components
// import a namespace and pass the strings a Client Component needs as props, so the texts never ship to the browser in
// bulk. Safe to import anywhere.
import { INTL_LOCALE } from "./config";

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
 * `plural(3, { one: '{count} service', other: '{count} services' })` → `3 services`.
 */
export function plural(count: number, forms: PluralForms, formattedCount?: string): string {
  const rule = new Intl.PluralRules(INTL_LOCALE).select(count) as keyof PluralForms;
  const template = (count === 0 && forms.zero) || forms[rule] || forms.other;
  return fmt(template, { count: formattedCount ?? String(count) });
}
