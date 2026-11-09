"use client";
// Attach a transfer receipt to an open manual invoice (handoff §4.8 #32). The file is uploaded first
// (`POST /client/files`, PDF/JPEG/PNG), then attached with an optional reference; the payment appears as "pending
// review". `gatewayId` is sent only for an invoice that has no payment method yet (a staff-issued one).
// 409 CONFLICT = not open, paid online, or a receipt is already waiting: explained, then the page is refreshed.
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import type { UploadedFile } from "@/lib/api/types";
import { useErrorText } from "@/lib/i18n/error-text";
import { leaveIfSignedOut } from "@/lib/merchant/signed-out";
import type { MerchantMessages } from "@/lib/i18n/messages/merchant";
import { FileUpload } from "@/components/forms/file-upload";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

const ACCEPT = ["application/pdf", "image/jpeg", "image/png"];

export type ReceiptFormProps = {
  invoiceId: number;
  /** Payment methods to choose from; empty when the invoice already has one. */
  methods: { id: number; name: string }[];
  labels: MerchantMessages["invoice"];
  upload: { choose: string; uploading: string; remove: string; tooLarge: string; wrongType: string };
  optionalLabel: string;
};

export function ReceiptForm({ invoiceId, methods, labels: t, upload, optionalLabel }: ReceiptFormProps) {
  const router = useRouter();
  const errorText = useErrorText();
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [reference, setReference] = useState("");
  const [gatewayId, setGatewayId] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ tone: "danger" | "warning"; title?: string; text: string } | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  const needsMethod = methods.length > 0;
  const fileError = serverErrors.fileId ?? (submitted && !file ? t.receiptRequired : undefined);
  const methodError = serverErrors.gatewayId ?? (submitted && needsMethod && !gatewayId ? t.methodRequired : undefined);
  const referenceError = serverErrors.reference;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitted(true);
    setAlert(null);
    setServerErrors({});
    if (!file) {
      document.getElementById("receipt-file")?.focus();
      return;
    }
    if (needsMethod && !gatewayId) {
      document.getElementById("receipt-method")?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const body: { fileId: number; reference?: string; gatewayId?: number } = { fileId: file.id };
      if (reference.trim()) body.reference = reference.trim();
      if (needsMethod) body.gatewayId = Number(gatewayId);
      await api.post(`/client/invoices/${invoiceId}/receipt`, body);
      toast.success(t.sent, t.sentText);
      router.refresh(); // the page now shows the pending payment instead of this form
    } catch (e) {
      setSubmitting(false);
      if (leaveIfSignedOut(e, router)) return;
      if (isApiError(e) && e.code === "CONFLICT") {
        setAlert({ tone: "warning", title: t.conflictTitle, text: t.conflictText });
        router.refresh();
        return;
      }
      if (isApiError(e) && e.status === 422 && e.fieldErrors.length > 0) {
        const next: Record<string, string> = {};
        for (const fe of e.fieldErrors) next[fe.field] ??= errorText.field(fe) ?? "";
        setServerErrors(next);
        return;
      }
      setAlert({ tone: "danger", text: [errorText.message(e), errorText.reference(e)].filter(Boolean).join(" ") });
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={submitting || undefined} className="grid gap-5">
      {alert ? (
        <Alert tone={alert.tone} title={alert.title}>
          {alert.text}
        </Alert>
      ) : null}
      <div id="receipt-file" tabIndex={-1} className="grid gap-2 focus:outline-none">
        <FileUpload
          required
          max={1}
          accept={ACCEPT}
          disabled={submitting}
          onChange={(files) => setFile(files[0] ?? null)}
          labels={{
            label: t.receiptFile,
            choose: upload.choose,
            hint: t.receiptHint,
            uploading: upload.uploading,
            remove: upload.remove,
            tooLarge: upload.tooLarge,
            wrongType: upload.wrongType,
          }}
        />
        {fileError ? (
          <p role="alert" className="text-small font-medium text-danger-ink">
            {fileError}
          </p>
        ) : null}
      </div>
      {needsMethod ? (
        <Select
          id="receipt-method"
          name="gatewayId"
          label={t.method}
          required
          value={gatewayId}
          onChange={(e) => setGatewayId(e.target.value)}
          placeholder={t.methodPlaceholder}
          options={methods.map((m) => ({ value: String(m.id), label: m.name }))}
          error={methodError}
        />
      ) : null}
      <Input
        id="receipt-reference"
        name="reference"
        label={t.reference}
        optionalLabel={optionalLabel}
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        maxLength={64}
        autoComplete="off"
        dir="ltr"
        hint={t.referenceHint}
        error={referenceError}
      />
      <Button type="submit" size="lg" block loading={submitting} aria-label={submitting ? t.sending : undefined}>
        {t.submit}
      </Button>
    </form>
  );
}
