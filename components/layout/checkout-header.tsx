// CheckoutHeader (mockup "Secure Checkout"): logo + tagline on the start side; "Back to store", "Help center", the
// language switcher and a compact account area on the end side.
import Link from "next/link";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import { localePath } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { common } from "@/lib/i18n/messages/common";
import { AccountArea } from "./account-area";
import { Container } from "./container";
import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./logo";

const linkClasses =
  "inline-flex h-11 items-center gap-2 rounded-control px-3 text-body font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink [&_svg]:size-4";

/** The slim header of the checkout pages. No props. */
export async function CheckoutHeader() {
  const [locale, t] = await Promise.all([getLocale(), getMessages(common)]);
  return (
    <header className="border-b border-line bg-surface">
      <Container width="wide" className="flex h-16 items-center gap-3">
        <Logo tagline />
        <nav aria-label={t.nav.label} className="ms-auto flex items-center gap-1">
          <Link href={localePath(locale)} className={linkClasses}>
            <ArrowLeft aria-hidden="true" className="rtl:-scale-x-100" />
            <span className="hidden sm:inline">{t.checkoutHeader.backToStore}</span>
            <span className="sr-only sm:hidden">{t.checkoutHeader.backToStore}</span>
          </Link>
          <Link href={localePath(locale, "/help")} className={linkClasses}>
            <LifeBuoy aria-hidden="true" />
            <span className="hidden sm:inline">{t.checkoutHeader.helpCenter}</span>
            <span className="sr-only sm:hidden">{t.checkoutHeader.helpCenter}</span>
          </Link>
          <span className="hidden sm:inline-flex">
            <LanguageSwitcher locale={locale} names={t.languageNames} />
          </span>
          <span className="ms-1">
            <AccountArea compact />
          </span>
        </nav>
      </Container>
    </header>
  );
}
