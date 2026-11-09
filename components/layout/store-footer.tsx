// StoreFooter (dark, like the mockup): brand and description, link columns, copyright. No newsletter form (the API has
// none) and no social links (none supplied).
import Link from "next/link";
import { cacheLife } from "next/cache";
import { localePath } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { common } from "@/lib/i18n/messages/common";
import { Container } from "./container";
import { Logo } from "./logo";

const linkClasses =
  "inline-flex min-h-11 items-center rounded-badge text-body text-on-inverse-muted transition-colors hover:text-on-inverse";

// `new Date()` is request-independent only inside a cache scope; the year changes once a year.
async function CopyrightYear(): Promise<string> {
  "use cache";
  cacheLife("days");
  return String(new Date().getFullYear());
}

/** The dark site footer. */
export async function StoreFooter() {
  const [locale, t, year] = await Promise.all([getLocale(), getMessages(common), CopyrightYear()]);
  const p = (path: string) => localePath(locale, path);
  const columns = [
    {
      title: t.footer.shop,
      links: [
        { href: p("/services"), label: t.nav.allServices },
        { href: p("/imei-check"), label: t.nav.imeiCheck },
        { href: p("/track"), label: t.nav.trackOrder },
      ],
    },
    {
      title: t.footer.help,
      links: [
        { href: p("/help"), label: t.nav.help },
        { href: p("/support"), label: t.nav.support },
      ],
    },
    {
      title: t.footer.legal,
      links: [
        { href: p("/pages/terms"), label: t.footer.terms },
        { href: p("/pages/privacy"), label: t.footer.privacy },
        { href: p("/pages/refund"), label: t.footer.refund },
        { href: p("/pages/cookies"), label: t.footer.cookies },
      ],
    },
    {
      title: t.footer.merchants,
      links: [
        { href: p("/merchant"), label: t.footer.portal },
        { href: p("/merchant/register"), label: t.footer.becomeMerchant },
      ],
    },
  ];

  return (
    <footer aria-label={t.footer.label} className="surface-inverse mt-16">
      <Container width="wide" className="py-12 lg:py-14">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="max-w-sm">
            <Logo tone="inverse" />
            <p className="mt-4 text-body text-on-inverse-muted">{t.brand.description}</p>
          </div>
          {columns.map((column, i) => (
            <nav key={i} aria-labelledby={`footer-col-${i}`}>
              <h2 id={`footer-col-${i}`} className="text-body font-bold text-on-inverse">
                {column.title}
              </h2>
              <ul className="mt-2 grid">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={linkClasses}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 border-t border-inverse-raised pt-6">
          <p className="text-small text-on-inverse-muted">{fmt(t.footer.rights, { year })}</p>
        </div>
      </Container>
    </footer>
  );
}
