"use client";
// LanguageSwitcher: a link to the same page in the other language (query string kept). On click it remembers the choice
// in the `gsm_locale` cookie (1 year) and, for a signed-in customer and/or merchant, saves it on the account first
// (PATCH /store/v1/me and PATCH /client/profile, in parallel, a short wait at most). The label is the other language's
// own name in its own script (English / العربية), with `lang` set.
// Where the page declares its own address in the other language (a service page: its slug differs per language,
// BH §2.1, plan D16) the link goes there: the page's `<link rel="alternate" hreflang=…>` is read from the document head
// and used when it is a path of this same origin and of the other language; otherwise the link is the same path with the
// language swapped (the page then redirects through its `alternates` when the slug differs).
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

  async function onClick(event: MouseEvent<HTMLAnchorElement>) {
    document.cookie = `${LOCALE_COOKIE}=${other}; path=/; max-age=31536000; SameSite=Lax`;
    const customer = Boolean(csrfToken("store"));
    const merchant = Boolean(csrfToken("client"));
    if (!customer && !merchant) return; // Signed out: the plain link navigates.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    // Signed in: save the language first (a short wait at most), then go. A failure never blocks the switch.
    event.preventDefault();
    const target = event.currentTarget.href;
    const saves: Promise<unknown>[] = [];
    if (customer) saves.push(api.patch("/store/v1/me", { locale: other }).catch(() => undefined));
    if (merchant) saves.push(api.patch("/client/profile", { locale: other }).catch(() => undefined));
    await Promise.race([Promise.all(saves), new Promise((resolve) => setTimeout(resolve, 1200))]);
    window.location.assign(target);
  }

  return (
    <a href={href} hrefLang={other} lang={other} onClick={onClick} className={cn(linkClasses, className)}>
      <Languages aria-hidden="true" />
      <span>{names[other]}</span>
    </a>
  );
}

/** A "العربية" / "English" link to the other language. Plain `<a>`: the language is a root param, so it is a full navigation. */
export function LanguageSwitcher(props: LanguageSwitcherProps) {
  const other: Locale = LOCALES.find((l) => l !== props.locale) ?? "en";
  // Reading the pathname / query can suspend, so the fallback is the same link to the other language's home.
  return (
    <Suspense
      fallback={
        <a href={`/${other}`} hrefLang={other} lang={other} className={cn(linkClasses, props.className)}>
          <Languages aria-hidden="true" />
          <span>{props.names[other]}</span>
        </a>
      }
    >
      <Inner {...props} />
    </Suspense>
  );
}
