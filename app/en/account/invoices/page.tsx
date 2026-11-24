// Invoices & billing of a merchant rank (handoff §4.8, mockup "Invoice Billing"): counts per status, filters, the invoice table
// and, from xl up, a preview panel of the selected invoice (`?selected=<id>`). The API sends no money totals, so none are shown:
// the stat cards are counts read from `x-total-count` of one-row list calls. Only a merchant rank has invoices: any other rank goes
// to the account home.
import { Suspense } from "react";
import Link from "next/link";
import { CircleCheck, CircleDashed, Download, Eye, FileText, Headset, Plus, ReceiptText, Search } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/container";
import { FilterForm } from "@/components/merchant/filter-form";
import { InvoiceFacts } from "@/components/merchant/invoice-facts";
import { PageError } from "@/components/merchant/page-error";
import { ListSkeleton, StatsSkeleton } from "@/components/merchant/skeletons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { apiSessionGet, apiSessionList } from "@/lib/api/server";
import { requireRank } from "@/lib/api/session";
import type { Invoice, InvoiceDetail } from "@/lib/api/types";
import { formatDate, formatNumber } from "@/lib/format";
import { sitePath } from "@/lib/site-path";
import { fmt } from "@/lib/i18n/define";
import { common, statusLabel, type CommonMessages } from "@/lib/i18n/messages/common";
import { topUps, type TopUpsMessages } from "@/lib/i18n/messages/top-ups";
import { labelOf } from "@/lib/merchant/format";
import { settle } from "@/lib/merchant/load";
import {
  INVOICES_PER_PAGE,
  INVOICE_KINDS,
  INVOICE_SORTS,
  INVOICE_STATUSES,
  countQuery,
  hrefWith,
  invoicesQuery,
  parseInvoicesFilters,
  type InvoicesFilters,
  type SearchParams,
} from "@/lib/merchant/lists";
import { PageTransition } from "@/components/layout/page-transition";

export function generateMetadata(): Metadata {
  const t = topUps.merchant;
  return { title: t.invoices.title };
}

export default function InvoicesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = topUps.merchant;
  return (
    <PageTransition>
      <div className="grid gap-6">
        <PageHeader
          title={t.invoices.title}
          description={t.invoices.description}
          actions={
            <ButtonLink href={sitePath("/account/wallet/add-funds")} startIcon={<Plus aria-hidden="true" />}>
              {t.invoices.addFunds}
            </ButtonLink>
          }
        />
        <Suspense
          fallback={
            <div className="grid gap-6">
              <StatsSkeleton />
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
                <ListSkeleton rows={8} />
                <div className="hidden h-[34rem] rounded-card bg-surface-sunken xl:block" aria-hidden="true" />
              </div>
            </div>
          }
        >
          <Invoices searchParams={searchParams} />
        </Suspense>
      </div>
    </PageTransition>
  );
}

