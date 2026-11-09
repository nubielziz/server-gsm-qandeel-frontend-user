// A failed load, shown inside the page (the frame stays): a pending merchant gets the "opens after approval" notice,
// everything else an ErrorState with the request reference. Signed-out errors redirect; a missing record 404s.
import { PageHeader } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { errorText } from "@/lib/i18n/error-text-core";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { errors } from "@/lib/i18n/messages/errors";
import { merchant } from "@/lib/i18n/messages/merchant";
import { isPendingApproval, routeOnError } from "@/lib/merchant/load";
import { PendingNotice } from "./pending-notice";
import { RetryButton } from "./retry-button";

/** `title`: the page heading to show above the message, for detail pages whose whole content is behind <Suspense>. */
export async function PageError({ error, next, notFoundOn404, title }: { error: unknown; next: string; notFoundOn404?: boolean; title?: string }) {
  const locale = await getLocale();
  routeOnError(error, locale, { next, notFoundOn404 });
  if (isPendingApproval(error)) return <PendingNotice title={title} />;
  const t = await getMessages(merchant);
  const e = errorText(errors[locale]);
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
