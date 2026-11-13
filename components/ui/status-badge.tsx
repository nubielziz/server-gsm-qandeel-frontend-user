// StatusBadge: the pill that shows the state of an order, invoice, ticket, account … with a tone and an icon.
// Pure (no hooks, no messages): pass the translated `label` (see `statusLabel` in lib/i18n/messages/common.ts).
import { Ban, CircleCheck, CircleDashed, CircleDot, CircleX, Clock, type LucideIcon } from "lucide-react";
import type { StatusKind } from "@/lib/i18n/messages/common";
import { Badge, type BadgeProps, type BadgeTone } from "./badge";

export type { StatusKind };

/** Tone of every known status, by kind. Green = done/paid, amber = in progress/unpaid, grey = waiting/inactive, red = failed. */
const tones: { [K in StatusKind]: Record<string, BadgeTone> } = {
  order: { pending: "neutral", processing: "warning", completed: "success", rejected: "danger" },
  invoice: { open: "warning", paid: "success", void: "neutral" },
  ticket: { new: "inverse", open: "warning", pending: "neutral", resolved: "success" },
  account: { pending: "warning", active: "success", suspended: "danger" },
  kyc: { none: "neutral", pending: "warning", approved: "success", rejected: "danger" },
  delivery: { pending: "neutral", succeeded: "success", failed: "danger" },
  checkout: { open: "warning", paid: "success", expired: "neutral" },
  request: { open: "neutral", in_progress: "warning", completed: "success", rejected: "danger" },
  verification: { verified: "success", unverified: "warning" },
  topUp: { awaiting_payment: "warning", in_review: "warning", credited: "success", rejected: "danger", cancelled: "neutral" },
};

const toneIcons: Record<BadgeTone, LucideIcon> = {
  success: CircleCheck,
  warning: CircleDashed,
  neutral: Clock,
  danger: CircleX,
  inverse: CircleDot,
  outline: CircleDot,
};

/** The tone of a status (`neutral` for an unknown value): `statusTone("order", "completed")` → `"success"`. */
export function statusTone(kind: StatusKind, status: string): BadgeTone {
  return tones[kind][status] ?? "neutral";
}

function humanize(status: string): string {
  const spaced = status.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export type StatusBadgeProps = Omit<BadgeProps, "tone" | "icon" | "children"> & {
  /** The status family: `order`, `invoice`, `ticket`, `account`, `kyc`, `delivery`, `checkout`, `request`, `verification`, `topUp`. */
  kind: StatusKind;
  /** The raw API value, e.g. `completed`, `open`, `in_progress`. */
  status: string;
  /** Translated text. Pass `statusLabel(t, kind, status)`; falls back to the humanized raw value. */
  label?: string;
  /** Hides the icon. */
  noIcon?: boolean;
};

/** A status pill: `<StatusBadge kind="order" status={o.status} label={statusLabel(t, "order", o.status)} />`. */
export function StatusBadge({ kind, status, label, noIcon, ...props }: StatusBadgeProps) {
  const tone = statusTone(kind, status);
  const Icon = kind === "invoice" && status === "void" ? Ban : toneIcons[tone];
  return (
    <Badge tone={tone} icon={noIcon ? undefined : <Icon aria-hidden="true" />} {...props}>
      {label ?? humanize(status)}
    </Badge>
  );
}
