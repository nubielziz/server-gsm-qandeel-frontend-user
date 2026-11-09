// Same-size placeholders for the settings pages while their data streams in (no layout shift).
import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** A card with a title bar and `rows` form-field-sized blocks. */
export function CardSkeleton({ rows = 4, footer = true }: { rows?: number; footer?: boolean }) {
  return (
    <Card aria-busy="true">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </div>
      <CardBody className="grid gap-5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="grid gap-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-11" />
          </div>
        ))}
      </CardBody>
      {footer ? <div className="h-[4.5rem] rounded-b-card border-t border-line bg-surface-muted" /> : null}
    </Card>
  );
}

/** A page header plus a list of `rows` cards (API keys, webhooks, commissions). */
export function ListSkeleton({ rows = 3, rowHeight = "h-40" }: { rows?: number; rowHeight?: string }) {
  return (
    <div className="grid gap-4" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={`${rowHeight} rounded-card`} />
      ))}
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="flex min-h-[4.5rem] items-center justify-between gap-6 rounded-card border border-line bg-surface px-5 py-4 shadow-card sm:px-6">
      <div className="grid gap-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <Skeleton className="h-11 w-36 rounded-control" />
    </div>
  );
}
