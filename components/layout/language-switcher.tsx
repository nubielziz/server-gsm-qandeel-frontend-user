"use client";
// LanguageSwitcher: a link to the same page in the other language (query string kept). On click it remembers the choice
// in the `gsm_locale` cookie (1 year) and, for a signed-in customer and/or merchant, saves it on the account (PATCH
// /store/v1/me and PATCH /client/profile) without waiting: `keepalive`, never awaited, so a failed save only loses the
// saved language, never the switch. The label is the other language's own name in its own script (English / العربية),
// with `lang` set; on an English page "العربية" uses the system font, so the page never downloads the Arabic web font for
// one word.
// A soft navigation (next/link, plan P3.5): the language is the root param `[lang]`, and a navigation that changes only a
// root param keeps the same root layout (Next docs: `script.md`, "These scripts run once per document load …
// including one that only changes a root param"; `layout.md`: only a change of root layout is a full page load), so the
// root layout renders again with the new language: `<html lang dir>`, the metadata (hreflang alternates) and every
// string follow without a document load.
// Where the page declares its own address in the other language (a service page: its slug differs per language,
// BH §2.1, plan D16) the link goes there: the page's `<link rel="alternate" hreflang=…>` is read from the document head
// and used when it is a path of this same origin and of the other language; otherwise the link is the same path with the
// language swapped (the page then redirects through its `alternates` when the slug differs).
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useSyncExternalStore, type MouseEvent } from "react";
import { Languages } from "lucide-react";
import { api, csrfToken } from "@/lib/api/browser";
import { LOCALE_COOKIE, LOCALES, switchLocalePath, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/cn";

export type LanguageSwitcherProps = {
  /** The current page language. */
  locale: Locale;
  /** Names of the languages in their own script: `{ en: "English", ar: "العربية" }`. */
  names: Record<Locale, string>;
  className?: string;
};

const linkClasses =
  "relative inline-flex h-11 items-center gap-2 rounded-control px-3 text-body font-semibold text-ink transition-colors hover:bg-surface-sunken [&_svg]:size-4 [&_svg]:text-ink-subtle";

/**
 * The label's font: on an English page the Arabic name gets the system font (Inter has no Arabic glyphs, and falling
 * back to IBM Plex Sans Arabic would download its Arabic file for this one word). On an Arabic page "English" keeps the
 * page font (Inter, already loaded).
 */
const labelClass = (other: Locale) => (other === "ar" ? "[font-family:ui-sans-serif,system-ui,sans-serif]" : undefined);

const withoutTrailingSlash = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path);

/**
 * The path of a page's `hreflang` link when the switcher may follow it, else null. The link's `href` is absolute (the
 * metadata has a `metadataBase`): it must be of `origin`, and its path must belong to the other language.
 */
export function alternatePath(href: string | null | undefined, origin: string, other: Locale): string | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  if (url.pathname !== `/${other}` && !url.pathname.startsWith(`/${other}/`)) return null;
  return url.pathname;
}

/**
 * Where the switcher goes: the page's own address in the other language when it has one, else the current path with the
 * language swapped. The query string is kept.
 *
 * The root layout declares `/en` and `/ar` as the alternates of every page that sets none of its own, so the other
 * language's home is only an own address when the current page is the home page.
 */
export function languageSwitchTarget({ pathname, search, other, alternate }: { pathname: string; search: string; other: Locale; alternate: string | null }): string {
  const query = search ? `?${search}` : "";
  const swapped = switchLocalePath(pathname, other);
  if (!alternate) return `${swapped}${query}`;
  const home = `/${other}`;
  if (withoutTrailingSlash(alternate) === home && withoutTrailingSlash(swapped) !== home) return `${swapped}${query}`;
  return `${alternate}${query}`;
}

/** The page's `<link rel="alternate" hreflang=other>` href, as written in the markup. */
function readAlternateHref(other: Locale): string | null {
  return document.querySelector(`link[rel="alternate"][hreflang="${other}"]`)?.getAttribute("href") ?? null;
}

/** The head changes when a page's metadata arrives (streamed in, or swapped by a client navigation). */
function subscribeToHead(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
  return () => observer.disconnect();
}

const noAlternate = () => null;

function Inner({ locale, names, className }: LanguageSwitcherProps) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const other: Locale = LOCALES.find((l) => l !== locale) ?? "en";
  // The server (and the first client render) knows no alternate: the link is the swapped path, then the page's own address.
  const alternate = useSyncExternalStore(
    subscribeToHead,
    () => alternatePath(readAlternateHref(other), window.location.origin, other),
    noAlternate,
  );
  const href = languageSwitchTarget({ pathname, search, other, alternate });

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    document.cookie = `${LOCALE_COOKIE}=${other}; path=/; max-age=31536000; SameSite=Lax`;
    // A new tab or window opens the other language there: nothing to save from this page.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    // Signed in: save the language on the account while the link navigates (not awaited; keepalive lets the request
    // finish whatever happens to the page). A failure never blocks the switch.
    if (csrfToken("store")) void api.patch("/store/v1/me", { locale: other }, { keepalive: true }).catch(() => undefined);
    if (csrfToken("client")) void api.patch("/client/profile", { locale: other }, { keepalive: true }).catch(() => undefined);
  }

  return (
    <Link href={href} hrefLang={other} lang={other} onClick={onClick} className={cn(linkClasses, className)}>
      <Languages aria-hidden="true" />
      <span className={labelClass(other)}>{names[other]}</span>
    </Link>
  );
}

/**
 * A "العربية" / "English" link to the other language: a soft navigation (next/link) once hydrated. Until then it is the
 * fallback below, a plain link to the other language's home (a document load).
 */
export function LanguageSwitcher(props: LanguageSwitcherProps) {
  const other: Locale = LOCALES.find((l) => l !== props.locale) ?? "en";
  // Reading the pathname / query can suspend, so the fallback is the same link to the other language's home.
  return (
    <Suspense
      fallback={
        <a href={`/${other}`} hrefLang={other} lang={other} className={cn(linkClasses, props.className)}>
          <Languages aria-hidden="true" />
          <span className={labelClass(other)}>{props.names[other]}</span>
        </a>
      }
    >
      <Inner {...props} />
    </Suspense>
  );
}
