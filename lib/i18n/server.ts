// Server-side language helpers. The language is the root route parameter `[lang]` (app/[lang]/layout.tsx), read with
// `next/root-params` so any Server Component or server utility can get it without props. Server-only by construction:
// importing next/root-params fails the build in a Client Component.
import { lang } from "next/root-params";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";
import type { Messages, Namespace } from "./define";

/** The current page's language (`en` | `ar`). */
export async function getLocale(): Promise<Locale> {
  const value = await lang();
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** One namespace in the current language. */
export async function getMessages<T>(namespace: Namespace<T>): Promise<Messages<T>> {
  return namespace[await getLocale()];
}