async function Invoices({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const t = topUps.merchant;
  const c = common;
  const filters = parseInvoicesFilters(sp);
  const base = sitePath("/account/invoices");
  await requireRank("merchant", base);

  const [list, open, paid, voided] = await Promise.all([
    settle(apiSessionList<Invoice>("/client/invoices", { query: invoicesQuery(filters) })),
    settle(apiSessionList<Invoice>("/client/invoices", { query: countQuery({ status: "open" }) })),
    settle(apiSessionList<Invoice>("/client/invoices", { query: countQuery({ status: "paid" }) })),
    settle(apiSessionList<Invoice>("/client/invoices", { query: countQuery({ status: "void" }) })),
  ]);
  if (!list.ok) return <PageError error={list.error} next={base} />;
  const { data: rows, total } = list.data;

  // The preview shows `?selected` (fetched when it is not on this page) or the first row.
  let selected: Invoice | null = rows.find((r) => String(r.id) === filters.selected) ?? null;
  if (!selected && filters.selected) {
    const detail = await settle(apiSessionGet<InvoiceDetail>(`/client/invoices/${filters.selected}`));
    if (detail.ok) selected = detail.data.invoice;
  }
  selected ??= rows[0] ?? null;

  const count = (r: typeof open) => (r.ok ? formatNumber(r.data.total) : t.shared.dash);
  const carry = { kind: filters.kind, q: filters.q, sort: filters.sort === "newest" ? undefined : filters.sort };
  const tabs = [
    { key: "", label: t.shared.all, href: hrefWith(base, carry) },
    ...INVOICE_STATUSES.map((status) => ({
      key: status,
      label: statusLabel(c, "invoice", status),
      href: hrefWith(base, { ...carry, status }),
    })),
  ];
  const filtered = Boolean(filters.status || filters.kind || filters.q);
  const fieldsActive = Boolean(filters.kind || filters.q || filters.sort !== "newest");

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={t.invoices.stats.open}
          value={count(open)}
          icon={<CircleDashed aria-hidden="true" />}
          href={hrefWith(base, { status: "open" })}
          hint={t.invoices.statsHint}
        />
        <StatCard
          label={t.invoices.stats.paid}
          value={count(paid)}
          icon={<CircleCheck aria-hidden="true" />}
          href={hrefWith(base, { status: "paid" })}
          hint={t.invoices.statsHint}
        />
        <StatCard
          label={t.invoices.stats.void}
          value={count(voided)}
          icon={<FileText aria-hidden="true" />}
          href={hrefWith(base, { status: "void" })}
          hint={t.invoices.statsHint}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="grid min-w-0 gap-4">
          <Card>
            <CardHeader title={t.invoices.historyTitle} description={t.invoices.historyText} divided />
            <CardBody className="grid gap-4">
              <Tabs label={t.invoices.tabsLabel} items={tabs} activeKey={filters.status} variant="pill" />
              <FilterForm
                action={base}
                hidden={{ status: filters.status }}
                label={t.invoices.searchLabel}
                applyLabel={t.shared.apply}
                clearLabel={t.shared.clear}
                active={fieldsActive}
                clearHref={hrefWith(base, { status: filters.status })}
              >
                <Input
                  type="search"
                  name="q"
                  label={t.invoices.searchLabel}
                  labelHidden
                  defaultValue={filters.q}
                  placeholder={t.invoices.searchPlaceholder}
                  leading={<Search aria-hidden="true" />}
                  fieldClassName="w-full sm:w-56"
                  autoComplete="off"
                />
                <Select
                  name="kind"
                  label={t.invoices.kind}
                  labelHidden
                  defaultValue={filters.kind}
                  options={[
                    { value: "", label: `${t.invoices.kind}: ${t.shared.all}` },
                    ...INVOICE_KINDS.map((value) => ({ value, label: t.invoices.kinds[value] })),
                  ]}
                  fieldClassName="w-full sm:w-44"
                />
                <Select
                  name="sort"
                  label={t.shared.sortBy}
                  labelHidden
                  defaultValue={filters.sort}
                  options={INVOICE_SORTS.map((value) => ({ value, label: t.invoices.sorts[value] }))}
                  fieldClassName="w-full sm:w-44"
                />
              </FilterForm>
            </CardBody>
            <TabPanel activeKey={filters.status}>
              <div className="flex min-w-0 flex-col">
                {rows.length === 0 ? (
                  filtered ? (
                    <EmptyState
                      icon={<ReceiptText aria-hidden="true" />}
                      title={t.invoices.emptyFilteredTitle}
                      description={t.invoices.emptyFilteredText}
                      action={
                        <ButtonLink href={base} variant="secondary">
                          {t.shared.clear}
                        </ButtonLink>
                      }
                    />
                  ) : (
                    <EmptyState
                      icon={<ReceiptText aria-hidden="true" />}
                      title={t.invoices.emptyTitle}
                      description={t.invoices.emptyText}
                      action={<ButtonLink href={sitePath("/account/wallet/add-funds")}>{t.invoices.emptyAction}</ButtonLink>}
                    />
                  )
                ) : (
                  <InvoicesTable rows={rows} selectedId={selected?.id ?? null} filters={filters} base={base} t={t} c={c} />
                )}
              </div>
            </TabPanel>
          </Card>
          <Pagination total={total} pageSize={INVOICES_PER_PAGE} page={filters.page} basePath={base} searchParams={sp} />
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="flex items-center gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-card bg-surface-muted [&_svg]:size-6">
                  <Headset aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-subheading text-ink">{t.invoices.help.title}</h2>
                  <p className="text-body text-ink-muted">{t.invoices.help.text}</p>
                </div>
              </div>
              <ButtonLink href={sitePath("/help")} variant="secondary">
                {t.invoices.help.action}
              </ButtonLink>
            </div>
          </Card>
        </div>

        <aside aria-label={t.invoices.previewEyebrow} className="hidden xl:sticky xl:top-4 xl:block">
          {selected ? (
            <InvoicePreview invoice={selected} base={base} t={t} c={c} />
          ) : (
            <Card>
              <EmptyState compact icon={<FileText aria-hidden="true" />} title={t.invoices.previewEmpty} />
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

// One markup for every screen (plan P1.1): a `compact` table is the real table from `md` up and short list rows on phones
// (line 1: number, status, total; then kind and date as small text). The number link covers the whole row on phones,
// where the preview / PDF column is dropped (the preview panel shows from xl).
function InvoicesTable({
  rows,
  selectedId,
  filters,
  base,
  t,
  c,
}: {
  rows: Invoice[];
  selectedId: number | null;
  filters: InvoicesFilters;
  base: string;

  t: TopUpsMessages["merchant"];
  c: CommonMessages;
}) {
  const col = t.invoices.columns;
  const kinds = t.invoices.kinds as Record<string, string>;
  // The selection link keeps every other filter and the page.
  const selectHref = (id: number) => {
    const params: Record<string, string | undefined> = {
      status: filters.status,
      kind: filters.kind,
      q: filters.q,
      sort: filters.sort === "newest" ? undefined : filters.sort,
      page: filters.page > 1 ? String(filters.page) : undefined,
      selected: String(id),
    };
    return hrefWith(base, params);
  };
  return (
    <Table compact caption={t.invoices.caption}>
      <TableHead>
        <TableRow>
          <TableHeaderCell>{col.number}</TableHeaderCell>
          <TableHeaderCell>{col.kind}</TableHeaderCell>
          <TableHeaderCell>{col.issued}</TableHeaderCell>
          <TableHeaderCell numeric>{col.total}</TableHeaderCell>
          <TableHeaderCell>{col.status}</TableHeaderCell>
          <TableHeaderCell>
            <span className="sr-only">{col.actions}</span>
          </TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((inv) => {
          const detail = sitePath(`/account/invoices/${inv.id}`);
          return (
            <TableRow key={inv.id} selected={inv.id === selectedId}>
              <TableCell phone="title">
                <Link
                  href={detail}
                  aria-label={fmt(t.invoices.view, { number: inv.number })}
                  className="num font-semibold text-ink hover:underline max-md:after:absolute max-md:after:inset-0"
                >
                  {inv.number}
                </Link>
              </TableCell>
              <TableCell phone="meta" label={col.kind}>
                <Badge tone="outline" shape="tag">
                  {labelOf(kinds, inv.kind)}
                </Badge>
              </TableCell>
              <TableCell phone="meta" label={col.issued}>
                <span className="whitespace-nowrap text-ink-muted max-md:text-ink-subtle">{formatDate(inv.createdAt)}</span>
              </TableCell>
              <TableCell numeric phone="amount" label={col.total} className="font-semibold">
                <Money amount={inv.total} currency={inv.currency} />
              </TableCell>
              <TableCell phone="badge" label={col.status}>
                <StatusBadge kind="invoice" status={inv.status} label={statusLabel(c, "invoice", inv.status)} />
              </TableCell>
              <TableCell phone="hide">
                <div className="flex items-center justify-end gap-1">
                  <Link
                    href={detail}
                    aria-label={fmt(t.invoices.view, { number: inv.number })}
                    className={`${buttonClasses({ variant: "ghost", size: "sm" })} xl:hidden`}
                  >
                    <Eye aria-hidden="true" />
                  </Link>
                  <Link
                    href={selectHref(inv.id)}
                    scroll={false}
                    aria-label={fmt(t.invoices.preview, { number: inv.number })}
                    aria-current={inv.id === selectedId ? "true" : undefined}
                    className={`${buttonClasses({ variant: "ghost", size: "sm" })} hidden xl:inline-flex`}
                  >
                    <Eye aria-hidden="true" />
                  </Link>
                  {inv.pdfFileId ? (
                    <a
                      href={`/client/files/${inv.pdfFileId}`}
                      aria-label={fmt(t.invoices.pdf, { number: inv.number })}
                      className={buttonClasses({ variant: "ghost", size: "sm" })}
                    >
                      <Download aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function InvoicePreview({
  invoice,
  base,
  t,
  c,
}: {
  invoice: Invoice;
  base: string;
  t: TopUpsMessages["merchant"];
  c: CommonMessages;
}) {
  return (
    <Card>
      <CardBody className="grid gap-5">
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-ink-subtle">{t.invoices.previewEyebrow}</p>
          <h2 className="mt-1 text-heading text-ink">{fmt(t.invoices.previewTitle, { number: invoice.number })}</h2>
        </div>
        <InvoiceFacts invoice={invoice} t={t.invoices} c={c} />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          {invoice.pdfFileId ? (
            <a href={`/client/files/${invoice.pdfFileId}`} className={buttonClasses({ variant: "primary", block: true })}>
              <Download aria-hidden="true" />
              {t.invoices.downloadPdf}
            </a>
          ) : null}
          <ButtonLink href={`${base}/${invoice.id}`} variant="secondary" block>
            {t.invoices.viewFull}
          </ButtonLink>
        </div>
      </CardBody>
    </Card>
  );
}
