// The notice a merchant rank gets in place of the shop checkout: the shop sells at retail prices and takes payment first, while a
// merchant rank orders from its price list at its own price. One card for both places that show it: the opening page, which
// never mounts the form for such an account, and the form itself when the API still answers 403 RANK_NOT_ALLOWED to the
// session (the rank changed after the page loaded). No hooks and no reads, so it renders on the server and in the form.
import { ClipboardList } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { CheckoutMessages } from "@/lib/i18n/messages/checkout";

export type PriceListCardProps = {
  /** `checkout.start.priceList`. */
  labels: CheckoutMessages["start"]["priceList"];
  /** The service's page in the account's price list (`priceListHref`): where the order is placed. */
  priceListHref: string;
  /** The service's page in the shop: the way back. */
  serviceHref: string;
};

/** "The shop checkout is for retail buyers", with the way to order at the account's own price and the way back. */
export function PriceListCard({ labels, priceListHref, serviceHref }: PriceListCardProps) {
  return (
    <Card>
      <EmptyState
        icon={<ClipboardList aria-hidden="true" />}
        title={labels.title}
        description={labels.text}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href={priceListHref}>{labels.action}</ButtonLink>
            <ButtonLink href={serviceHref} variant="secondary">
              {labels.back}
            </ButtonLink>
          </div>
        }
      />
    </Card>
  );
}
