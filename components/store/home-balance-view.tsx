// The home page's balance box as a picture of one state (components/store/home-balance.tsx reads the state): the available
// wallet balance with the ways on, an invitation to sign in, or a signed-in account without a balance to show. No hooks and
// no reads, so a test can draw every state. Amounts are USD, like the wallets. Every account has the same addresses: the
// wallet, its Add funds page and the account home are pages of the one account area, whatever the rank.
import type { ReactNode } from "react";
import { Wallet } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import { store, type StoreMessages } from "@/lib/i18n/messages/store";
import { sitePath } from "@/lib/site-path";
import type { HomeBalance as HomeBalanceState } from "@/lib/wallet/home-balance";

type BalanceMessages = StoreMessages["home"]["balance"];

/** The box's shell: the same lit card, icon tile and heading in every state, so the hero row keeps its shape. */
function BalanceFrame({ title, text, children }: { title: string; text: ReactNode; children: ReactNode }) {
  return (
    <Card className="sheen-surface justify-center p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-control bg-primary text-on-primary">
          <Wallet aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-heading text-ink">{title}</h2>
          <div className="text-small text-ink-muted">{text}</div>
        </div>
      </div>
      {children}
    </Card>
  );
}

/** One state of the box. No hooks and no reads: the page streams it in, and it can be drawn for any state. */
export function HomeBalanceView({ state, t }: { state: HomeBalanceState; t: BalanceMessages }) {
  if (state.kind === "signedOut") {
    return (
      <BalanceFrame title={t.title} text={t.signedOutText}>
        <div className="mt-4">
          <ButtonLink href={sitePath("/sign-in")} size="sm">
            {t.signIn}
          </ButtonLink>
        </div>
      </BalanceFrame>
    );
  }
  if (state.kind === "noWallet") {
    return (
      <BalanceFrame title={t.title} text={t.noWalletText}>
        <div className="mt-4">
          <ButtonLink href={sitePath("/account")} variant="secondary" size="sm">
            {t.myAccount}
          </ButtonLink>
        </div>
      </BalanceFrame>
    );
  }
  const wallet = sitePath("/account/wallet");
  const addFunds = sitePath("/account/wallet/add-funds");
  return (
    <BalanceFrame title={t.title} text={t.text}>
      <p className="num mt-4 text-stat text-ink">
        <Money amount={state.available} currency="USD" />
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {state.canAddFunds ? (
          <ButtonLink href={addFunds} size="sm">
            {t.addFunds}
          </ButtonLink>
        ) : null}
        <ButtonLink href={wallet} variant="secondary" size="sm">
          {t.openWallet}
        </ButtonLink>
      </div>
    </BalanceFrame>
  );
}

/** The box while the session is read: the shell with its heading, and the space of one line and one button. */
export function HomeBalanceSkeleton() {
  const t = store.home.balance;
  return (
    <BalanceFrame title={t.title} text={<Skeleton className="mt-1 h-[1lh] w-44" />}>
      <div aria-busy="true" className="mt-4">
        <Skeleton className="h-9 w-24 rounded-control" />
      </div>
    </BalanceFrame>
  );
}
