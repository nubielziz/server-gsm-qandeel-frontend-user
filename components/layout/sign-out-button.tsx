"use client";
// SignOutButton: ends the merchant or the customer session (they are separate, handoff §3.4), then refreshes the route
// so every server-rendered part (header, protected pages) sees the signed-out state. A 401 counts as success.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { api, forgetCsrf } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/spinner";

export type SignOutSurface = "merchant" | "customer";

const ENDPOINTS = { merchant: "/client/auth/logout", customer: "/store/v1/auth/logout" } as const;

export type SignOutButtonProps = {
  /** Which session to end. */
  surface: SignOutSurface;
  /** Text, e.g. "Sign out". */
  label: string;
  /** Text while the request runs, e.g. "Signing out…". */
  pendingLabel: string;
  /** `menu` = a row for a Menu panel (default); `plain` = a bordered button. */
  variant?: "menu" | "plain";
  className?: string;
};

/** Signs out of one surface (POST, no body), then `router.refresh()`. */
export function SignOutButton({ surface, label, pendingLabel, variant = "menu", className }: SignOutButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await api.post(ENDPOINTS[surface]);
    } catch (error) {
      // 401 = the session was already gone: the goal (signed out) is reached.
      if (!(isApiError(error) && error.status === 401)) {
        setPending(false);
        return;
      }
    }
    forgetCsrf(surface === "merchant" ? "client" : "store");
    router.refresh();
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
          : "inline-flex h-11 items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-5 text-body font-semibold text-ink transition-colors hover:bg-surface-muted disabled:opacity-60",
        "[&_svg]:size-[18px] [&_svg]:shrink-0",
        variant === "menu" && "[&_svg]:text-ink-muted",
        className,
      )}
    >
      {pending ? <Spinner size={18} /> : <LogOut aria-hidden="true" className="rtl:-scale-x-100" />}
      {pending ? pendingLabel : label}
    </button>
  );
}
