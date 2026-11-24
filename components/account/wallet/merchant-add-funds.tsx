// Add funds of a merchant rank: the payment methods of the account's group (their limits follow the rank, so they are personal and
// never cached) and the form that creates an invoice (`TopUpForm`, components/merchant). A manual method goes on to the invoice
// page, an online one to the payment provider.
// `MerchantAddFundsView` reads the methods and sends a signed-out or rank-refused answer where it belongs; `MerchantAddFundsBody`
// draws what was read. Read at request time, behind <Suspense>.
import { Landmark } from "lucide-react";
import { apiSessionGet } from "@/lib/api/server";
import type { PaymentMethod } from "@/lib/api/types";
import { topUps } from "@/lib/i18n/messages/top-ups";
import { routeOnError, settle, type Settled } from "@/lib/merchant/load";
import { sitePath } from "@/lib/site-path";
import { WalletLoadError } from "@/components/account/wallet/wallet-parts";
import { TopUpForm } from "@/components/merchant/top-up-form";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

/** The Add funds page of a merchant rank, from the methods that were read. */
export function MerchantAddFundsBody({ methods }: { methods: Settled<PaymentMethod[]> }) {
  const t = topUps;
  const m = t.merchant.add;
  if (!methods.ok) {
    return (
      <Card>
        <WalletLoadError error={methods.error} title={t.add.loadTitle} retry={t.add.retry} />
      </Card>
    );
  }
  if (methods.data.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Landmark aria-hidden="true" />}
          title={m.emptyTitle}
          description={m.emptyText}
          action={<ButtonLink href={sitePath("/help")}>{m.emptyAction}</ButtonLink>}
        />
      </Card>
    );
  }
  return <TopUpForm methods={methods.data} invoiceBase={sitePath("/account/invoices")} labels={m} />;
}

/** The Add funds page of a merchant rank. */
export async function MerchantAddFundsView() {
  const methods = await settle(apiSessionGet<PaymentMethod[]>("/client/payment-methods"));
  if (!methods.ok) routeOnError(methods.error, { next: sitePath("/account/wallet/add-funds") });
  return <MerchantAddFundsBody methods={methods} />;
}
