// The top of the overview, the same for every account: the greeting with the account's rank beside it, then what the rank
// does first (a retail account browses the shop, a merchant rank places an order). Server component.
import type { ReactNode } from "react";
import { rankKindOf } from "@/lib/account/family";
import type { AccountMe } from "@/lib/api/types";
import { PageHeader } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { welcomeTitle } from "./welcome";

/** The rank's name as a small label. A merchant rank is drawn darker than a retail one; the name carries the meaning. */
export function RankChip({ me }: { me: Pick<AccountMe, "rank"> }) {
  return <Badge tone={rankKindOf(me) === "merchant" ? "inverse" : "neutral"}>{me.rank.name}</Badge>;
}

export function OverviewHeader({ me, description, actions }: { me: AccountMe; description?: ReactNode; actions?: ReactNode }) {
  return (
    <PageHeader
      variant="card"
      eyebrow={<RankChip me={me} />}
      title={welcomeTitle(me)}
      description={description}
      actions={actions}
    />
  );
}
