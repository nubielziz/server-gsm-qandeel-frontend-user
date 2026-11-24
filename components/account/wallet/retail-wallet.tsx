// The wallet of a retail rank (the store balance): the balance cards, notices (on hold, below zero, switched off), the latest
// top-ups and the statement with a date range, 25 rows a page. The wallet is USD; in another shop currency an "about …" line
// follows. "Add funds" leads to /account/wallet/add-funds, a top-up row to its own page.
// `RetailWalletView` reads what the page needs next to the wallet (the statement, the latest top-ups, the shop currency) and
// sends a signed-out or rank-refused answer where it belongs (lib/merchant/load.ts); `RetailWalletBody` draws it. Nothing here
// is cached: the wallet, the top-ups and the statement are personal and read at request time, behind <Suspense>.
// `?topUp=<id>` (the return of an online top-up) shows a notice that follows that top-up until it is credited, rejected or two
// minutes have passed (`TopUpReturnPoller`), then refreshes the page. A failed read shows the request reference.
import { redirect } from "next/navigation";
import { Landmark, Plus, ReceiptText, Wallet } from "lucide-react";
import { apiSessionList } from "@/lib/api/server";
import { listQuery, parsePage } from "@/lib/api/query";
import type { CustomerStatementLine, CustomerWallet, StoreCurrency, TopUp } from "@/lib/api/types";
import { getCurrency } from "@/lib/currency";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { fmt, plural } from "@/lib/i18n/define";
import { common } from "@/lib/i18n/messages/common";
import { topUps } from "@/lib/i18n/messages/top-ups";
import { wallet as walletMessages } from "@/lib/i18n/messages/wallet";
import { ltr } from "@/lib/merchant/format";
import { first, type SearchParams } from "@/lib/merchant/lists";
import { routeOnError, settle, type Settled } from "@/lib/merchant/load";
import { sitePath } from "@/lib/site-path";
import { approximateIn } from "@/lib/wallet/convert";
import {
  CUSTOMER_STATEMENT_PER_PAGE,
  customerStatementRows,
  parseStatementRange,
  statementQuery,
  walletCapabilities,
  type StatementRange,
} from "@/lib/wallet/view";
import { WalletLoadError } from "@/components/account/wallet/wallet-parts";
import { WalletBalanceCards } from "@/components/wallet/balance-cards";
import { StatementRangeForm } from "@/components/wallet/statement-range-form";
import { StatementTable } from "@/components/wallet/statement-table";
import { TopUpReturnPoller } from "@/components/wallet/top-up-return-poller";
import { TopUpsTable } from "@/components/wallet/top-ups-table";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageHref } from "@/components/ui/pagination";

/** How many top-ups the wallet page lists (the newest first). */
const TOP_UPS_ON_PAGE = 10;

/** A list answer: the rows of the page and the total of the whole list. */
type Rows<T> = { data: T[]; total: number };

export type RetailWalletBodyProps = {
  wallet: CustomerWallet;
  /** The shop currency, or null when it could not be read (no "about …" line then). */
  currency: Pick<StoreCurrency, "code" | "decimals" | "fxRate"> | null;
  statement: Settled<Rows<CustomerStatementLine>>;
  latestTopUps: Settled<Rows<TopUp>>;
  range: StatementRange & { invalid: boolean };
  page: number;
  /** The top-up an online payment returned from: digits only, checked by the caller. */
  returnedTopUp: string | null;
};

