// The wallet of a merchant rank (`GET /client/wallet`): four cards (available, balance, reserved, credit limit), the note about
// online payments, the account statement with a CSV of it and 25 lines a page. It is also the page online top-ups return to
// (success and cancel both land on /account/wallet). Credit and reserved amounts are shown as the API sends them, never worked out
// here. The cards and the statement table are the ones of the retail wallet (components/wallet); the texts are the merchant's own.
// The API has no date filter on this statement: none is offered.
// `MerchantWalletView` reads the statement and sends a signed-out or rank-refused answer where it belongs (lib/merchant/load.ts);
// `MerchantWalletBody` draws what was read. Nothing here is cached: it is personal and read at request time, behind <Suspense>.
import { Info, Plus, ReceiptText } from "lucide-react";
import { apiSessionList } from "@/lib/api/server";
import { listQuery, pageRange, parsePage } from "@/lib/api/query";
import type { MerchantWallet, StatementLine } from "@/lib/api/types";
import { wallet as walletMessages } from "@/lib/i18n/messages/wallet";
import { STATEMENT_PER_PAGE, first, type SearchParams } from "@/lib/merchant/lists";
import { routeOnError, settle, type Settled } from "@/lib/merchant/load";
import { sitePath } from "@/lib/site-path";
import { merchantStatementRows } from "@/lib/wallet/view";
import { WalletLoadError } from "@/components/account/wallet/wallet-parts";
import { CsvDownloadButton } from "@/components/merchant/csv-download-button";
import { WalletBalanceCards } from "@/components/wallet/balance-cards";
import { StatementTable } from "@/components/wallet/statement-table";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";

/** A list answer: the rows of the page and the total of the whole list. */
type Rows<T> = { data: T[]; total: number };

export type MerchantWalletBodyProps = {
  wallet: MerchantWallet;
  statement: Settled<Rows<StatementLine>>;
  page: number;
  /** The page's own query, kept by the pagination links. */
  searchParams: SearchParams;
};

/** The wallet page of a merchant rank, from what was read. A failed statement shows inside its card; the balances stay. */
export function MerchantWalletBody({ wallet: w, statement, page, searchParams }: MerchantWalletBodyProps) {
  const t = walletMessages;
  const m = t.merchant;
  const base = sitePath("/account/wallet");

  return (
    <div className="grid gap-6">
      <Alert tone="info" icon={<Info aria-hidden="true" />}>
        {m.onlineNote}
      </Alert>
      <WalletBalanceCards
        amounts={{ available: w.available, balance: w.balance, reserved: w.reserved, creditLimit: w.creditLimit }}
        labels={m.cards}
        availableAction={
          <ButtonLink href={sitePath("/account/wallet/add-funds")} variant="inverse" startIcon={<Plus aria-hidden="true" />}>
            {t.page.addFunds}
          </ButtonLink>
        }
      />

      <Card>
        <CardHeader
          title={m.statement.title}
          description={m.statement.description}
          actions={
            <CsvDownloadButton
              path="/client/wallet/statement"
              fallbackName="statement.csv"
              query={{ format: "csv" }}
              label={m.statement.download}
              busyLabel={m.statement.exporting}
              failedLabel={m.statement.exportFailed}
            />
          }
        />
        <div className="mt-4">
          {!statement.ok ? (
            <WalletLoadError error={statement.error} title={t.errors.statementTitle} retry={t.errors.retry} />
          ) : statement.data.data.length === 0 ? (
            <EmptyState
              icon={<ReceiptText aria-hidden="true" />}
              title={m.statement.emptyTitle}
              description={m.statement.emptyText}
            />
          ) : (
            <StatementTable
              rows={merchantStatementRows(statement.data.data)}
              labels={{
                caption: m.statement.caption,
                columns: m.statement.columns,
                kinds: m.statement.kinds,
                dash: m.statement.dash,
              }}
            />
          )}
        </div>
      </Card>
      {statement.ok ? (
        <Pagination
          total={statement.data.total}
          pageSize={STATEMENT_PER_PAGE}
          page={page}
          basePath={base}
          searchParams={searchParams}
        />
      ) : null}
    </div>
  );
}

/** The wallet page of a merchant rank. `read` is the wallet the page already read (`readAccountWallet`); the statement is read here. */
export async function MerchantWalletView({
  read,
  searchParams,
}: {
  read: Settled<MerchantWallet>;
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const t = walletMessages;
  const base = sitePath("/account/wallet");
  const page = parsePage(first(sp.page));
  const { start, end } = pageRange(page, STATEMENT_PER_PAGE);

  const statement = await settle(
    apiSessionList<StatementLine>("/client/wallet/statement", {
      query: listQuery({ start, end, sort: "createdAt", order: "desc" }),
    }),
  );

  if (!read.ok) {
    routeOnError(read.error, { next: base });
    return (
      <Card>
        <WalletLoadError error={read.error} title={t.errors.loadTitle} retry={t.errors.retry} />
      </Card>
    );
  }
  if (!statement.ok) routeOnError(statement.error, { next: base });
  return <MerchantWalletBody wallet={read.data} statement={statement} page={page} searchParams={sp} />;
}
