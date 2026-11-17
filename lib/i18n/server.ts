// Server-side language helpers. English is the only language (decision 039): `getLocale()` answers the constant and
// `getMessages(namespace)` its English block. Both keep their signatures until the cleanup wave of feature 30.
import type { Locale } from "./config";
import type { Messages, Namespace } from "./define";

/** The page's language: always `en`. */
export async function getLocale(): Promise<Locale> {
  return "en";
}

/** One namespace's texts. */
export async function getMessages<T>(namespace: Namespace<T>): Promise<Messages<T>> {
  return namespace[await getLocale()];
}