/** The wallet page of a retail rank, from what was read. A failed list shows inside its own card; the rest stays. */
export function RetailWalletBody({
  wallet: w,
  currency,
  statement,
  latestTopUps,
  range,
  page,
  returnedTopUp,
}: RetailWalletBodyProps) {
  const t = walletMessages;
  const c = common;
  const tu = topUps;
  const base = sitePath("/account/wallet");
  const topUpsBase = sitePath("/account/wallet/top-ups");
  const filters = { from: range.from || undefined, to: range.to || undefined };
  const caps = walletCapabilities(w);

  // Switched off and empty: nothing to show (no nav item, no pill either). Reached by a typed address or an old bookmark.
  if (!caps.show) {
    return (
      <Card>
        <EmptyState
          icon={<Wallet aria-hidden="true" />}
          title={t.notices.disabledTitle}
          description={t.notices.disabledText}
          action={
            <ButtonLink href={sitePath("/account")} variant="secondary">
              {t.notices.backToAccount}
            </ButtonLink>
          }
        />
      </Card>
    );
  }

  const approx = currency ? approximateIn(w.available, currency) : null;
  const pendingCount = w.pendingTopUps?.count ?? 0;

  let statementBody;
  if (!statement.ok) {
    statementBody = <WalletLoadError error={statement.error} title={t.errors.statementTitle} retry={t.errors.retry} />;
  } else {
    const { data, total } = statement.data;
    const rows = customerStatementRows(data, (ref) => fmt(t.statement.order, { id: ltr(ref) }));
    statementBody =
      rows.length === 0 ? (
        range.from || range.to ? (
          <EmptyState
            icon={<ReceiptText aria-hidden="true" />}
            title={t.statement.emptyRangeTitle}
            description={t.statement.emptyRangeText}
            action={
              <ButtonLink href={base} variant="secondary">
                {t.statement.clear}
              </ButtonLink>
            }
          />
        ) : (
          <EmptyState
            icon={<ReceiptText aria-hidden="true" />}
            title={t.statement.emptyTitle}
            description={t.statement.emptyText}
          />
        )
      ) : (
        <>
          <StatementTable
            rows={rows}
            labels={{
              caption: t.statement.caption,
              columns: t.statement.columns,
              kinds: t.statement.kinds,
              dash: t.statement.dash,
            }}
          />
          <div className="border-t border-line px-5 py-4">
            <Pagination total={total} pageSize={CUSTOMER_STATEMENT_PER_PAGE} page={page} basePath={base} searchParams={filters} />
          </div>
        </>
      );
  }

  // The latest top-ups: a table (a list on phones) with a link to each one's page. A wallet that is switched off and has
  // never had a top-up shows no card at all; a failed read shows inside the card, the rest of the page stays.
  let topUpsBody = null;
  if (!latestTopUps.ok) {
    topUpsBody = <WalletLoadError error={latestTopUps.error} title={tu.list.errorTitle} retry={tu.list.retry} />;
  } else if (latestTopUps.data.data.length > 0) {
    topUpsBody = (
      <TopUpsTable
        rows={latestTopUps.data.data}
        hrefBase={topUpsBase}
        labels={{ caption: tu.list.caption, columns: tu.list.columns, view: tu.list.view, statuses: c.status.topUp }}
      />
    );
  } else if (caps.canAddFunds) {
    // No second "Add funds" link here: the balance card already has the one button.
    topUpsBody = (
      <EmptyState compact icon={<Landmark aria-hidden="true" />} title={tu.list.emptyTitle} description={tu.list.emptyText} />
    );
  }

  return (
    <div className="grid gap-4">
      {returnedTopUp ? <TopUpReturnPoller id={returnedTopUp} href={`${topUpsBase}/${returnedTopUp}`} labels={tu.poller} /> : null}
      {caps.frozen && w.frozen ? (
        // The reason stays with staff: only the date is shown.
        <Alert tone="warning" title={t.notices.frozenTitle}>
          {fmt(t.notices.frozenText, { date: formatDate(w.frozen.at) })}
        </Alert>
      ) : null}
      {caps.negative ? (
        <Alert tone="warning" title={t.notices.negativeTitle}>
          {t.notices.negativeText}
        </Alert>
      ) : null}
      {!w.enabled ? (
        <Alert tone="info" title={t.notices.disabledTitle}>
          {`${t.notices.disabledText} ${t.notices.disabledKept}`}
        </Alert>
      ) : null}

      <WalletBalanceCards
        amounts={{ balance: w.balance, available: w.available }}
        labels={{
          available: t.cards.available,
          availableHint: t.cards.availableHint,
          balance: t.cards.balance,
          balanceHint: t.cards.balanceHint,
        }}
        availableNote={
          approx ? fmt(t.cards.approx, { amount: ltr(formatMoney(approx.amount, approx.currency, approx.decimals)) }) : undefined
        }
        availableAction={
          caps.canAddFunds ? (
            <ButtonLink href={sitePath("/account/wallet/add-funds")} variant="inverse" startIcon={<Plus aria-hidden="true" />}>
              {t.page.addFunds}
            </ButtonLink>
          ) : undefined
        }
        pending={
          pendingCount > 0
            ? {
                label: t.cards.pendingLabel,
                amount: w.pendingTopUps.amount,
                hint: plural(pendingCount, t.cards.pending, formatNumber(pendingCount)),
              }
            : undefined
        }
      />

      {topUpsBody ? (
        <Card as="section" aria-labelledby="top-ups-title">
          <CardHeader title={<span id="top-ups-title">{tu.list.title}</span>} description={tu.list.description} />
          <div className="mt-4 border-t border-line">{topUpsBody}</div>
        </Card>
      ) : null}

      <Card as="section" aria-labelledby="statement-title">
        <CardHeader title={<span id="statement-title">{t.statement.title}</span>} description={t.statement.description} />
        <CardBody>
          <StatementRangeForm
            action={base}
            from={range.from}
            to={range.to}
            invalid={range.invalid}
            clearHref={base}
            labels={{
              form: t.statement.rangeLabel,
              from: t.statement.from,
              to: t.statement.to,
              apply: t.statement.apply,
              clear: t.statement.clear,
              invalid: t.statement.rangeInvalid,
            }}
          />
          {/* Tells a screen reader how many lines the chosen dates left (the visible total is further down). */}
          {statement.ok ? (
            <p role="status" className="sr-only">
              {plural(statement.data.total, c.pagination.results, formatNumber(statement.data.total))}
            </p>
          ) : null}
        </CardBody>
        <div className="border-t border-line">{statementBody}</div>
      </Card>
    </div>
  );
}

