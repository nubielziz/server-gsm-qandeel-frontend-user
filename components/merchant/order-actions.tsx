"use client";
// Cancel and Verify on an order of a merchant rank (handoff §4.6; shop decision 010). Two places draw them, with one flow
// between them (lib/merchant/order-actions.ts `runOrderAction`):
// - `OrderActions`: the Actions card of the order's own page, with the sentence that says until when a button is there, or why
//   it is not;
// - `OrderRowActions`: the small buttons of a row of the orders list.
// The buttons exist only when the API says the action would be accepted (`canCancel` / `canVerify`). Cancel asks for
// confirmation in a modal; both end with `router.refresh()` so the screen shows the new state. A "stale state" answer
// refreshes too: the buttons then disappear because the order has moved on. While a modal is open or a request runs the
// buttons hold the page's own refreshes (lib/merchant/order-refresh.ts).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Ban } from "lucide-react";
import { useErrorText } from "@/lib/i18n/error-text";
import { fmt } from "@/lib/i18n/define";
import type { MerchantMessages } from "@/lib/i18n/messages/merchant";
import { runOrderAction, type OrderActionKind, type OrderActionNotes } from "@/lib/merchant/order-actions";
import { holdOrderRefresh } from "@/lib/merchant/order-refresh";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

type OrderLabels = MerchantMessages["order"];

/**
 * The state and the two presses shared by the page's card and a list row.
 *
 * @param errorsAsToast a failed Verify shows as a toast (a list row has no room for a message); a failed Cancel always
 *   shows inside its modal
 */
function useOrderActions(orderId: number, labels: OrderLabels, errorsAsToast: boolean) {
  const router = useRouter();
  const errorText = useErrorText();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<OrderActionKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A modal that is open or a request that runs keeps the page from refreshing itself under the visitor's hand.
  const held = confirming || busy !== null;
  useEffect(() => (held ? holdOrderRefresh() : undefined), [held]);

  async function run(kind: OrderActionKind) {
    setBusy(kind);
    setError(null);
    const outcome = await runOrderAction(kind, orderId, {
      router,
      errorMessage: (e) => [errorText.message(e), errorText.reference(e)].filter(Boolean).join(" "),
      notify: (title, text) => toast.success(title, text),
      labels,
    });
    setBusy(null);
    if (outcome.ok) setConfirming(false);
    else if (outcome.message) {
      if (kind === "verify" && errorsAsToast) toast.error(outcome.message);
      else setError(outcome.message);
    }
  }

  return {
    busy,
    error,
    confirming,
    askToCancel: () => {
      setError(null);
      setConfirming(true);
    },
    keepOrder: () => setConfirming(false),
    cancel: () => run("cancel"),
    verify: () => run("verify"),
  };
}

type Actions = ReturnType<typeof useOrderActions>;

/** The confirmation of a cancel: what it does, "keep" and "yes, cancel", and the error of a failed try. */
function CancelModal({ title, labels, a }: { title: string; labels: OrderLabels; a: Actions }) {
  return (
    <Modal
      open={a.confirming}
      onClose={a.keepOrder}
      size="md"
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={a.keepOrder} disabled={a.busy === "cancel"}>
            {labels.cancelKeep}
          </Button>
          <Button variant="danger" loading={a.busy === "cancel"} onClick={a.cancel} aria-label={a.busy === "cancel" ? labels.cancelling : undefined}>
            {labels.cancelConfirm}
          </Button>
        </>
      }
    >
      <p className="text-body text-ink-muted">{labels.cancelText}</p>
      {a.error ? (
        <Alert tone="danger" className="mt-4">
          {a.error}
        </Alert>
      ) : null}
    </Modal>
  );
}

/**
 * The Actions card of an order's page.
 *
 * @param notes the sentences under the buttons (`orderActionNotes`, worked out on the server): until when a button is there,
 *   or why it is not. "No actions are available" shows only when there is no button and no sentence.
 */
export function OrderActions({
  orderId,
  canCancel,
  canVerify,
  notes = { cancel: null, verify: null },
  labels,
}: {
  orderId: number;
  canCancel: boolean;
  canVerify: boolean;
  notes?: OrderActionNotes;
  labels: OrderLabels;
}) {
  const a = useOrderActions(orderId, labels, false);

  if (!canCancel && !canVerify && !notes.cancel && !notes.verify) return <p className="text-body text-ink-muted">{labels.noActions}</p>;

  return (
    <div className="grid gap-4">
      {a.error && !a.confirming ? <Alert tone="danger">{a.error}</Alert> : null}
      {canVerify ? (
        <div className="grid gap-2">
          <p className="text-small text-ink-subtle">{labels.verifyHint}</p>
          <Button variant="secondary" loading={a.busy === "verify"} onClick={a.verify} startIcon={<BadgeCheck aria-hidden="true" />} aria-label={a.busy === "verify" ? labels.verifying : undefined}>
            {labels.verify}
          </Button>
          {notes.verify ? <p className="text-small text-ink-subtle">{notes.verify}</p> : null}
        </div>
      ) : notes.verify ? (
        <p className="text-small text-ink-muted">{notes.verify}</p>
      ) : null}
      {canCancel ? (
        <div className="grid gap-2">
          <Button variant="danger" onClick={a.askToCancel} startIcon={<Ban aria-hidden="true" />}>
            {labels.cancel}
          </Button>
          {notes.cancel ? <p className="text-small text-ink-subtle">{notes.cancel}</p> : null}
          <CancelModal title={labels.cancelTitle} labels={labels} a={a} />
        </div>
      ) : notes.cancel ? (
        <p className="text-small text-ink-muted">{notes.cancel}</p>
      ) : null}
    </div>
  );
}

/**
 * The buttons of one row of the orders list: a small "Cancel" when `canCancel` and a small "Verify" when `canVerify`. They do
 * what the order page's buttons do. Cancel keeps its confirmation modal (the modal belongs to the top layer, so the row's link
 * never sees its clicks); a failed Verify shows as a toast. Draw it only for a row that has a button.
 *
 * @param labels the texts of an order (`merchant.order`)
 * @param row the texts of a row's buttons (`merchant.orders.actions`)
 */
export function OrderRowActions({
  orderId,
  canCancel,
  canVerify,
  labels,
  row,
}: {
  orderId: number;
  canCancel: boolean;
  canVerify: boolean;
  labels: OrderLabels;
  row: MerchantMessages["orders"]["actions"];
}) {
  const a = useOrderActions(orderId, labels, true);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canVerify ? (
        <Button
          variant="secondary"
          size="sm"
          loading={a.busy === "verify"}
          onClick={a.verify}
          startIcon={<BadgeCheck aria-hidden="true" />}
          aria-label={a.busy === "verify" ? labels.verifying : fmt(row.verifyLabel, { id: orderId })}
        >
          {row.verify}
        </Button>
      ) : null}
      {canCancel ? (
        <>
          <Button variant="secondary" size="sm" onClick={a.askToCancel} startIcon={<Ban aria-hidden="true" />} aria-label={fmt(row.cancelLabel, { id: orderId })}>
            {row.cancel}
          </Button>
          <CancelModal title={fmt(row.cancelTitle, { id: orderId })} labels={labels} a={a} />
        </>
      ) : null}
    </div>
  );
}
