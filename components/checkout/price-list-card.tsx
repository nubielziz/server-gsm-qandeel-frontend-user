// The notice an account of a merchant rank gets where the shop's own checkout cannot serve it: the shop sells at retail prices
// and takes payment first, while a merchant rank orders at its own price, paid from its wallet, through its order form at the
// service's checkout address (decision 003). Two places show it: an open checkout (`/checkout/<token>`) that was started before
// the browser was signed in to such an account, and the retail form when the API still answers 403 RANK_NOT_ALLOWED to the
// session (the rank changed after the page loaded). No hooks and no reads, so it renders on the server and in the form.
import { ClipboardList } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { CheckoutMessages } from "@/lib/i18n/messages/checkout";

export type PriceListCardProps = {
  /** `checkout.start.priceList`. */
  labels: CheckoutMessages["start"]["priceList"];
  /** The service's checkout address (`checkoutHref`), where the account's own order form opens; null when the service has no shop page. */
  orderHref: string | null;
  /** The service's page in the shop (the service list when it has none): the way back. */
  serviceHref: string;
};

/** "The shop checkout is for retail buyers", with the way to order at the account's own price and the way back. */
export function PriceListCard({ labels, orderHref, serviceHref }: PriceListCardProps) {
  return (
    <Card>
      <EmptyState
        icon={<ClipboardList aria-hidden="true" />}
        title={labels.title}
        description={labels.text}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            {orderHref ? <ButtonLink href={orderHref}>{labels.action}</ButtonLink> : null}
            <ButtonLink href={serviceHref} variant="secondary">
              {labels.back}
            </ButtonLink>
          </div>
        }
      />
    </Card>
  );
}
