// Loading placeholders with the size of the real content, so nothing jumps when the data streams in.
import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Filter row + table card: `rows` rows of about 57px (the height of a real table row). */
export function ListSkeleton({ rows = 8, toolbar = true }: { rows?: number; toolbar?: boolean }) {
  return (
    <div className="grid gap-4" aria-hidden="true">
      {toolbar ? (
        <div className="flex flex-wrap items-end gap-3">
          <Skeleton className="h-11 w-full sm:w-72" />
          <Skeleton className="h-11 w-36" />
          <Skeleton className="h-11 w-28" />
        </div>
      ) : null}
      <Card>
        <div className="h-11 border-b border-line bg-surface-muted" />
        <div className="divide-y divide-line">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex h-[3.5625rem] items-center gap-6 px-5">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="hidden h-4 w-1/6 sm:block" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="ms-auto h-4 w-20" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/** A heading + a few description rows, for detail cards. */
export function DetailSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Card aria-hidden="true">
      <CardBody className="grid gap-4">
        <Skeleton className="h-6 w-48" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-6">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-36" />
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

export function StatsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i}>
          <div className="flex items-start gap-4 p-5">
            <Skeleton className="size-12 rounded-card" />
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-20" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="grid gap-4" aria-hidden="true">
      <Skeleton className="h-[5.5rem] rounded-card" />
      <div className="grid gap-4 xl:grid-cols-12">
        <Skeleton className="h-60 rounded-panel xl:col-span-5" />
        <div className="grid gap-4 sm:grid-cols-2 xl:col-span-7">
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-28 rounded-card" />
        </div>
      </div>
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}
