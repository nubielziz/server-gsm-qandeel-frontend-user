// One invoice (handoff §4.8): the facts, the payments on it and what the merchant can do now: pay online, or pay by
// transfer and upload the receipt. An invoice the merchant cannot see answers 404.
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/container";
import { InvoiceFacts } from "@/components/merchant/invoice-facts";
import { PageError } from "@/components/merchant/page-error";
import { ReceiptForm } from "@/components/merchant/receipt-form";
import { DetailSkeleton } from "@/components/merchant/skeletons";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { apiSessionGet } from "@/lib/api/server";
import type { InvoiceDetail, PaymentMethod } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { sitePath } from "@/lib/site-path";
import { fmt } from "@/lib/i18n/define";
import { common, statusLabel } from "@/lib/i18n/messages/common";
import { merchant } from "@/lib/i18n/messages/merchant";
import { isHttpUrl, labelOf } from "@/lib/merchant/format";
import { settle } from "@/lib/merchant/load";
import { PageTransition } from "@/components/layout/page-transition";

export function generateMetadata(): Metadata {
  const t = merchant;
  return { title: t.invoices.title };
}

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageTransition>
      <Suspense
        fallback={
          <div className="grid gap-6" aria-hidden="true">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-[5.5rem] rounded-card" />
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
              <DetailSkeleton rows={9} />
              <DetailSkeleton rows={5} />
            </div>
          </div>
        }
      >
        <InvoiceView params={params} />
      </Suspense>
    </PageTransition>
  );
}

