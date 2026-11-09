// Localized 404 for `notFound()` calls inside a language (a missing service, article or page). It renders inside the
// root layout, so it brings its own header and footer. URLs that match no route at all show app/global-not-found.tsx.
import { Compass } from "lucide-react";
import { ChromeProviders } from "@/components/layout/chrome-providers";
import { Container } from "@/components/layout/container";
import { SkipLink } from "@/components/layout/skip-link";
import { StoreFooter } from "@/components/layout/store-footer";
import { StoreHeader } from "@/components/layout/store-header";
import { ButtonLink } from "@/components/ui/button";
import { localePath } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { common } from "@/lib/i18n/messages/common";

export default async function NotFound() {
  const [locale, t] = await Promise.all([getLocale(), getMessages(common)]);
  return (
    <ChromeProviders>
      <SkipLink />
      <StoreHeader />
      <main id="main">
        <Container width="narrow" className="flex flex-col items-center py-20 text-center sm:py-28">
          <span className="grid size-16 place-items-center rounded-full bg-surface-sunken text-ink-muted [&_svg]:size-7">
            <Compass aria-hidden="true" />
          </span>
          <p className="mt-6 text-small font-bold uppercase tracking-wide text-ink-subtle num">404</p>
          <h1 className="mt-2 text-title text-ink">{t.states.notFoundTitle}</h1>
          <p className="mt-3 max-w-md text-body text-ink-muted">{t.states.notFoundText}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href={localePath(locale)} size="lg">
              {t.actions.goHome}
            </ButtonLink>
            <ButtonLink href={localePath(locale, "/services")} variant="secondary" size="lg">
              {t.actions.browseServices}
            </ButtonLink>
          </div>
        </Container>
      </main>
      <StoreFooter />
    </ChromeProviders>
  );
}
