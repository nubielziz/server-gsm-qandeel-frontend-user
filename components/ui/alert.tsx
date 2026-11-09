// Alert (callout): an inline message with a tone: info, success, warning or danger.
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

const tones: Record<AlertTone, { box: string; icon: ReactNode }> = {
  info: { box: "border-line bg-surface-muted text-ink", icon: <Info aria-hidden="true" /> },
  success: { box: "border-success/25 bg-success-soft text-success-ink", icon: <CircleCheck aria-hidden="true" /> },
  warning: { box: "border-warning/35 bg-warning-soft text-warning-ink", icon: <TriangleAlert aria-hidden="true" /> },
  danger: { box: "border-danger/25 bg-danger-soft text-danger-ink", icon: <CircleAlert aria-hidden="true" /> },
};

export type AlertProps = Omit<ComponentProps<"div">, "title"> & {
  tone?: AlertTone;
  /** Bold first line. */
  title?: ReactNode;
  /** Replaces the tone's icon. */
  icon?: ReactNode;
  /** A button or link on the end side (or under the text on narrow screens). */
  action?: ReactNode;
};

/** A callout. `danger` and `warning` are announced immediately (`role="alert"`), the others politely (`role="status"`). */
export function Alert({ tone = "info", title, icon, action, className, children, role, ...props }: AlertProps) {
  const urgent = tone === "danger" || tone === "warning";
  return (
    <div
      role={role ?? (urgent ? "alert" : "status")}
      className={cn("flex items-start gap-3 rounded-card border px-4 py-3.5", tones[tone].box, className)}
      {...props}
    >
      <span className="mt-0.5 shrink-0 [&_svg]:size-5">{icon ?? tones[tone].icon}</span>
      <div className="min-w-0 flex-1 text-body">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", tone === "info" ? "text-ink-muted" : "")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}
