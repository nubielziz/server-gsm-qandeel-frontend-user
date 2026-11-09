"use client";
// Error boundary for everything under a language. Friendly and non-technical: a short message, "Try again" and a way
// home. It replaces the page and its group layout, so it carries its own tiny brand bar. The language comes from the
// route (`useParams`), the texts from the shared `common` namespace (a plain module, safe in the client bundle).
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { isLocale, localePath, DEFAULT_LOCALE } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import { common } from "@/lib/i18n/messages/common";

export default function ErrorPage({
  error,
  retry,
  reset,
}: {
  error: unknown;
  /** Re-fetches and re-renders the segment (Next 16). */
  retry?: () => void;
  /** Re-renders without re-fetching; used when `retry` is not provided. */
  reset?: () => void;
}) {
  const params = useParams<{ lang?: string }>();
  const locale = isLocale(params.lang) ? params.lang : DEFAULT_LOCALE;
  const t = common[locale];
  const errorText = useErrorText();

  useEffect(() => {
    // Kept for developers and monitoring; nothing technical is shown to the visitor.
    console.error(error);
  }, [error]);

  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  const reference = errorText.reference(error) ?? (digest ? fmt(t.states.reference, { id: digest }) : undefined);

  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-page">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-wide items-center px-gutter">
          <a href={localePath(locale)} className="inline-flex min-h-11 items-center gap-2.5 rounded-control" aria-label={t.brand.logoAlt}>
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-[10px] bg-inverse text-[0.6875rem] font-extrabold leading-none tracking-wide text-on-inverse"
            >
              GSM
            </span>
            <span dir="ltr" className="text-[1.375rem] font-extrabold leading-none tracking-tight text-ink">
              {t.brand.name}
            </span>
          </a>
        </div>
      </header>
      <main id="main" className="grid place-items-center px-gutter py-12">
        <ErrorState
          title={t.states.errorPageTitle}
          message={t.states.errorPageText}
          reference={reference}
          action={
            <>
              <Button size="lg" onClick={() => (retry ?? reset)?.()}>
                {t.actions.retry}
              </Button>
              <ButtonLink href={localePath(locale)} variant="secondary" size="lg">
                {t.actions.goHome}
              </ButtonLink>
            </>
          }
        />
      </main>
    </div>
  );
}
