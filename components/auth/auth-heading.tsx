// The title block of every auth page (the page's only `h1`), the heading of a step inside a form and the shared link style.
// Server-compatible.
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** `h1` + one line under it, as in the Sign-In mockup. */
export function AuthHeading({ title, subtitle, className }: { title: ReactNode; subtitle?: ReactNode; className?: string }) {
  return (
    <header className={cn("mb-8", className)}>
      <h1 className="text-title text-ink">{title}</h1>
      {subtitle ? <p className="mt-2 text-body text-ink-muted">{subtitle}</p> : null}
    </header>
  );
}

/** The heading of one step inside a form (a code, a new password, a sign-in link): an `h2` and one line under it. */
export function StepHeading({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h2 className="text-heading text-ink">{title}</h2>
      <p className="mt-1.5 text-body text-ink-muted">{text}</p>
    </div>
  );
}

/** Underlined text link with a 44px tall hit area (the style of the auth footer links). */
export const authLinkClass =
  "inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-4 decoration-1 hover:decoration-2";
