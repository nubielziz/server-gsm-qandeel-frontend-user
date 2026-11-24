// Add funds of a retail rank: the customer picks a payment method and an amount (`TopUpForm`), which creates a keyed top-up.
// `RetailAddFundsView` reads the payment methods and sends a signed-out or rank-refused answer where it belongs;
// `RetailAddFundsBody` draws what was read. Personal and never cached: read at request time, behind <Suspense>.
// - Switched off (`enabled: false`) or no method (the API answers `[]` while the balance is off): an explanation and a way back.
// - A balance on hold: online methods are not offered (a bank transfer still works, BH §3.3).
// - No top-up left today, or no room left in the wallet: a notice says why; the form still checks and explains.
// A failed read shows the request reference.
import { Landmark, Wallet } from "lucide-react";
import { apiSessionGet } from "@/lib/api/server";
import type { CustomerWallet, TopUpMethod } from "@/lib/api/types";
import { topUps } from "@/lib/i18n/messages/top-ups";
import { routeOnError, settle, type Settled } from "@/lib/merchant/load";
import { sitePath } from "@/lib/site-path";
import { isNoLimit } from "@/lib/wallet/top-up-errors";
import { walletCapabilities } from "@/lib/wallet/view";
import { WalletLoadError } from "@/components/account/wallet/wallet-parts";
import { TopUpForm } from "@/components/wallet/top-up-form";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export type RetailAddFundsBodyProps = {
  wallet: CustomerWallet;
  methods: Settled<TopUpMethod[]>;
};

/** The Add funds page of a retail rank, from what was read. */
export function RetailAddFundsBody({ wallet, methods: methodsRead }: RetailAddFundsBodyProps) {
  const t = topUps;
  const caps = walletCapabilities(wallet);
  const back = (
    <ButtonLink href={sitePath("/account/wallet")} variant="secondary">
      {t.backToWallet}
    </ButtonLink>
  );

  // Switched off: nothing can be added (the methods list is empty too). A balance already there is kept.
  if (!caps.canAddFunds) {
    return (
      <Card>
        <EmptyState
          icon={<Wallet aria-hidden="true" />}
          title={t.add.disabledTitle}
          description={t.add.disabledText}
          action={back}
        />
      </Card>
    );
  }

  if (!methodsRead.ok) {
    return (
      <Card>
        <WalletLoadError error={methodsRead.error} title={t.add.loadTitle} retry={t.add.retry} />
      </Card>
    );
  }
  const methods = methodsRead.data;
  if (methods.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Landmark aria-hidden="true" />}
          title={t.add.noMethodsTitle}
          description={t.add.noMethodsText}
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <ButtonLink href={sitePath("/support")}>{t.add.contact}</ButtonLink>
              {back}
            </div>
          }
        />
      </Card>
    );
  }

  const limits = wallet.limits;
  return (
    <div className="grid gap-6">
      {caps.frozen ? (
        <Alert tone="warning" title={t.add.frozenTitle}>
          {t.add.frozenText}
        </Alert>
      ) : null}
      {limits.topUpsLeftToday <= 0 ? (
        <Alert tone="warning" title={t.add.noTopUpsTitle}>
          {t.add.noTopUpsText}
        </Alert>
      ) : isNoLimit(limits.room) ? (
        <Alert tone="warning" title={t.add.noRoomTitle}>
          {t.add.noRoomText}
        </Alert>
      ) : null}
      <TopUpForm
        methods={methods}
        limits={limits}
        frozen={caps.frozen}
        detailBase={sitePath("/account/wallet/top-ups")}
        labels={t.form}
        errors={t.errors}
      />
    </div>
  );
}

/** The Add funds page of a retail rank. `read` is the wallet the page already read (`readAccountWallet`); the methods are read here. */
export async function RetailAddFundsView({ read }: { read: Settled<CustomerWallet> }) {
  const t = topUps;
  const here = sitePath("/account/wallet/add-funds");
  // A switched-off wallet answers an empty list: the methods are asked for anyway, as the page always did.
  const methods = await settle(apiSessionGet<TopUpMethod[]>("/store/v1/me/wallet/top-up-methods"));

  if (!read.ok) {
    routeOnError(read.error, { next: here });
    return (
      <Card>
        <WalletLoadError error={read.error} title={t.add.loadTitle} retry={t.add.retry} />
      </Card>
    );
  }
  if (!methods.ok && walletCapabilities(read.data).canAddFunds) routeOnError(methods.error, { next: here });
  return <RetailAddFundsBody wallet={read.data} methods={methods} />;
}
