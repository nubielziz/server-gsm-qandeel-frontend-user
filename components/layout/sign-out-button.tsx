"use client";
// SignOutButton: ends the session of the signed-in account (one session, one sign-out route for every rank), then refreshes
// the route so every server-rendered part (header, protected pages) sees the signed-out state. A 401 counts as success.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { ACCOUNT_ROUTES } from "@/lib/account/routes";
import { api, forgetCsrf } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/spinner";

export type SignOutButtonProps = {
  /** Text, e.g. "Sign out". */
  label: string;
  /** Text while the request runs, e.g. "Signing out…". */
  pendingLabel: string;
  /** `menu` = a row for a Menu panel (default); `plain` = a bordered button. */
  variant?: "menu" | "plain";
  className?: string;
};

/**
 * Posts the sign-out route (no body) and forgets the remembered CSRF token. A 401 means the session was already gone, which
 * is the goal. Any other failure leaves the session and the token alone.
 *
 * @param post sends a POST to a path (the browser client's `api.post`)
 * @param forget clears the remembered token
 * @returns true when the visitor is signed out now
 */
export async function endSession(post: (path: string) => Promise<unknown>, forget: () => void): Promise<boolean> {
  try {
    await post(ACCOUNT_ROUTES.logout);
  } catch (error) {
    if (!(isApiError(error) && error.status === 401)) return false;
  }
  forget();
  return true;
}

/** Signs out of the account (POST, no body), then `router.refresh()`. */
export function SignOutButton({ label, pendingLabel, variant = "menu", className }: SignOutButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    const done = await endSession((path) => api.post(path), forgetCsrf);
    if (done) router.refresh();
    setPending(false);
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      aria-busy={pending || undefined}
      className={cn(
        variant === "menu"
          ? "flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-start text-body font-medium text-ink transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted disabled:opacity-60"
          : "btn-motion btn-lift-soft inline-flex h-11 items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-5 text-body font-semibold text-ink hover:border-ink disabled:opacity-60",
        "[&_svg]:size-[18px] [&_svg]:shrink-0",
        variant === "menu" && "[&_svg]:text-ink-muted",
        className,
      )}
    >
      {pending ? <Spinner size={18} /> : <LogOut aria-hidden="true" />}
      {pending ? pendingLabel : label}
    </button>
  );
}
