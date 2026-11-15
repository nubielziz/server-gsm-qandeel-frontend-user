"use client";
// What a customer can do with a manual top-up that still awaits payment (plan F33, BH §3.3): send the transfer receipt
// (a PDF, JPEG or PNG up to 5 MiB goes to `POST /store/v1/files`, then `POST …/receipt { fileId, reference? }` moves the
// top-up to `in_review`) or cancel it (`POST …/cancel`, no body, only while no receipt was sent).
// Both POSTs carry an `Idempotency-Key` from `createIdempotencyKeys` (one store each): the same key for the same request
// (a double click, a retry), a new one when the file or the reference changes, forgotten after a success and after 409
// IDEMPOTENCY_KEY_REUSED. A 409 CONFLICT means the top-up moved on meanwhile (credited, closed or reviewed): the text says
// so and the page is refreshed; it stays here because the refreshed page no longer offers these buttons. A signed-out
// answer refreshes the route; every other refusal is shown and never signs anyone out.
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { Ban } from "lucide-react";
import { api, forgetCsrf } from "@/lib/api/browser";
import { createIdempotencyKeys } from "@/lib/api/idempotency";
import type { UploadedFile } from "@/lib/api/types";
import type { Locale } from "@/lib/i18n/config";
import { useErrorText } from "@/lib/i18n/error-text";
import type { TopUpsMessages } from "@/lib/i18n/messages/top-ups";
import { isSignedOutError } from "@/lib/merchant/signed-out";
import { topUpErrorText, type TopUpAction } from "@/lib/wallet/top-up-errors";
import { FileUpload } from "@/components/forms/file-upload";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

const ACCEPT = ["application/pdf", "image/jpeg", "image/png"];
const FILE_ID = "receipt-file";

export type TopUpActionsProps = {
  /** The top-up's id (a number in the API; the path never needs more than digits). */
  id: number;
  /** A manual top-up that awaits payment and has no receipt yet: the receipt form shows. */
  canReceipt: boolean;
  /** The same condition: the cancel button shows. */
  canCancel: boolean;
  locale: Locale;
  labels: TopUpsMessages["actions"];
  errors: TopUpsMessages["errors"];
};

type Failure = { message: string; reference?: string };

