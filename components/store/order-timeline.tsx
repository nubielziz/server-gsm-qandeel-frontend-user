// Order progress as a vertical timeline. The API's `message` is English only, so the label comes from the event `type`.
import { CircleCheck, CircleX, CreditCard, PackageCheck, RefreshCcw, RotateCcw, type LucideIcon } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { TrackedOrder } from "@/lib/api/types";
import { cn } from "@/lib/cn";

const icons: Record<TrackedOrder["timeline"][number]["type"], LucideIcon> = {
  created: PackageCheck,
  paid: CreditCard,
  accepted: CircleCheck,
  completed: CircleCheck,
  rejected: CircleX,
  refund: RotateCcw,
  reopened: RefreshCcw,
};

const tones: Record<TrackedOrder["timeline"][number]["type"], string> = {
  created: "bg-surface-sunken text-ink-muted",
  paid: "bg-surface-sunken text-ink-muted",
  accepted: "bg-warning-soft text-warning-ink",
  completed: "bg-success-soft text-success-ink",
  rejected: "bg-danger-soft text-danger-ink",
  refund: "bg-surface-sunken text-ink-muted",
  reopened: "bg-warning-soft text-warning-ink",
};

export function OrderTimeline({
  events,
  labels,
}: {
  events: TrackedOrder["timeline"];
  labels: Record<TrackedOrder["timeline"][number]["type"], string>;
}) {
  return (
    <ol className="grid">
      {events.map((event, i) => {
        const Icon = icons[event.type] ?? PackageCheck;
        const last = i === events.length - 1;
        return (
          <li key={`${event.type}-${event.createdAt}-${i}`} className="relative flex gap-4 pb-6 last:pb-0">
            {last ? null : <span aria-hidden="true" className="absolute inset-y-9 start-[1.0625rem] w-px bg-line-strong" />}
            <span className={cn("relative grid size-9 shrink-0 place-items-center rounded-full", tones[event.type] ?? tones.created)}>
              <Icon aria-hidden="true" className="size-[18px]" />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-body font-semibold text-ink">{labels[event.type] ?? event.message}</p>
              <p className="text-small text-ink-subtle">{formatDateTime(event.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
