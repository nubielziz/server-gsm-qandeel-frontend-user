// TopUpDetailView: the body of a top-up's page (plan F33, BH §3.3). Two columns from `lg`; on a phone the column with what the
// customer can do comes first. Left: the facts. Right: what the status means and, while it applies, what to do:
// - a manual top-up awaiting payment with no receipt: the transfer instructions (staff text, shown as text and copyable),
//   then the receipt form and Cancel (`TopUpActions`, a Client Component);
// - an automatic one awaiting payment: "Continue to payment" (`paymentUrl`, http or https only);
// - `in_review`, `credited`, `rejected` (with the reason, as text) and `cancelled`: a notice that says so.
// `instructions` and `rejectionReason` are written by staff: text nodes with their line breaks, never HTML.
// Server component, no hooks: the page passes the translated labels.
import { Ban, CircleCheck, CircleX, Clock } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { Money } from "@/components/ui/money";
import { StatusBadge } from "@/components/ui/status-badge";
import { TopUpActions } from "@/components/wallet/top-up-actions";
import type { TopUpDetail } from "@/lib/api/types";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import type { TopUpsMessages } from "@/lib/i18n/messages/top-ups";
import { isHttpUrl, ltr } from "@/lib/merchant/format";

export type TopUpDetailViewProps = {
  topUp: TopUpDetail;
  labels: TopUpsMessages["detail"];
  actions: TopUpsMessages["actions"];
  errors: TopUpsMessages["errors"];
  /** The translated status of the top-up (`common.status.topUp`). */
  statusLabel: string;
  hrefs: { wallet: string; addFunds: string };
};

export function TopUpDetailView({ topUp, labels: t, actions, errors, statusLabel, hrefs }: TopUpDetailViewProps) {
  const manual = topUp.method.kind === "manual";
  const awaiting = topUp.status === "awaiting_payment";
  // The same condition as the API's: a manual top-up with no receipt yet can still be paid or cancelled.
  const editable = manual && awaiting && !topUp.receiptUploaded;
  const payUrl = topUp.paymentUrl && isHttpUrl(topUp.paymentUrl) ? topUp.paymentUrl : null;
  const money = (amount: string) => <Money amount={amount} currency="USD" />;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div className="grid min-w-0 gap-6">
        <Card>
          <CardHeader title={t.factsTitle} />
          <CardBody>
            <DescriptionList>
              <DescriptionItem label={t.number}>
                <bdi dir="ltr">{topUp.number}</bdi>
              </DescriptionItem>
              <DescriptionItem label={t.method}>
                <span dir="auto">{topUp.method.name}</span>
              </DescriptionItem>
              <DescriptionItem label={t.status}>
                <StatusBadge kind="topUp" status={topUp.status} label={statusLabel} />
              </DescriptionItem>
              <DescriptionItem label={t.amount}>{money(topUp.amount)}</DescriptionItem>
              <DescriptionItem label={t.fee}>{money(topUp.fee)}</DescriptionItem>
              <DescriptionItem label={t.net} emphasis>
                {money(topUp.netAmount)}
              </DescriptionItem>
              {topUp.reference ? (
                <DescriptionItem label={t.reference}>
                  <bdi dir="ltr" className="break-all">
                    {topUp.reference}
                  </bdi>
                </DescriptionItem>
              ) : null}
              <DescriptionItem label={t.created}>{formatDateTime(topUp.createdAt)}</DescriptionItem>
              {topUp.creditedAt ? <DescriptionItem label={t.creditedAt}>{formatDateTime(topUp.creditedAt)}</DescriptionItem> : null}
            </DescriptionList>
          </CardBody>
        </Card>
      </div>

      <div className="grid min-w-0 gap-6 max-lg:order-first lg:sticky lg:top-4">
        {topUp.status === "in_review" ? (
          <Alert tone="info" icon={<Clock aria-hidden="true" />} title={manual ? t.inReviewManualTitle : t.inReviewOnlineTitle}>
            {manual ? t.inReviewManualText : t.inReviewOnlineText}
          </Alert>
        ) : null}

        {topUp.status === "credited" ? (
          <Alert tone="success" icon={<CircleCheck aria-hidden="true" />} title={t.creditedTitle}>
            <span className="block">
              {fmt(t.creditedText, {
                amount: ltr(formatMoney(topUp.netAmount, "USD")),
                date: formatDate(topUp.creditedAt ?? topUp.createdAt),
              })}
            </span>
            <span className="mt-3 block">
              <ButtonLink href={hrefs.wallet} variant="secondary" size="sm">
                {t.toWallet}
              </ButtonLink>
            </span>
          </Alert>
        ) : null}

        {topUp.status === "rejected" ? (
          <Alert tone="danger" icon={<CircleX aria-hidden="true" />} title={t.rejectedTitle}>
            <span className="block">{t.rejectedText}</span>
            {topUp.rejectionReason ? (
              <span className="mt-2 block">
                <span className="block font-semibold">{t.rejectedReason}</span>
                {/* Staff's words, as text: line breaks kept, no markup. */}
                <span dir="auto" className="block whitespace-pre-line break-words">
                  {topUp.rejectionReason}
                </span>
              </span>
            ) : null}
            <span className="mt-3 block">
              <ButtonLink href={hrefs.addFunds} variant="secondary" size="sm">
                {t.startNew}
              </ButtonLink>
            </span>
          </Alert>
        ) : null}

        {topUp.status === "cancelled" ? (
          <Alert tone="info" icon={<Ban aria-hidden="true" />} title={t.cancelledTitle}>
            <span className="block">{t.cancelledText}</span>
            <span className="mt-3 block">
              <ButtonLink href={hrefs.addFunds} variant="secondary" size="sm">
                {t.startNew}
              </ButtonLink>
            </span>
          </Alert>
        ) : null}

        {editable && topUp.instructions ? (
          <Card>
            <CardHeader title={t.instructionsTitle} description={t.instructionsText} />
            <CardBody className="grid gap-3">
              <p dir="auto" className="whitespace-pre-line break-words rounded-control bg-surface-muted p-3.5 text-body text-ink">
                {topUp.instructions}
              </p>
              <div>
                <CopyButton value={topUp.instructions} label={t.copyInstructions} />
              </div>
            </CardBody>
          </Card>
        ) : null}

        {!manual && awaiting ? (
          payUrl ? (
            <Card>
              <CardHeader title={t.continueTitle} />
              <CardBody className="grid gap-4">
                <p className="text-body text-ink-muted">{t.continueText}</p>
                {/* A plain link to the provider's page: an absolute URL from the API, checked to be http(s). */}
                <a href={payUrl} className={buttonClasses({ size: "lg", block: true })}>
                  {t.continue}
                </a>
              </CardBody>
            </Card>
          ) : (
            <Alert tone="info">{t.continueUnavailable}</Alert>
          )
        ) : null}

        {manual ? (
          <TopUpActions id={topUp.id} canReceipt={editable} canCancel={editable} labels={actions} errors={errors} />
        ) : null}
      </div>
    </div>
  );
}
