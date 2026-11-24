// Parts the wallet pages of both ranks share: the loading skeletons and the notice of a failed read. Server components, no hooks.
// A failed read shows inside the page (the frame stays): a plain sentence, the request reference and a retry.
import { RetryButton } from "@/components/merchant/retry-button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { errorText } from "@/lib/i18n/error-text-core";
import { errors } from "@/lib/i18n/messages/errors";

/** The wallet page while its reads are on the way: the balance strip and the statement. */
export function WalletSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-36 rounded-panel" />
        <Skeleton className="h-36 rounded-card" />
        <Skeleton className="h-36 rounded-card" />
        <Skeleton className="h-36 rounded-card" />
      </div>
      <Skeleton className="h-[36rem] rounded-card" />
    </div>
  );
}

/** The Add funds page while its reads are on the way: the form and its summary. */
export function AddFundsSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="grid gap-6">
        <Skeleton className="h-64 rounded-card" />
        <Skeleton className="h-48 rounded-card" />
      </div>
      <Skeleton className="h-72 rounded-card" />
    </div>
  );
}

/** A failed read, with the request reference and a retry. `title` and `retry` are the page's own words. */
export function WalletLoadError({ error, title, retry }: { error: unknown; title: string; retry: string }) {
  const text = errorText(errors);
  return (
    <ErrorState
      title={title}
      message={text.message(error)}
      reference={text.reference(error)}
      action={<RetryButton label={retry} />}
    />
  );
}
