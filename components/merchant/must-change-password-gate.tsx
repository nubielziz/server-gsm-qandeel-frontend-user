"use client";
// A full merchant session can still carry `mustChangePassword` (staff gave a temporary password; BH §5.3, plan D5). That
// merchant must choose a new password before anything else:
// - on any other portal page the route is replaced with `/en/merchant/settings/security#must-change-password` (the
//   warning itself, so it is scrolled into view above the settings header), and the page's own content is not drawn
//   meanwhile (the layout still renders it on the server, the browser just does not show it);
// - on the security page the form is there and a warning above it says why.
// The form is the existing `POST /client/security/password`; after it succeeds it calls `router.refresh()`, the layout
// reads `me` again, the flag is gone and the gate lifts by itself. The layout passes `mustChange` from `me`.
import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";

export type MustChangeDecision =
  /** No flag: draw the page. */
  | "none"
  /** The merchant is on the security page: draw it, with the warning above. */
  | "warn"
  /** Any other page: go to the security page, draw only the warning meanwhile. */
  | "redirect";

/** The warning's element id: the redirect aims its `#hash` here so the warning is in view, not just the password card. */
export const MUST_CHANGE_ANCHOR = "must-change-password";

/** Where the gate sends the merchant: the security page, scrolled to the warning. */
export function mustChangeHref(securityPath: string): string {
  return `${securityPath}#${MUST_CHANGE_ANCHOR}`;
}

/** Same page? Ignores a trailing slash (the pathname never carries the `#hash` or the query). */
function samePath(a: string, b: string): boolean {
  const strip = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path);
  return strip(a) === strip(b);
}

/**
 * What the gate does on this page.
 *
 * @param pathname the current pathname (`/en/merchant/settings/security`)
 * @param securityPath the security page of the current language, without a hash
 */
export function mustChangeDecision({ mustChange, pathname, securityPath }: { mustChange: boolean; pathname: string | null; securityPath: string }): MustChangeDecision {
  if (!mustChange) return "none";
  return pathname !== null && samePath(pathname, securityPath) ? "warn" : "redirect";
}

type Props = {
  /** `me.mustChangePassword` of the signed-in merchant. */
  mustChange: boolean;
  /** `/en/merchant/settings/security` */
  securityPath: string;
  title: string;
  text: string;
  children: ReactNode;
};

export function MustChangePasswordGate({ mustChange, securityPath, title, text, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const decision = mustChangeDecision({ mustChange, pathname, securityPath });

  useEffect(() => {
    if (decision === "redirect") router.replace(mustChangeHref(securityPath));
  }, [decision, router, securityPath]);

  if (decision === "none") return <>{children}</>;
  return (
    <>
      <Alert id={MUST_CHANGE_ANCHOR} tone="warning" title={title} className="mb-4 scroll-mt-4">
        {text}
      </Alert>
      {decision === "warn" ? children : null}
    </>
  );
}
