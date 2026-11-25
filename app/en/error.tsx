"use client";
// Error boundary for every page of the site. Friendly and non-technical: a short message, "Try again" and a way home.
// It replaces the page and its group layout, so it carries its own tiny brand bar. The texts come from
// <ErrorTextProvider> (root layout): importing `common` here would add about 5 KB (gzip) to the shared chunk that 52 of
// 53 routes load.
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { fmt } from "@/lib/i18n/define";
import { useErrorPageText, useErrorText } from "@/lib/i18n/error-text";
import { sitePath } from "@/lib/site-path";

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
  const t = useErrorPageText();
  const errorText = useErrorText();

  useEffect(() => {
    // Kept for developers and monitoring; nothing technical is shown to the visitor.
    console.error(error);
  }, [error]);

  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  const reference = errorText.reference(error) ?? (digest ? fmt(t.reference, { id: digest }) : undefined);

  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-page">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-wide items-center px-gutter">
          <a href={sitePath()} className="inline-flex min-h-11 items-center gap-2.5 rounded-control" aria-label={t.logoAlt}>
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-[10px] bg-primary text-[0.6875rem] font-extrabold leading-none tracking-wide text-on-primary"
            >
              GSM
            </span>
            <span dir="ltr" className="text-[1.375rem] font-extrabold leading-none tracking-tight text-ink">
              {t.brandName}
            </span>
          </a>
        </div>
      </header>
      <main id="main" className="grid place-items-center px-gutter py-12">
        <ErrorState
          title={t.title}
          message={t.text}
          reference={reference}
          action={
            <>
              <Button size="lg" onClick={() => (retry ?? reset)?.()}>
                {t.retry}
              </Button>
              <ButtonLink href={sitePath()} variant="secondary" size="lg">
                {t.goHome}
              </ButtonLink>
            </>
          }
        />
      </main>
    </div>
  );
}
