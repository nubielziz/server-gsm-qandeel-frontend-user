// The facts of an invoice as two label/value lists (billing details, amounts). Used by the preview panel of the list
// and by the detail page, so both read the same way (mockup "Invoice Preview").
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { Money } from "@/components/ui/money";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Invoice } from "@/lib/api/types";
import { formatDate, formatPercent } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { statusLabel, type CommonMessages } from "@/lib/i18n/messages/common";
import type { MerchantMessages } from "@/lib/i18n/messages/merchant";
import { labelOf } from "@/lib/merchant/format";

const isZero = (text: string) => /^0+(\.0+)?$/.test(text.trim());

export function InvoiceFacts({ invoice: inv, t, c }: { invoice: Invoice; t: MerchantMessages["invoices"]; c: CommonMessages }) {
  const kinds = t.kinds as Record<string, string>;
  const money = (amount: string) => <Money amount={amount} currency={inv.currency} />;
  return (
    <div className="grid gap-5">
      <section aria-labelledby={`inv-${inv.id}-billing`}>
        <h3 id={`inv-${inv.id}-billing`} className="text-subheading text-ink">
          {t.billing}
        </h3>
        <DescriptionList>
          <DescriptionItem label={t.columns.kind}>{labelOf(kinds, inv.kind)}</DescriptionItem>
          <DescriptionItem label={t.columns.status}>
            <StatusBadge kind="invoice" status={inv.status} label={statusLabel(c, "invoice", inv.status)} />
          </DescriptionItem>
          <DescriptionItem label={t.issued}>{formatDate(inv.createdAt)}</DescriptionItem>
          {inv.dueAt ? <DescriptionItem label={t.due}>{formatDate(inv.dueAt)}</DescriptionItem> : null}
          {inv.paidAt ? <DescriptionItem label={t.paid}>{formatDate(inv.paidAt)}</DescriptionItem> : null}
          {inv.gateway ? <DescriptionItem label={t.gateway}>{inv.gateway.name}</DescriptionItem> : null}
          {inv.description ? (
            <DescriptionItem label={t.descriptionLabel}>
              <span dir="auto">{inv.description}</span>
            </DescriptionItem>
          ) : null}
        </DescriptionList>
      </section>
      <section aria-labelledby={`inv-${inv.id}-amounts`}>
        <h3 id={`inv-${inv.id}-amounts`} className="text-subheading text-ink">
          {t.amounts}
        </h3>
        <DescriptionList>
          <DescriptionItem label={t.amount}>{money(inv.amount)}</DescriptionItem>
          <DescriptionItem label={t.fee}>{money(inv.fee)}</DescriptionItem>
          <DescriptionItem label={t.net}>{money(inv.netAmount)}</DescriptionItem>
          <DescriptionItem label={isZero(inv.taxRate) ? t.tax : fmt(t.taxWithRate, { rate: formatPercent(inv.taxRate) })}>{money(inv.taxAmount)}</DescriptionItem>
          <DescriptionItem label={t.total} emphasis>
            {money(inv.total)}
          </DescriptionItem>
        </DescriptionList>
      </section>
    </div>
  );
}
