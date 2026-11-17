"use client";
// Toast: short confirmations ("Saved") that fade out by themselves. Mount <Toaster /> once in a layout; call
// `toast.success("Saved")` from any Client Component or event handler. Announced politely to screen readers.
// A toast may carry one link (`action`, for example "View" on a live notification).
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { buttonClasses } from "./button";
import { useUiText } from "./ui-text";

export type ToastTone = "info" | "success" | "warning" | "danger";

export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before it disappears (default 5000; 8000 for danger). */
  duration?: number;
  /** One link under the text (a site path or URL; the toast goes away when it is followed). */
  action?: { label: string; href: string };
};

type ToastItem = Required<Pick<ToastInput, "title" | "tone">> &
  Pick<ToastInput, "action"> & { id: number; description?: string };

let items: ToastItem[] = [];
let counter = 0;
const listeners = new Set<() => void>();
const EMPTY: ToastItem[] = [];

function emit() {
  for (const listener of listeners) listener();
}

/** Removes a toast by the id `toast()` returned. */
export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

/** Shows a toast and returns its id. Client-side only. */
export function toast({ title, description, tone = "info", duration, action }: ToastInput): number {
  const id = ++counter;
  items = [...items.slice(-3), { id, title, description, tone, action }];
  emit();
  setTimeout(() => dismissToast(id), duration ?? (tone === "danger" ? 8000 : 5000));
  return id;
}
toast.success = (title: string, description?: string) => toast({ title, description, tone: "success" });
toast.error = (title: string, description?: string) => toast({ title, description, tone: "danger" });
toast.info = (title: string, description?: string) => toast({ title, description, tone: "info" });
toast.warning = (title: string, description?: string) => toast({ title, description, tone: "warning" });

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const icons = {
  info: <Info aria-hidden="true" className="text-ink-muted" />,
  success: <CircleCheck aria-hidden="true" className="text-success" />,
  warning: <TriangleAlert aria-hidden="true" className="text-warning" />,
  danger: <CircleAlert aria-hidden="true" className="text-danger" />,
} as const;

/**
 * The live region that renders toasts, fixed to the bottom end corner. Mount once per layout. `toaster`: below `lg` the
 * workspace lifts it above its phone tab bar (globals.css "Workspace tab bar room").
 */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => EMPTY);
  const text = useUiText();
  return (
    <div
      aria-live="polite"
      className="toaster pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:end-6 sm:bottom-6 sm:w-96"
    >
      {list.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex animate-toast-in items-start gap-3 rounded-card border border-line bg-surface p-4 shadow-overlay",
            "[&>svg]:mt-0.5 [&>svg]:size-5 [&>svg]:shrink-0",
          )}
        >
          {icons[t.tone]}
          <div className="min-w-0 flex-1">
            <div>
              <p className="break-words text-body font-semibold text-ink">{t.title}</p>
              {t.description ? <p className="mt-0.5 break-words text-small text-ink-muted">{t.description}</p> : null}
            </div>
            {t.action ? (
              <Link
                href={t.action.href}
                onClick={() => dismissToast(t.id)}
                className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-3" })}
              >
                {t.action.label}
              </Link>
            ) : null}
          </div>
          <button
            type="button"
            aria-label={text.dismiss}
            onClick={() => dismissToast(t.id)}
            className="relative -me-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-control text-ink-subtle hover:bg-surface-sunken hover:text-ink after:absolute after:-inset-1.5 after:content-['']"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
