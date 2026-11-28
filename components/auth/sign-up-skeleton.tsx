// The same-size placeholder of the sign-up form while the shop's countries are read. Server-compatible. Heights follow the real
// form: the two name fields side by side (stacked on phones), email, phone with its hint, country, password with its rules
// text, the Turnstile box and the submit button, so nothing jumps when the form replaces this.
import { Skeleton } from "@/components/ui/skeleton";

/** One label, one box and, when asked, the hint line under it. */
function FieldSkeleton({ hint = false }: { hint?: boolean }) {
  return (
    <div className="grid gap-1.5">
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className="h-11 rounded-control" />
      {hint ? <Skeleton className="h-4 w-3/4" /> : null}
    </div>
  );
}

export function SignUpSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-5">
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <FieldSkeleton />
        <FieldSkeleton />
      </div>
      <FieldSkeleton />
      <FieldSkeleton hint />
      <FieldSkeleton />
      <FieldSkeleton hint />
      <Skeleton className="h-[65px] rounded-control" />
      <Skeleton className="h-12 rounded-control" />
    </div>
  );
}

/**
 * The same-size placeholder of the "Become a merchant" form while the shop's countries are read: the two names side by side,
 * email, phone with its hint, country, the note that nothing is kept, the WhatsApp button and the line with the number.
 */
export function MerchantApplySkeleton() {
  return (
    <div aria-busy="true" className="grid gap-5">
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <FieldSkeleton />
        <FieldSkeleton />
      </div>
      <FieldSkeleton />
      <FieldSkeleton hint />
      <FieldSkeleton />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-12 rounded-control" />
      <Skeleton className="h-6 w-64" />
    </div>
  );
}