async function InvoiceView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = merchant;
  const c = common;
  if (!/^[1-9]\d{0,15}$/.test(id)) notFound();
  const here = sitePath(`/merchant/invoices/${id}`);
  const result = await settle(apiSessionGet<InvoiceDetail>(`/client/invoices/${id}`));
  if (!result.ok) return <PageError error={result.error} next={here} notFoundOn404 title={t.invoices.title} />;
  const { invoice, payments, instructions, paymentUrl } = result.data;
  const i = t.invoice;

  const open = invoice.status === "open";
  const waiting = payments.some((p) => p.status === "pending");
  const online = open && Boolean(paymentUrl) && isHttpUrl(paymentUrl ?? "");
  const canUpload = open && !paymentUrl && !waiting;

  // A staff-issued invoice has no payment method yet: the merchant says which one was used (manual methods only).
  let methods: { id: number; name: string }[] = [];
  if (canUpload && !invoice.gateway) {
    const list = await settle(apiSessionGet<PaymentMethod[]>("/client/payment-methods"));
    if (list.ok) methods = list.data.filter((m) => m.kind === "manual").map((m) => ({ id: m.id, name: m.name }));
  }

  const methodTypes = i.methodTypes as Record<string, string>;
  const paymentStatus = i.paymentStatus as Record<string, string>;
  const cols = i.paymentColumns;

  return (
    <div className="grid gap-6">
      <Breadcrumbs
        label={c.workspace.breadcrumbLabel}
        items={[{ label: t.invoices.title, href: sitePath("/merchant/invoices") }, { label: invoice.number }]}
      />
      <PageHeader
        variant="card"
        title={fmt(i.title, { number: invoice.number })}
        description={invoice.description ?? (t.invoices.kinds as Record<string, string>)[invoice.kind]}
        actions={
          <>
            <StatusBadge kind="invoice" status={invoice.status} label={statusLabel(c, "invoice", invoice.status)} />
            {invoice.pdfFileId ? (
              <a href={`/client/files/${invoice.pdfFileId}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                <Download aria-hidden="true" />
                {t.invoices.downloadPdf}
              </a>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="grid min-w-0 gap-6">
          <Card>
            <CardHeader title={i.detailsTitle} />
            <CardBody>
              <InvoiceFacts invoice={invoice} t={t.invoices} c={c} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={i.paymentsTitle} />
            <div className="mt-4">
              {payments.length === 0 ? (
                <EmptyState compact title={i.paymentsEmpty} />
              ) : (
                <Table stacked caption={i.paymentsTitle}>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>{cols.date}</TableHeaderCell>
                      <TableHeaderCell numeric>{cols.amount}</TableHeaderCell>
                      <TableHeaderCell>{cols.method}</TableHeaderCell>
                      <TableHeaderCell>{cols.status}</TableHeaderCell>
                      <TableHeaderCell>{cols.reference}</TableHeaderCell>
                      <TableHeaderCell>{cols.receipt}</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <span className="whitespace-nowrap text-ink-muted">{formatDateTime(p.createdAt)}</span>
                        </TableCell>
                        <TableCell numeric label={cols.amount} className="font-semibold">
                          <Money amount={p.amount} currency={p.currency} />
                        </TableCell>
                        <TableCell label={cols.method}>{labelOf(methodTypes, p.methodType)}</TableCell>
                        <TableCell label={cols.status}>
                          <Badge tone={p.status === "approved" ? "success" : p.status === "rejected" ? "danger" : "warning"}>{labelOf(paymentStatus, p.status)}</Badge>
                        </TableCell>
                        <TableCell label={cols.reference}>
                          {p.reference ? (
                            <bdi dir="ltr" className="break-all">
                              {p.reference}
                            </bdi>
                          ) : (
                            <span className="text-ink-subtle">{t.shared.dash}</span>
                          )}
                        </TableCell>
                        <TableCell label={cols.receipt}>
                          {p.receiptFileId ? (
                            <a href={`/client/files/${p.receiptFileId}`} className="font-semibold text-ink underline underline-offset-4">
                              {i.receiptLink}
                            </a>
                          ) : (
                            <span className="text-ink-subtle">{t.shared.dash}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </div>

        <div className="grid min-w-0 gap-6 lg:sticky lg:top-4">
          {invoice.status === "paid" ? <Alert tone="success" title={i.paidTitle} /> : null}
          {invoice.status === "void" ? (
            <Alert tone="info" title={i.voidTitle}>
              {i.voidText}
            </Alert>
          ) : null}

          {online ? (
            <Card>
              <CardHeader title={i.payTitle} />
              <CardBody className="grid gap-4">
                <p className="text-body text-ink-muted">{i.payNowText}</p>
                {/* A plain link to the provider's page (an absolute URL from the API, checked to be http(s)). */}
                <a href={paymentUrl} className={buttonClasses({ size: "lg", block: true })}>
                  {i.payNow}
                </a>
              </CardBody>
            </Card>
          ) : null}

          {open && !paymentUrl && instructions ? (
            <Card>
              <CardHeader title={i.howToPay} description={i.howToPayText} />
              <CardBody className="grid gap-3">
                <p className="text-small font-semibold text-ink-muted">{i.instructions}</p>
                <p dir="auto" className="whitespace-pre-line break-words rounded-control bg-surface-muted p-3.5 text-body text-ink">
                  {instructions}
                </p>
                <div>
                  <CopyButton value={instructions} label={i.copyInstructions} />
                </div>
              </CardBody>
            </Card>
          ) : null}

          {open && !paymentUrl && waiting ? (
            <Alert tone="info" title={i.waitingTitle}>
              {i.waitingText}
            </Alert>
          ) : null}

          {canUpload ? (
            <Card>
              <CardHeader title={i.receiptTitle} description={i.receiptText} />
              <CardBody>
                <ReceiptForm
                  invoiceId={invoice.id}
                  methods={methods}
                  labels={i}
                  optionalLabel={t.form.optional}
                  upload={{
                    choose: t.form.fileChoose,
                    uploading: t.form.fileUploading,
                    remove: t.form.fileRemove,
                    tooLarge: t.form.fileTooLarge,
                    wrongType: t.form.fileWrongType,
                  }}
                />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
