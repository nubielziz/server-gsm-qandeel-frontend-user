// CheckoutHeader (mockup "Secure Checkout"): logo + tagline on the start side; "Back to store", "Help center" and a
// compact account area on the end side, and a quiet theme switch before the account area (from `sm` up: a phone's row has
// no room for one more 44 px button, and the theme chosen anywhere else already applies here).
import Link from "next/link";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import { sitePath } from "@/lib/site-path";
import { common } from "@/lib/i18n/messages/common";
import { AccountArea } from "./account-area";
import { Container } from "./container";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const linkClasses =
  "inline-flex h-11 items-center gap-2 rounded-control px-3 text-body font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink [&_svg]:size-4";

/** The slim header of the checkout pages. No props. */
export function CheckoutHeader() {
  const t = common;
  return (
    <header className="border-b border-line bg-surface">
      <Container width="wide" className="flex h-16 items-center gap-3">
        <Logo tagline />
        <nav aria-label={t.nav.label} className="ms-auto flex items-center gap-1">
          <Link href={sitePath()} className={linkClasses}>
            <ArrowLeft aria-hidden="true" />
            <span className="hidden sm:inline">{t.checkoutHeader.backToStore}</span>
            <span className="sr-only sm:hidden">{t.checkoutHeader.backToStore}</span>
          </Link>
          <Link href={sitePath("/help")} className={linkClasses}>
            <LifeBuoy aria-hidden="true" />
            <span className="hidden sm:inline">{t.checkoutHeader.helpCenter}</span>
            <span className="sr-only sm:hidden">{t.checkoutHeader.helpCenter}</span>
          </Link>
          <ThemeToggle label={t.theme.dark} tone="quiet" className="max-sm:hidden" />
          <span className="ms-1">
            <AccountArea compact />
          </span>
        </nav>
      </Container>
    </header>
  );
}