/**
 * The wallet page of a retail rank. `read` is the wallet the page already read (`readAccountWallet`); the statement, the latest
 * top-ups and the shop currency are read here, in parallel.
 */
export async function RetailWalletView({
  read,
  searchParams,
}: {
  read: Settled<CustomerWallet>;
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const t = walletMessages;
  const base = sitePath("/account/wallet");
  // The return of an online payment names the top-up: only digits can be one (a hand-made value shows no notice).
  const returned = first(sp.topUp);
  const returnedTopUp = /^[1-9]\d{0,15}$/.test(returned) ? returned : null;
  const range = parseStatementRange({ from: first(sp.from), to: first(sp.to) });
  const page = parsePage(sp.page);
  const filters = { from: range.from || undefined, to: range.to || undefined };

  const [currency, statement, latestTopUps] = await Promise.all([
    getCurrency().catch(() => null),
    settle(apiSessionList<CustomerStatementLine>("/store/v1/me/wallet/statement", { query: statementQuery(range, page) })),
    settle(apiSessionList<TopUp>("/store/v1/me/wallet/top-ups", { query: listQuery({ start: 0, end: TOP_UPS_ON_PAGE }) })),
  ]);

  if (!read.ok) {
    routeOnError(read.error, { next: base });
    return (
      <Card>
        <WalletLoadError error={read.error} title={t.errors.loadTitle} retry={t.errors.retry} />
      </Card>
    );
  }
  if (!statement.ok) routeOnError(statement.error, { next: base });
  if (!latestTopUps.ok) routeOnError(latestTopUps.error, { next: base });
  // A page number past the end (an old bookmark): back to the first page of the same range.
  if (statement.ok && statement.data.data.length === 0 && statement.data.total > 0 && page > 1)
    redirect(pageHref(base, filters, 1));

  return (
    <RetailWalletBody
      wallet={read.data}
      currency={currency}
      statement={statement}
      latestTopUps={latestTopUps}
      range={range}
      page={page}
      returnedTopUp={returnedTopUp}
    />
  );
}
