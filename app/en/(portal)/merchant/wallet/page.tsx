// The wallet (handoff §4.7) and the page online top-ups return to (success and cancel both land here, §4.8):
// balances, the account statement and a CSV of it. The API has no date filter on the statement: none is offered.
// The cards and the statement come from components/wallet (shared with the customer wallet, plan D6); the texts are the
// merchant's own.
import { Suspense } from "react";
import { Info, Plus, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/container";
import { CsvDownloadButton } from "@/components/merchant/csv-download-button";
import { PageError } from "@/components/merchant/page-error";
import { ListSkeleton } from "@/components/merchant/skeletons";
import { WalletBalanceCards } from "@/components/wallet/balance-cards";
import { StatementTable } from "@/components/wallet/statement-table";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { apiSessionGet, apiSessionList } from "@/lib/api/server";
import { listQuery, pageRange, parsePage } from "@/lib/api/query";
import type { MerchantWallet, StatementLine } from "@/lib/api/types";
import { sitePath } from "@/lib/site-path";
import { merchant } from "@/lib/i18n/messages/merchant";
import { settle } from "@/lib/merchant/load";
import { STATEMENT_PER_PAGE, first, type SearchParams } from "@/lib/merchant/lists";
import { merchantStatementRows } from "@/lib/wallet/view";
import { PageTransition } from "@/components/layout/page-transition";

export function generateMetadata(): Metadata {
  const t = merchant;
  return { title: t.wallet.title };
}

export default function WalletPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = merchant;
  return (
    <PageTransition>
      <div className="grid gap-6">
        <PageHeader
          title={t.wallet.title}
          description={t.wallet.description}
          actions={
            <ButtonLink href={sitePath("/merchant/wallet/top-up")} startIcon={<Plus aria-hidden="true" />}>
              {t.wallet.addFunds}
            </ButtonLink>
          }
        />
        <Alert tone="info" icon={<Info aria-hidden="true" />}>
          {t.wallet.onlineNote}
        </Alert>
        <Suspense
          fallback={
            <div className="grid gap-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
                <Skeleton className="h-36 rounded-panel" />
                <Skeleton className="h-36 rounded-card" />
                <Skeleton className="h-36 rounded-card" />
                <Skeleton className="h-36 rounded-card" />
              </div>
              <ListSkeleton rows={10} toolbar={false} />
            </div>
          }
        >
          <WalletContent searchParams={searchParams} />
        </Suspense>
      </div>
    </PageTransition>
  );
}

async function WalletContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const t = merchant;
  const base = sitePath("/merchant/wallet");
  const page = parsePage(first(sp.page));
  const { start, end } = pageRange(page, STATEMENT_PER_PAGE);

  const [wallet, statement] = await Promise.all([
    settle(apiSessionGet<MerchantWallet>("/client/wallet")),
    settle(apiSessionList<StatementLine>("/client/wallet/statement", { query: listQuery({ start, end, sort: "createdAt", order: "desc" }) })),
  ]);
  if (!wallet.ok) return <PageError error={wallet.error} next={base} />;
  const w = wallet.data;

  return (
    <div className="grid gap-6">
      <WalletBalanceCards
        amounts={{ available: w.available, balance: w.balance, reserved: w.reserved, creditLimit: w.creditLimit }}
        labels={{
          available: t.wallet.available,
          availableHint: t.wallet.availableHint,
          balance: t.wallet.balance,
          balanceHint: t.wallet.balanceHint,
          reserved: t.wallet.reserved,
          reservedHint: t.wallet.reservedHint,
          creditLimit: t.wallet.creditLimit,
          creditLimitHint: t.wallet.creditLimitHint,
        }}
      />

      <Card>
        <CardHeader
          title={t.wallet.statementTitle}
          description={t.wallet.statementText}
          actions={
            <CsvDownloadButton
              path="/client/wallet/statement"
              fallbackName="statement.csv"
              query={{ format: "csv" }}
              label={t.wallet.downloadStatement}
              busyLabel={t.shared.exporting}
              failedLabel={t.shared.exportFailed}
            />
          }
        />
        <div className="mt-4">
          {!statement.ok ? (
            <PageError error={statement.error} next={base} />
          ) : statement.data.data.length === 0 ? (
            <EmptyState icon={<ReceiptText aria-hidden="true" />} title={t.wallet.emptyTitle} description={t.wallet.emptyText} />
          ) : (
            <StatementTable
              rows={merchantStatementRows(statement.data.data)}
              labels={{
                caption: t.wallet.caption,
                columns: { date: t.wallet.columns.date, kind: t.wallet.columns.kind, details: t.wallet.columns.memo, amount: t.wallet.columns.amount, balanceAfter: t.wallet.columns.balanceAfter },
                kinds: t.wallet.kinds as Record<string, string>,
                dash: t.shared.dash,
              }}
            />
          )}
        </div>
      </Card>
      {statement.ok ? <Pagination total={statement.data.total} pageSize={STATEMENT_PER_PAGE} page={page} basePath={base} searchParams={sp} /> : null}
    </div>
  );
}
