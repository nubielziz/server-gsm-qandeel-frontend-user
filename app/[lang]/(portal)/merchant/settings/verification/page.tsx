// Verification (KYC): status, the latest submission with its documents, and the form to send documents.
// Works for pending merchants too (handoff §4.15). KYC is informational: it does not change the account status.
import { Suspense } from "react";
import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { apiSessionGet } from "@/lib/api/server";
import type { KycView } from "@/lib/api/types";
import { common, statusLabel } from "@/lib/i18n/messages/common";
import { merchantSettings } from "@/lib/i18n/messages/merchant-settings";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { formatBytes, utcDateTime } from "@/components/merchant-settings/format";
import { KycForm } from "@/components/merchant-settings/kyc-form";
import { LoadError, settle } from "@/components/merchant-settings/load";
import { CardSkeleton } from "@/components/merchant-settings/skeletons";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { StatusBadge } from "@/components/ui/status-badge";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(merchantSettings);
  return { title: t.layout.nav.verification };
}

export default function VerificationPage() {
  return (
    <Suspense
      fallback={
        <div className="grid gap-4">
          <CardSkeleton rows={2} footer={false} />
          <CardSkeleton rows={2} />
        </div>
      }
    >
      <VerificationContent />
    </Suspense>
  );
}

async function VerificationContent() {
  const locale = await getLocale();
  const [t, kyc] = await Promise.all([
    getMessages(merchantSettings),
    settle(locale, () => apiSessionGet<KycView>("/client/kyc")),
  ]);
  if (!kyc.ok) return <LoadError error={kyc.error} locale={locale} />;
  const { status, submission } = kyc.data;
  const v = t.verification;
  const canSend = status === "none" || status === "rejected";

  return (
    <div className="grid gap-4">
      <Card as="section">
        <CardHeader
          title={v.title}
          description={v.description}
          divided
          actions={<StatusBadge kind="kyc" status={status} label={statusLabel(common[locale], "kyc", status)} />}
        />
        <CardBody className="grid gap-4">
          <p className="text-body text-ink">{v.statusText[status]}</p>
          {status === "rejected" && submission?.note ? (
            <Alert tone="danger" title={v.rejectionNote}>
              <span dir="auto" className="whitespace-pre-line">
                {submission.note}
              </span>
            </Alert>
          ) : null}
          {submission ? (
            <>
              <DescriptionList>
                <DescriptionItem label={v.submitted}>{utcDateTime(submission.submittedAt, locale, t.utc)}</DescriptionItem>
                {submission.reviewedAt ? (
                  <DescriptionItem label={v.reviewed}>{utcDateTime(submission.reviewedAt, locale, t.utc)}</DescriptionItem>
                ) : null}
              </DescriptionList>
              <div>
                <h3 className="text-subheading text-ink">{v.documents}</h3>
                {submission.documents.length === 0 ? (
                  <p className="mt-1 text-body text-ink-muted">{v.noDocuments}</p>
                ) : (
                  <ul className="mt-2 divide-y divide-line rounded-card border border-line">
                    {submission.documents.map((d) => (
                      <li key={d.fileId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <FileText aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
                          <span className="min-w-0 truncate text-body font-medium text-ink" dir="auto">
                            {d.filename}
                          </span>
                          <span className="num shrink-0 text-small text-ink-subtle">{formatBytes(d.size)}</span>
                        </span>
                        {/* A plain link: the API answers 302 to a short-lived download address (handoff §3.13). */}
                        <a
                          href={`/client/files/${d.fileId}`}
                          className="inline-flex min-h-11 items-center text-small font-semibold text-ink underline underline-offset-4"
                        >
                          {v.download}
                          <span className="sr-only"> {d.filename}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
          <Alert tone="info">{v.informational}</Alert>
        </CardBody>
      </Card>
      {canSend ? <KycForm again={status === "rejected"} t={v} fieldTexts={t.fieldErrors} optional={t.optional} /> : null}
    </div>
  );
}
