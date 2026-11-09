// The wallet (handoff §4.7) and the page online top-ups return to (success and cancel both land here, §4.8):
// balances, the account statement and a CSV of it. The API has no date filter on the statement: none is offered.
import { Suspense } from "react";
import { Info, Plus, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/container";
import { CsvDownloadButton } from "@/components/merchant/csv-download-button";
import { PageError } from "@/components/merchant/page-error";
import { MobileList, type MobileRow } from "@/components/merchant/mobile-list";
import { ListSkeleton } from "@/components/merchant/skeletons";
import { SignedMoney } from "@/components/merchant/signed-money";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { apiSessionGet, apiSessionList } from "@/lib/api/server";
import { listQuery, pageRange, parsePage } from "@/lib/api/query";
import type { MerchantWallet, StatementLine } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { localePath } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { merchant } from "@/lib/i18n/messages/merchant";
import { labelOf } from "@/lib/merchant/format";
import { settle } from "@/lib/merchant/load";
import { STATEMENT_PER_PAGE, first, type SearchParams } from "@/lib/merchant/lists";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(merchant);
  return { title: t.wallet.title };
}

export default async function WalletPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages(merchant)]);
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t.wallet.title}
        description={t.wallet.description}
        actions={
          <ButtonLink href={localePath(locale, "/merchant/wallet/top-up")} startIcon={<Plus aria-hidden="true" />}>
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
  );
}

async function WalletContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(merchant), searchParams]);
  const base = localePath(locale, "/merchant/wallet");
  const page = parsePage(first(sp.page));
  const { start, end } = pageRange(page, STATEMENT_PER_PAGE);

  const [wallet, statement] = await Promise.all([
    settle(apiSessionGet<MerchantWallet>("/client/wallet")),
    settle(apiSessionList<StatementLine>("/client/wallet/statement", { query: listQuery({ start, end, sort: "createdAt", order: "desc" }) })),
  ]);
  if (!wallet.ok) return <PageError error={wallet.error} next={base} />;
  const w = wallet.data;
  const kinds = t.wallet.kinds as Record<string, string>;
  const col = t.wallet.columns;

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="inverse"
          label={t.wallet.available}
          value={<Money amount={w.available} currency="USD" locale={locale} />}
          hint={t.wallet.availableHint}
          className="sm:col-span-2 xl:col-span-1"
        />
        <StatCard label={t.wallet.balance} value={<Money amount={w.balance} currency="USD" locale={locale} />} hint={t.wallet.balanceHint} />
        <StatCard label={t.wallet.reserved} value={<Money amount={w.reserved} currency="USD" locale={locale} />} hint={t.wallet.reservedHint} />
        <StatCard label={t.wallet.creditLimit} value={<Money amount={w.creditLimit} currency="USD" locale={locale} />} hint={t.wallet.creditLimitHint} />
      </div>

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
            <>
            <MobileList
              className="md:hidden"
              rows={statement.data.data.map(
                (line): MobileRow => ({
                  key: line.id,
                  title: labelOf(kinds, line.kind),
                  subtitle: line.memo ? <span dir="auto" className="text-ink-muted">{line.memo}</span> : undefined,
                  details: [formatDateTime(line.createdAt, locale)],
                  amount: <SignedMoney amount={line.amount} locale={locale} />,
                  amountHint: <Money amount={line.balanceAfter} currency="USD" locale={locale} />,
                }),
              )}
            />
            <div className="hidden md:block">
            <Table caption={t.wallet.caption}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{col.date}</TableHeaderCell>
                  <TableHeaderCell>{col.kind}</TableHeaderCell>
                  <TableHeaderCell>{col.memo}</TableHeaderCell>
                  <TableHeaderCell numeric>{col.amount}</TableHeaderCell>
                  <TableHeaderCell numeric>{col.balanceAfter}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {statement.data.data.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <span className="whitespace-nowrap text-ink-muted">{formatDateTime(line.createdAt, locale)}</span>
                    </TableCell>
                    <TableCell label={col.kind}>
                      <span className="font-medium">{labelOf(kinds, line.kind)}</span>
                    </TableCell>
                    <TableCell label={col.memo}>
                      <span dir="auto" className="text-ink-muted">
                        {line.memo || t.shared.dash}
                      </span>
                    </TableCell>
                    <TableCell numeric label={col.amount}>
                      <SignedMoney amount={line.amount} locale={locale} />
                    </TableCell>
                    <TableCell numeric label={col.balanceAfter}>
                      <Money amount={line.balanceAfter} currency="USD" locale={locale} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          )}
        </div>
      </Card>
      {statement.ok ? <Pagination total={statement.data.total} pageSize={STATEMENT_PER_PAGE} page={page} basePath={base} searchParams={sp} /> : null}
    </div>
  );
}
