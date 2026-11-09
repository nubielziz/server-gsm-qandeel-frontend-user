// Server-side loading helpers for the merchant settings pages: a failed API read becomes a calm error card (with the
// request reference) or the "available after approval" notice for a pending merchant, never a crashed page.
import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { isApiError, type ApiError } from "@/lib/api/errors";
import { localePath, type Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import { common } from "@/lib/i18n/messages/common";
import { errors } from "@/lib/i18n/messages/errors";
import { merchantSettings } from "@/lib/i18n/messages/merchant-settings";
import { portal } from "@/lib/i18n/messages/portal";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { RetryButton } from "./retry-button";

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: ApiError };

const SIGNED_OUT = new Set(["UNAUTHORIZED", "ACCOUNT_SUSPENDED", "IP_NOT_ALLOWED"]);

/**
 * Runs an API read. Returns `{ ok: false, error }` for an API error so the page can show it; a signed-out answer
 * (401, suspended, blocked IP) sends the visitor to the merchant sign-in; anything that is not an ApiError is a bug
 * and is rethrown (the route's error page catches it).
 */
export async function settle<T>(locale: Locale, read: () => Promise<T>): Promise<Loaded<T>> {
  let failure: ApiError;
  try {
    return { ok: true, data: await read() };
  } catch (error) {
    if (!isApiError(error)) throw error;
    failure = error;
  }
  if (failure.status === 401 || SIGNED_OUT.has(failure.code)) redirect(`${localePath(locale, "/sign-in")}?as=merchant`);
  return { ok: false, error: failure };
}

/** "Available after approval": what a pending merchant sees on pages that need an approved account. */
export function PendingNotice({ locale }: { locale: Locale }) {
  return (
    <Card>
      <EmptyState
        icon={<Clock aria-hidden="true" />}
        title={merchantSettings[locale].pendingTitle}
        description={portal[locale].pending.unavailable}
      />
    </Card>
  );
}

/** The card shown when a read failed. A pending-approval answer shows the notice instead. */
export function LoadError({ error, locale }: { error: ApiError; locale: Locale }) {
  if (error.code === "ACCOUNT_PENDING_APPROVAL") return <PendingNotice locale={locale} />;
  const codes = errors[locale].codes as Record<string, string>;
  const t = common[locale];
  return (
    <Card>
      <ErrorState
        title={t.states.errorTitle}
        message={codes[error.code] ?? codes.fallback}
        reference={error.requestId ? fmt(errors[locale].requestId, { id: error.requestId }) : undefined}
        action={<RetryButton label={t.actions.retry} />}
      />
    </Card>
  );
}
