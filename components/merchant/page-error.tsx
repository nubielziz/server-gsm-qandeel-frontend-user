// A failed load, shown inside the page (the frame stays): an ErrorState with the request reference. Signed-out errors
// redirect, a rank refusal goes to the account home and a missing record 404s (lib/merchant/load.ts).
import { PageHeader } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { errorText } from "@/lib/i18n/error-text-core";
import { errors } from "@/lib/i18n/messages/errors";
import { merchant } from "@/lib/i18n/messages/merchant";
import { routeOnError } from "@/lib/merchant/load";
import { RetryButton } from "./retry-button";

/** `title`: the page heading to show above the message, for detail pages whose whole content is behind <Suspense>. */
export function PageError({
  error,
  next,
  notFoundOn404,
  title,
}: {
  error: unknown;
  next: string;
  notFoundOn404?: boolean;
  title?: string;
}) {
  routeOnError(error, { next, notFoundOn404 });
  const t = merchant;
  const e = errorText(errors);
  const body = (
    <Card>
      <ErrorState
        title={t.shared.loadErrorTitle}
        message={e.message(error)}
        reference={e.reference(error)}
        action={<RetryButton label={t.shared.retry} />}
      />
    </Card>
  );
  return title ? (
    <div className="grid gap-6">
      <PageHeader title={title} />
      {body}
    </div>
  ) : (
    body
  );
}
