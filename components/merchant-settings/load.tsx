// Server-side loading helpers for the settings pages: a failed API read becomes a calm error card (with the request
// reference), never a crashed page.
import { isApiError, type ApiError } from "@/lib/api/errors";
import { fmt } from "@/lib/i18n/define";
import { common } from "@/lib/i18n/messages/common";
import { errors } from "@/lib/i18n/messages/errors";
import { routeOnError } from "@/lib/merchant/load";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { RetryButton } from "./retry-button";

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/**
 * Runs an API read. Returns `{ ok: false, error }` for an API error so the page can show it; a signed-out answer (401,
 * suspended, blocked IP) sends the visitor to the sign-in page (back to `next` when given) and a rank refusal (the
 * account's rank does not have the page) sends it to the account home (lib/merchant/load.ts). Anything that is not an
 * ApiError is a bug and is rethrown (the route's error page catches it).
 */
export async function settle<T>(read: () => Promise<T>, next?: string): Promise<Loaded<T>> {
  let failure: ApiError;
  try {
    return { ok: true, data: await read() };
  } catch (error) {
    if (!isApiError(error)) throw error;
    failure = error;
  }
  routeOnError(failure, { next });
  return { ok: false, error: failure };
}

/** The card shown when a read failed. */
export function LoadError({ error }: { error: ApiError }) {
  const codes = errors.codes as Record<string, string>;
  const t = common;
  return (
    <Card>
      <ErrorState
        title={t.states.errorTitle}
        message={codes[error.code] ?? codes.fallback}
        reference={error.requestId ? fmt(errors.requestId, { id: error.requestId }) : undefined}
        action={<RetryButton label={t.actions.retry} />}
      />
    </Card>
  );
}
