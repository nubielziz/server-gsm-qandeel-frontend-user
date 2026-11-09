// BusyState: what a page shows when its data load answers 429 RATE_LIMITED instead of crashing into the error page.
// Token pages (tracking, checkout, tickets) share a limit of 30 requests a minute per IP on the API (handoff §3.9).
// Server component.
import { Clock } from "lucide-react";
import type { ApiError } from "@/lib/api/errors";
import { errorText } from "@/lib/i18n/error-text-core";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { common } from "@/lib/i18n/messages/common";
import { errors } from "@/lib/i18n/messages/errors";
import { ButtonLink } from "./button";
import { Card } from "./card";
import { ErrorState } from "./error-state";

export type BusyStateProps = {
  /** The 429 ApiError (its Retry-After is shown). */
  error: ApiError;
  /** Where "Try again" goes: the same page, language-prefixed. */
  retryHref: string;
};

/** "Too many requests, try again in N s" with a retry link, inside a card. */
export async function BusyState({ error, retryHref }: BusyStateProps) {
  const [locale, c] = await Promise.all([getLocale(), getMessages(common)]);
  const t = errorText(errors[locale]);
  return (
    <Card className="mx-auto max-w-xl">
      <ErrorState
        icon={<Clock aria-hidden="true" />}
        title={c.states.errorTitle}
        message={t.message(error)}
        reference={t.reference(error)}
        action={
          <ButtonLink href={retryHref} variant="secondary">
            {c.actions.retry}
          </ButtonLink>
        }
      />
    </Card>
  );
}
