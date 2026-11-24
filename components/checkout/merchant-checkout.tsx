// The checkout of an account of a merchant rank (decision 003): the same address as every buyer's (`/checkout?service=<slug>`),
// with the account's own order form in place of the shop's. The order is placed with `POST /client/orders` and paid from the
// account's wallet (the price is held at once and settled on delivery), at the account's own price, read here from
// `GET /client/services/:id` (the API remembers that price for the price-change guard of the order). Single orders, a list of
// IMEIs, custom fields and file services all work as they did. No checkout session is ever created for such an account: the
// API keeps refusing the shop checkout to a merchant rank, and no money rule changes. Personal: rendered per request inside the
// page's account boundary, never cached or prefetched.
import { PackageSearch } from "lucide-react";
import { PageHeader } from "@/components/layout/container";
import { OrderForm } from "@/components/merchant/order-form";
import { PageError } from "@/components/merchant/page-error";
import { ServiceAbout } from "@/components/merchant/service-about";
import { TypeBadge } from "@/components/merchant/type-badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { readAccountWallet } from "@/lib/account/wallet-read";
import { isApiError } from "@/lib/api/errors";
import { apiSessionGet } from "@/lib/api/server";
import type { MerchantServiceDetail } from "@/lib/api/types";
import { checkout } from "@/lib/i18n/messages/checkout";
import { common } from "@/lib/i18n/messages/common";
import { merchant } from "@/lib/i18n/messages/merchant";
import { settle } from "@/lib/merchant/load";
import { orderFormHrefs } from "@/lib/merchant/order-input";

export type MerchantCheckoutProps = {
  /** The service of the checkout (its id is the same in the shop and in the account's catalog). */
  serviceId: number;
  /** This checkout's address, where the sign-in page comes back to. */
  next: string;
  /** The service's page in the shop: the way back from a service the account may not order. */
  serviceHref: string;
};

/**
 * The account's own order form for one service, with the service's details at the account's price and the wallet's spendable
 * balance. A service the account may not order (404) says so and leads back to its page; a signed-out session goes to sign-in
 * and any other failure shows the error with its reference (`PageError`).
 *
 * @see app/en/(checkout)/checkout/page.tsx
 */
export async function MerchantCheckout({ serviceId, next, serviceHref }: MerchantCheckoutProps) {
  const t = merchant;
  const c = common;
  // The wallet is the request's one shared read (the header's balance reads the same one).
  const [service, wallet] = await Promise.all([
    settle(apiSessionGet<MerchantServiceDetail>(`${FAMILY_ROUTES.client.services}/${serviceId}`)),
    readAccountWallet(),
  ]);
  if (!service.ok) {
    if (isApiError(service.error) && service.error.status === 404) {
      const u = checkout.start.merchantUnavailable;
      return (
        <Card>
          <EmptyState
            icon={<PackageSearch aria-hidden="true" />}
            title={u.title}
            description={u.text}
            action={
              <ButtonLink href={serviceHref} variant="secondary">
                {checkout.start.priceList.back}
              </ButtonLink>
            }
          />
        </Card>
      );
    }
    return <PageError error={service.error} next={next} />;
  }
  const s = service.data;
  const available = wallet?.kind === "merchant" && wallet.read.ok ? wallet.read.data.available : null;

  return (
    <div className="grid gap-6">
      <PageHeader
        variant="card"
        title={s.name}
        description={
          <>
            <bdi dir="ltr">{s.code}</bdi> · {s.category.name}
          </>
        }
        actions={<TypeBadge type={s.type} t={c} />}
      />
      <OrderForm
        service={{
          id: s.id,
          name: s.name,
          type: s.type,
          price: s.price,
          currency: s.currency,
          minQty: s.minQty,
          maxQty: s.maxQty,
          qtyOptions: s.qtyOptions,
          fields: s.fields,
        }}
        available={available}
        hrefs={orderFormHrefs()}
        labels={{ form: t.form, summary: t.summary, errors: t.orderErrors, placed: t.placed, quantity: c.quantity }}
        intro={<ServiceAbout service={s} t={t} c={c} />}
      />
    </div>
  );
}
