"use client";
// Cancel and Verify on an order of a merchant rank (handoff §4.6). The buttons exist only when the API says the action would be accepted
// (`canCancel` / `canVerify`). Cancel asks for confirmation in a modal; both end with `router.refresh()` so the page
// shows the new state. A "stale state" answer (ORDER_NOT_OPEN, ALREADY_SENT, INVALID_TRANSITION, ORDER_NOT_COMPLETED)
// refreshes too: the buttons then disappear because the order has moved on.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Ban } from "lucide-react";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { useErrorText } from "@/lib/i18n/error-text";
import { leaveIfSignedOut } from "@/lib/merchant/signed-out";
import type { MerchantMessages } from "@/lib/i18n/messages/merchant";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

const STALE = new Set(["ORDER_NOT_OPEN", "ALREADY_SENT", "INVALID_TRANSITION", "ORDER_NOT_COMPLETED"]);

export function OrderActions({ orderId, canCancel, canVerify, labels }: { orderId: number; canCancel: boolean; canVerify: boolean; labels: MerchantMessages["order"] }) {
  const router = useRouter();
  const errorText = useErrorText();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"cancel" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function fail(e: unknown) {
    if (leaveIfSignedOut(e, router)) return;
    const text = [errorText.message(e), errorText.reference(e)].filter(Boolean).join(" ");
    setError(text);
    if (isApiError(e) && STALE.has(e.code)) router.refresh();
  }

  async function cancel() {
    setBusy("cancel");
    setError(null);
    try {
      await api.post(`${FAMILY_ROUTES.client.orders}/${orderId}/cancel`, {});
      setConfirming(false);
      toast.success(labels.cancelled, labels.cancelledText);
      router.refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function verify() {
    setBusy("verify");
    setError(null);
    try {
      await api.post(`${FAMILY_ROUTES.client.orders}/${orderId}/verify`, {});
      toast.success(labels.verified);
      router.refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  if (!canCancel && !canVerify) return <p className="text-body text-ink-muted">{labels.noActions}</p>;

  return (
    <div className="grid gap-4">
      {error && !confirming ? <Alert tone="danger">{error}</Alert> : null}
      {canVerify ? (
        <div className="grid gap-2">
          <p className="text-small text-ink-subtle">{labels.verifyHint}</p>
          <Button variant="secondary" loading={busy === "verify"} onClick={verify} startIcon={<BadgeCheck aria-hidden="true" />} aria-label={busy === "verify" ? labels.verifying : undefined}>
            {labels.verify}
          </Button>
        </div>
      ) : null}
      {canCancel ? (
        <>
          <Button variant="danger" onClick={() => { setError(null); setConfirming(true); }} startIcon={<Ban aria-hidden="true" />}>
            {labels.cancel}
          </Button>
          <Modal
            open={confirming}
            onClose={() => setConfirming(false)}
            size="md"
            title={labels.cancelTitle}
            footer={
              <>
                <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy === "cancel"}>
                  {labels.cancelKeep}
                </Button>
                <Button variant="danger" loading={busy === "cancel"} onClick={cancel} aria-label={busy === "cancel" ? labels.cancelling : undefined}>
                  {labels.cancelConfirm}
                </Button>
              </>
            }
          >
            <p className="text-body text-ink-muted">{labels.cancelText}</p>
            {error ? (
              <Alert tone="danger" className="mt-4">
                {error}
              </Alert>
            ) : null}
          </Modal>
        </>
      ) : null}
    </div>
  );
}
