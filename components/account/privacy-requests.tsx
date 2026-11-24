"use client";
// PrivacyRequests: ask for a copy of the data we hold (`POST /store/v1/me/data-export`, every account) or for it to be
// erased (`POST /store/v1/me/data-delete`, behind a confirmation, the retail rank only). Both create a request that staff
// handle by hand within 30 days; asking again while one is open returns the same request. No route lists past requests
// and none delivers the export, so the page shows the request that comes back and says plainly that our team follows up
// by email. A merchant rank is not offered erasure: the card says to ask the team to move the account to the retail rank
// first, and no request is sent (the API would refuse it with the same words).
import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { ACCOUNT_ROUTES } from "@/lib/account/routes";
import { api } from "@/lib/api/browser";
import type { DataRequest } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { useErrorText } from "@/lib/i18n/error-text";
import type { AccountMessages } from "@/lib/i18n/messages/account";
import type { CommonMessages } from "@/lib/i18n/messages/common";
import { FormAlert } from "@/components/auth/form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "@/components/auth/form-errors";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { Modal } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";

export type DataRequestKind = "export" | "erasure";

/**
 * The route a request goes to, or null when the account may not send it: a copy of the data is open to every account, erasure
 * only when `canErase` (the retail rank). Null is the one place that keeps an erasure from being sent by a merchant rank.
 */
export function dataRequestRoute(kind: DataRequestKind, canErase: boolean): string | null {
  if (kind === "export") return ACCOUNT_ROUTES.dataExport;
  return canErase ? ACCOUNT_ROUTES.dataDelete : null;
}

/** Sends a request and returns the one that comes back, or null (and sends nothing) when the account may not send it. */
export async function sendDataRequest(kind: DataRequestKind, canErase: boolean): Promise<DataRequest | null> {
  const route = dataRequestRoute(kind, canErase);
  return route ? api.post<DataRequest>(route) : null;
}

export type PrivacyRequestsProps = {
  t: AccountMessages["settings"]["privacy"];
  /** `common` messages that the request status label needs. */
  requestStatus: CommonMessages["status"]["request"];
  /** The retail rank may ask for erasure; a merchant rank sees a sentence in place of the button. */
  canErase: boolean;
  /** Where "Contact support" leads in the sentence a merchant rank sees. */
  supportHref: string;
};

export function PrivacyRequests({ t, requestStatus, canErase, supportHref }: PrivacyRequestsProps) {
  const errorText = useErrorText();
  const [busy, setBusy] = useState<"export" | "erasure" | null>(null);
  const [request, setRequest] = useState<DataRequest | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);

  async function send(kind: DataRequestKind) {
    if (busy) return;
    setBusy(kind);
    setFeedback(NO_FEEDBACK);
    try {
      const created = await sendDataRequest(kind, canErase);
      if (!created) {
        setConfirming(false);
        return;
      }
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
            {canErase ? <p className="mt-1 text-body text-ink-muted">{t.erase.text}</p> : null}
          </div>
          {canErase ? (
            <Button
              variant="secondary"
              className="mt-auto self-start"
              startIcon={<Trash2 aria-hidden="true" />}
              onClick={() => setConfirming(true)}
            >
              {t.erase.action}
            </Button>
          ) : (
            <>
              <p className="text-body font-medium text-ink">{t.erase.merchantRank}</p>
              <ButtonLink href={supportHref} variant="secondary" className="mt-auto self-start">
                {t.erase.merchantAction}
              </ButtonLink>
            </>
          )}
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

      {/* A merchant rank is never offered erasure, so it has no confirmation dialog either. */}
      {canErase ? (
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
      ) : null}
    </div>
  );
}
