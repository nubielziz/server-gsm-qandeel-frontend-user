// The service type as a small outlined tag (IMEI check, Server credits …).
import { Badge } from "@/components/ui/badge";
import type { CommonMessages } from "@/lib/i18n/messages/common";

export function TypeBadge({ type, t }: { type: string; t: CommonMessages }) {
  const labels = t.serviceType as Record<string, string>;
  return (
    <Badge tone="outline" shape="tag">
      {labels[type] ?? type}
    </Badge>
  );
}
