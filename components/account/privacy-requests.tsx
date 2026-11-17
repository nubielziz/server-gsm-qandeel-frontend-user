"use client";
// PrivacyRequests: ask for a copy of the data we hold (`POST /store/v1/me/data-export`) or for it to be erased
// (`POST /store/v1/me/data-delete`, behind a confirmation). Both create a request that staff handle by hand within 30
// days; asking again while one is open returns the same request. No route lists past requests and none delivers the
// export, so the page shows the request that comes back and says plainly that our team follows up by email.
import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { api } from "@/lib/api/browser";
import type { DataRequest } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { useErrorText } from "@/lib/i18n/error-text";
import type { AccountMessages } from "@/lib/i18n/messages/account";
import type { CommonMessages } from "@/lib/i18n/messages/common";
import { FormAlert } from "@/components/auth/form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "@/components/auth/form-errors";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { Modal } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";

export type PrivacyRequestsProps = {
  t: AccountMessages["settings"]["privacy"];
  /** `common` messages that the request status label needs. */
  requestStatus: CommonMessages["status"]["request"];
};

export function PrivacyRequests({ t, requestStatus }: PrivacyRequestsProps) {
  const errorText = useErrorText();
  const [busy, setBusy] = useState<"export" | "erasure" | null>(null);
  const [request, setRequest] = useState<DataRequest | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);

  async function send(kind: "export" | "erasure") {
    if (busy) return;
    setBusy(kind);
    setFeedback(NO_FEEDBACK);
    try {
      const created = await api.post<DataRequest>(kind === "export" ? "/store/v1/me/data-export" : "/store/v1/me/data-delete");
      setRequest(created);
      setConfirming(false);
      toast.success(t.received);
    } catch (error) {
      setFeedback(feedbackFrom(error, errorText, []));
      setConfirming(false);
    } finally {
      setBusy(null);
    }
  }

  const statusText = (status: string) => (requestStatus as Record<string, string>)[status] ?? status;

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-card border border-line p-4">
          <div>
            <h3 className="text-subheading text-ink">{t.export.title}</h3>
            <p className="mt-1 text-body text-ink-muted">{t.export.text}</p>
          </div>
          <Button
            variant="secondary"
            className="mt-auto self-start"
            startIcon={<Download aria-hidden="true" />}
            loading={busy === "export"}
            onClick={() => send("export")}
          >
            {t.export.action}
          </Button>
        </div>
        <div className="flex flex-col gap-3 rounded-card border border-line p-4">
          <div>
            <h3 className="text-subheading text-ink">{t.erase.title}</h3>
            <p className="mt-1 text-body text-ink-muted">{t.erase.text}</p>
          </div>
          <Button
            variant="secondary"
            className="mt-auto self-start"
            startIcon={<Trash2 aria-hidden="true" />}
            onClick={() => setConfirming(true)}
          >
            {t.erase.action}
          </Button>
        </div>
      </div>

      <p className="text-small text-ink-subtle">{t.followUp}</p>
      <FormAlert message={feedback.message} reference={feedback.reference} />

      {request ? (
        <Alert tone="success" title={`${t.received}: ${t.requestKind[request.kind]}`}>
          <DescriptionList className="mt-2">
            <DescriptionItem label={t.status}>
              <StatusBadge kind="request" status={request.status} label={statusText(request.status)} />
            </DescriptionItem>
            <DescriptionItem label={t.requestedOn}>{formatDate(request.requestedAt)}</DescriptionItem>
            <DescriptionItem label={t.dueBy}>{formatDate(request.dueAt)}</DescriptionItem>
          </DescriptionList>
        </Alert>
      ) : null}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t.erase.confirmTitle}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {t.erase.cancel}
            </Button>
            <Button variant="danger" loading={busy === "erasure"} onClick={() => send("erasure")}>
              {t.erase.confirm}
            </Button>
          </>
        }
      >
        <p className="text-body text-ink-muted">{t.erase.confirmText}</p>
      </Modal>
    </div>
  );
}
