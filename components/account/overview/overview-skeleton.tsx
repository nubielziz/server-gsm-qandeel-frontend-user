// The overview while the account is read: the same boxes as the loaded page, so nothing jumps when it streams in. The shape
// is the retail one (a list beside a column of cards); a merchant rank's page fills the same area.
import { Skeleton } from "@/components/ui/skeleton";

export function OverviewSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-4">
      <Skeleton className="h-[5.5rem] rounded-card" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-96 rounded-card" />
        <div className="grid content-start gap-4">
          <Skeleton className="h-80 rounded-card" />
          <Skeleton className="h-56 rounded-card" />
        </div>
      </div>
    </div>
  );
}
