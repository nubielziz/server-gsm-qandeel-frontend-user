// A same-size placeholder for an auth form that reads the query string in the browser. Server-compatible.
import { Skeleton } from "@/components/ui/skeleton";

/** `fields` label+input pairs (each 70px tall like a real field with its label), then a 48px submit button. */
export function FormSkeleton({ fields = 2, hint = false }: { fields?: number; hint?: boolean }) {
  return (
    <div aria-busy="true" className="grid gap-5">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="grid gap-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-11 rounded-control" />
          {hint && i === 0 ? <Skeleton className="h-4 w-3/4" /> : null}
        </div>
      ))}
      <Skeleton className="h-12 rounded-control" />
    </div>
  );
}
