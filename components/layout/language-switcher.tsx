"use client";
// LanguageSwitcher: a link to the same page in the other language (query string kept). On click it remembers the choice
// in the `gsm_locale` cookie (1 year) and, for a signed-in customer, saves it on the account first (PATCH /store/v1/me).
// The label is the other language's own name in its own script (English / العربية), with `lang` set.
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, type MouseEvent } from "react";
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

function Inner({ locale, names, className }: LanguageSwitcherProps) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const other: Locale = LOCALES.find((l) => l !== locale) ?? "en";
  const href = `${switchLocalePath(pathname, other)}${search ? `?${search}` : ""}`;

  async function onClick(event: MouseEvent<HTMLAnchorElement>) {
    document.cookie = `${LOCALE_COOKIE}=${other}; path=/; max-age=31536000; SameSite=Lax`;
    if (!csrfToken("store")) return; // Signed out: the plain link navigates.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    // Signed in: save the language first (a short wait at most), then go. A failure never blocks the switch.
    event.preventDefault();
    const target = event.currentTarget.href;
    await Promise.race([
      api.patch("/store/v1/me", { locale: other }).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);
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