export function TopUpActions({ id, canReceipt, canCancel, locale, labels: t, errors }: TopUpActionsProps) {
  const router = useRouter();
  const errorText = useErrorText();
  const [receiptKeys] = useState(() => createIdempotencyKeys());
  const [cancelKeys] = useState(() => createIdempotencyKeys());
  const sending = useRef(false);
  const cancelling = useRef(false);
  const errorBox = useRef<HTMLDivElement>(null);

  const [file, setFile] = useState<UploadedFile | null>(null);
  const [reference, setReference] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState<"send" | "cancel" | null>(null);
  const [sent, setSent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ fileId?: string; reference?: string }>({});
  const [formError, setFormError] = useState<Failure | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cancelError, setCancelError] = useState<Failure | null>(null);
  const [stale, setStale] = useState<string | null>(null);

  const fileError = fieldErrors.fileId ?? (submitted && !file ? t.receiptRequired : undefined);

  /** The text of a failure of `action`; null when the session ended (the route was refreshed and nothing is left to show). */
  function explain(error: unknown, action: TopUpAction) {
    if (isSignedOutError(error)) {
      forgetCsrf("store");
      router.refresh();
      return null;
    }
    return topUpErrorText(error, { action, generic: errorText, t: errors, locale });
  }

  async function onSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A ref, not state: a second click can arrive before React has re-rendered the disabled button.
    if (sending.current || sent) return;
    setSubmitted(true);
    setFieldErrors({});
    setFormError(null);
    setStale(null);
    if (!file) {
      document.getElementById(FILE_ID)?.focus();
      return;
    }
    const note = reference.trim();
    sending.current = true;
    setBusy("send");
    try {
      await api.post(
        `/store/v1/me/wallet/top-ups/${id}/receipt`,
        note ? { fileId: file.id, reference: note } : { fileId: file.id },
        { idempotencyKey: receiptKeys.keyFor(JSON.stringify([file.id, note])) },
      );
      receiptKeys.reset();
      setSent(true);
      toast.success(t.sent, t.sentText);
      router.refresh(); // the page now shows the top-up in review instead of this form
    } catch (error) {
      sending.current = false;
      const result = explain(error, "receipt");
      if (!result) {
        setBusy(null);
        return;
      }
      if (result.forgetKey) receiptKeys.reset();
      if (result.refresh) {
        setBusy(null);
        setStale(result.text);
        router.refresh();
        return;
      }
      // The error is committed to the DOM (flushSync) before focus moves: the reference input is disabled while sending and
      // the form's alert only exists once `formError` is set, so a focus call in a frame callback could run too early.
      if (result.field === "fileId" || result.field === "reference") {
        const field = result.field;
        flushSync(() => {
          setBusy(null);
          setFieldErrors({ [field]: result.text });
        });
        document.getElementById(field === "fileId" ? FILE_ID : "receipt-reference")?.focus();
        return;
      }
      flushSync(() => {
        setBusy(null);
        setFormError({ message: result.text, reference: errorText.reference(error) });
      });
      errorBox.current?.focus();
    }
  }

  async function onCancel() {
    if (cancelling.current) return;
    cancelling.current = true;
    setBusy("cancel");
    setCancelError(null);
    try {
      await api.post(`/store/v1/me/wallet/top-ups/${id}/cancel`, undefined, { idempotencyKey: cancelKeys.keyFor("cancel") });
      cancelKeys.reset();
      setConfirming(false);
      toast.success(t.cancelled);
      router.refresh(); // the page now shows the top-up as cancelled
    } catch (error) {
      cancelling.current = false;
      setBusy(null);
      const result = explain(error, "cancel");
      if (!result) return;
      if (result.forgetKey) cancelKeys.reset();
      if (result.refresh) {
        setConfirming(false);
        setStale(result.text);
        router.refresh();
        return;
      }
      setCancelError({ message: result.text, reference: errorText.reference(error) });
    }
  }

  if (!canReceipt && !canCancel && !stale) return null;

  return (
    <div className="grid gap-6">
      {stale ? (
        <Alert tone="warning" title={t.staleTitle}>
          {stale}
        </Alert>
      ) : null}

      {canReceipt ? (
        <Card>
          <CardHeader title={t.receiptTitle} description={t.receiptText} />
          <CardBody>
            <form onSubmit={onSend} noValidate aria-busy={busy === "send" || undefined} className="grid gap-5">
              {formError ? (
                <Alert ref={errorBox} tabIndex={-1} tone="danger" className="focus:outline-none">
                  {formError.message}
                  {formError.reference ? <span className="num mt-1 block text-small">{formError.reference}</span> : null}
                </Alert>
              ) : null}
              <div id={FILE_ID} tabIndex={-1} className="grid gap-2 focus:outline-none">
                <FileUpload
                  required
                  max={1}
                  accept={ACCEPT}
                  endpoint="/store/v1/files"
                  disabled={busy === "send" || sent}
                  onChange={(files) => {
                    setFile(files[0] ?? null);
                    setFieldErrors((prev) => ({ ...prev, fileId: undefined }));
                  }}
                  labels={{
                    label: t.receiptFile,
                    choose: t.fileChoose,
                    hint: t.receiptHint,
                    uploading: t.fileUploading,
                    remove: t.fileRemove,
                    tooLarge: t.fileTooLarge,
                    wrongType: t.fileWrongType,
                  }}
                />
                {fileError ? (
                  <p role="alert" className="text-small font-medium text-danger-ink">
                    {fileError}
                  </p>
                ) : null}
              </div>
              <Input
                id="receipt-reference"
                name="reference"
                label={t.reference}
                optionalLabel={t.optional}
                value={reference}
                onChange={(event) => {
                  setReference(event.target.value);
                  setFieldErrors((prev) => ({ ...prev, reference: undefined }));
                }}
                maxLength={64}
                autoComplete="off"
                dir="ltr"
                disabled={busy === "send" || sent}
                hint={t.referenceHint}
                error={fieldErrors.reference}
              />
              {sent ? (
                <Alert tone="success" title={t.sent}>
                  {t.sentText}
                </Alert>
              ) : (
                <Button type="submit" size="lg" block loading={busy === "send"} aria-label={busy === "send" ? t.sending : undefined}>
                  {t.send}
                </Button>
              )}
            </form>
          </CardBody>
        </Card>
      ) : null}

      {canCancel ? (
        <Card>
          <CardHeader title={t.cancelTitle} description={t.cancelText} />
          <CardBody>
            <Button
              variant="secondary"
              startIcon={<Ban aria-hidden="true" />}
              onClick={() => {
                setCancelError(null);
                setConfirming(true);
              }}
            >
              {t.cancel}
            </Button>
            <Modal
              open={confirming}
              onClose={() => setConfirming(false)}
              size="md"
              title={t.confirmTitle}
              footer={
                <>
                  <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy === "cancel"}>
                    {t.keep}
                  </Button>
                  <Button variant="danger" loading={busy === "cancel"} onClick={onCancel} aria-label={busy === "cancel" ? t.cancelling : undefined}>
                    {t.confirm}
                  </Button>
                </>
              }
            >
              <p className="text-body text-ink-muted">{t.confirmText}</p>
              {cancelError ? (
                <Alert tone="danger" className="mt-4">
                  {cancelError.message}
                  {cancelError.reference ? <span className="num mt-1 block text-small">{cancelError.reference}</span> : null}
                </Alert>
              ) : null}
            </Modal>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
