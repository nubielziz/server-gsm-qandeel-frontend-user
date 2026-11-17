// The customer wallet (plan F21, F33, BH §3.1, §3.2, §3.3): the balance cards, notices (on hold, below zero, switched off), the
// customer's latest top-ups and the statement with a date range, 25 rows a page. The wallet is USD; in another shop currency an
// "about …" line follows. "Add funds" leads to /account/wallet/add-funds, a top-up row to its own page.
// The frame (heading) is static; the wallet, the top-ups and the statement are personal and never cached, so they are read at
// request time (`apiSessionGet`, no-store) and stream behind <Suspense> with a skeleton. The wallet is the request's one shared
// read (`readCustomerWallet`), also used by the layout's nav item and pill.
// `?topUp=<id>` (the return of an online top-up) shows a notice that follows that top-up until it is credited, rejected or two
// minutes have passed (`TopUpReturnPoller`), then refreshes the page. A failed read shows the request reference, and a
// signed-out answer goes to the sign-in page.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Landmark, Plus, ReceiptText, Wallet } from "lucide-react";
import { apiSessionList } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import type { CustomerStatementLine, TopUp } from "@/lib/api/types";
import { getCurrency } from "@/lib/currency";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { sitePath } from "@/lib/site-path";
import { fmt, plural } from "@/lib/i18n/define";
import { errorText } from "@/lib/i18n/error-text-core";
import { common } from "@/lib/i18n/messages/common";
import { errors } from "@/lib/i18n/messages/errors";
import { topUps } from "@/lib/i18n/messages/top-ups";
import { wallet } from "@/lib/i18n/messages/wallet";
import { ltr } from "@/lib/merchant/format";
import { first, type SearchParams } from "@/lib/merchant/lists";
import { settle } from "@/lib/merchant/load";
import { listQuery, parsePage } from "@/lib/api/query";
import { approximateIn } from "@/lib/wallet/convert";
import { CUSTOMER_STATEMENT_PER_PAGE, customerStatementRows, parseStatementRange, statementQuery, walletCapabilities } from "@/lib/wallet/view";
import { readCustomerWallet } from "@/components/layout/account-area";
import { PageHeader } from "@/components/layout/container";
import { RetryButton } from "@/components/merchant/retry-button";
import { WalletBalanceCards } from "@/components/wallet/balance-cards";
import { StatementRangeForm } from "@/components/wallet/statement-range-form";
import { StatementTable } from "@/components/wallet/statement-table";
import { TopUpReturnPoller } from "@/components/wallet/top-up-return-poller";
import { TopUpsTable } from "@/components/wallet/top-ups-table";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Pagination, pageHref } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/layout/page-transition";

export function generateMetadata(): Metadata {
  const t = wallet;
  return { title: t.metaTitle, robots: { index: false, follow: false } };
}

const SIGNED_OUT_CODES = new Set(["UNAUTHORIZED", "ACCOUNT_SUSPENDED", "IP_NOT_ALLOWED"]);

/** How many top-ups the wallet page lists (the newest first). */
const TOP_UPS_ON_PAGE = 10;

/** A signed-out answer (handoff §3.4) goes to the customer sign-in page, which comes back here; anything else returns. */
function leaveIfSignedOut(error: unknown, next: string): void {
  if (isApiError(error) && (error.status === 401 || SIGNED_OUT_CODES.has(error.code))) {
    redirect(`${sitePath("/sign-in")}?${new URLSearchParams({ as: "customer", next }).toString()}`);
  }
}

function WalletSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-36 rounded-panel" />
        <Skeleton className="h-36 rounded-card" />
      </div>
      <Skeleton className="h-[36rem] rounded-card" />
    </div>
  );
}

/** A failed read, inside the page (the frame stays): a plain sentence, the request reference and a retry. */
function LoadError({ error, title, retry }: { error: unknown; title: string; retry: string }) {
  const text = errorText(errors);
  return (
    <ErrorState
      title={title}
      message={text.message(error)}
      reference={text.reference(error)}
      action={<RetryButton label={retry} />}
    />
  );
}

async function WalletContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const t = wallet;
  const c = common;
  const tu = topUps;
  const base = sitePath("/account/wallet");
  const topUpsBase = sitePath("/account/wallet/top-ups");
  // The return of an online payment names the top-up: only digits can be one (a hand-made value shows no notice).
  const returned = first(sp.topUp);
  const returnedTopUp = /^[1-9]\d{0,15}$/.test(returned) ? returned : null;
  const range = parseStatementRange({ from: first(sp.from), to: first(sp.to) });
  const page = parsePage(sp.page);
  const filters = { from: range.from || undefined, to: range.to || undefined };

  const [read, currency, statement, latest] = await Promise.all([
    readCustomerWallet(),
    getCurrency().catch(() => null),
    settle(apiSessionList<CustomerStatementLine>("/store/v1/me/wallet/statement", { query: statementQuery(range, page) })),
    settle(apiSessionList<TopUp>("/store/v1/me/wallet/top-ups", { query: listQuery({ start: 0, end: TOP_UPS_ON_PAGE }) })),
  ]);

  if (!read.ok) {
    leaveIfSignedOut(read.error, base);
    return (
      <Card>
        <LoadError error={read.error} title={t.errors.loadTitle} retry={t.errors.retry} />
      </Card>
    );
  }
  const w = read.data;
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
    leaveIfSignedOut(statement.error, base);
    statementBody = <LoadError error={statement.error} title={t.errors.statementTitle} retry={t.errors.retry} />;
  } else {
    const { data, total } = statement.data;
    // A page number past the end (an old bookmark): back to the first page of the same range.
    if (data.length === 0 && total > 0 && page > 1) redirect(pageHref(base, filters, 1));
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
          <EmptyState icon={<ReceiptText aria-hidden="true" />} title={t.statement.emptyTitle} description={t.statement.emptyText} />
        )
      ) : (
        <>
          <StatementTable
            rows={rows}
            labels={{ caption: t.statement.caption, columns: t.statement.columns, kinds: t.statement.kinds, dash: t.statement.dash }}
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
  if (!latest.ok) {
    leaveIfSignedOut(latest.error, base);
    topUpsBody = <LoadError error={latest.error} title={tu.list.errorTitle} retry={tu.list.retry} />;
  } else if (latest.data.data.length > 0) {
    topUpsBody = (
      <TopUpsTable
        rows={latest.data.data}
        hrefBase={topUpsBase}
        labels={{ caption: tu.list.caption, columns: tu.list.columns, view: tu.list.view, statuses: c.status.topUp }}
      />
    );
  } else if (caps.canAddFunds) {
    // No second "Add funds" link here: the balance card already has the one button.
    topUpsBody = <EmptyState compact icon={<Landmark aria-hidden="true" />} title={tu.list.emptyTitle} description={tu.list.emptyText} />;
  }

  return (
    <div className="grid gap-4">
      {returnedTopUp ? (
        <TopUpReturnPoller id={returnedTopUp} href={`${topUpsBase}/${returnedTopUp}`} labels={tu.poller} />
      ) : null}
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

export default function WalletPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = wallet;
  return (
    <PageTransition>
      <div className="grid gap-4">
        <PageHeader variant="card" title={t.page.title} description={t.page.description} />
        <Suspense fallback={<WalletSkeleton />}>
          <WalletContent searchParams={searchParams} />
        </Suspense>
      </div>
    </PageTransition>
  );
}
