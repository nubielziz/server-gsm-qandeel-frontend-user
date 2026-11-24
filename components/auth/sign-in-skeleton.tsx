// The same-size placeholder of the sign-in form while the query string (`?next=`, `?token=`) is read in the browser.
// Server-compatible. Heights follow the real password form (the two fields and the Turnstile box, the submit button, the
// divider, the two secondary buttons and the "create account" line), so nothing jumps when it replaces this.
import { Skeleton } from "@/components/ui/skeleton";

function FieldSkeleton() {
  return (
    <div className="grid gap-1.5">
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className="h-11 rounded-control" />
    </div>
  );
}

export function SignInSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-6">
      <div className="grid gap-5">
        <FieldSkeleton />
        <div>
          <FieldSkeleton />
          <div className="flex min-h-11 justify-end">
            <Skeleton className="mt-3 h-3.5 w-32" />
          </div>
        </div>
        <Skeleton className="h-[65px] rounded-control" />
        <Skeleton className="h-12 rounded-control" />
      </div>
      <Skeleton className="h-5" />
      <div className="grid gap-3">
        <Skeleton className="h-11 rounded-control" />
        <Skeleton className="h-11 rounded-control" />
      </div>
      <Skeleton className="mx-auto h-11 w-64" />
    </div>
  );
}
