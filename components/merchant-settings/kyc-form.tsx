"use client";
// Send verification documents (POST /client/kyc {fileIds 1–5, note ≤ 500}). Files are uploaded first through
// <FileUpload> (POST /client/files); the ids are submitted here. 409 (under review / already approved) refreshes the
// page so it shows the real state.
import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import type { KycView, UploadedFile } from "@/lib/api/types";
import type { MerchantSettingsMessages } from "@/lib/i18n/messages/merchant-settings";
import { FileUpload } from "@/components/forms/file-upload";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ProblemAlert, useFocusFirstInvalid, useFormProblem } from "./form-problem";

const ACCEPT = ["application/pdf", "image/jpeg", "image/png"];

type Props = {
  /** The last request was rejected: the card says "send new documents". */
  again: boolean;
  t: MerchantSettingsMessages["verification"];
  fieldTexts: MerchantSettingsMessages["fieldErrors"];
  optional: string;
};

export function KycForm({ again, t, fieldTexts, optional }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const { problem, fail, failFields, clear } = useFormProblem(fieldTexts);
  useFocusFirstInvalid(formRef, problem);
  const busy = saving || refreshing;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (files.length === 0) {
      failFields({ fileIds: t.noFiles });
      return;
    }
    clear();
    setSaving(true);
    try {
      const body: { fileIds: number[]; note?: string } = { fileIds: files.map((f) => f.id) };
      if (note.trim()) body.note = note.trim();
      await api.post<KycView>("/client/kyc", body);
      toast.success(t.sent);
      startRefresh(() => router.refresh());
    } catch (error) {
      if (isApiError(error) && (error.code === "CONFLICT" || error.code === "ALREADY_DECIDED")) startRefresh(() => router.refresh());
      fail(error, ["fileIds", "note"]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card as="section">
      <form ref={formRef} onSubmit={onSubmit} noValidate aria-busy={busy || undefined} className="flex min-w-0 flex-col">
        <CardHeader title={again ? t.formTitleAgain : t.formTitle} description={t.formText} divided />
        <CardBody className="grid gap-5">
          <ProblemAlert problem={problem} />
          <div>
            <FileUpload
              labels={{
                label: t.filesLabel,
                choose: t.choose,
                hint: t.hint,
                uploading: t.uploading,
                remove: t.remove,
                tooLarge: t.tooLarge,
                wrongType: t.wrongType,
              }}
              accept={ACCEPT}
              max={5}
              required
              disabled={busy}
              onChange={(next) => {
                setFiles(next);
                if (next.length > 0) clear();
              }}
            />
            {problem?.fields.fileIds ? (
              <p role="alert" className="mt-2 text-small font-medium text-danger-ink">
                {problem.fields.fileIds}
              </p>
            ) : null}
          </div>
          <Textarea
            label={t.noteLabel}
            optionalLabel={optional}
            hint={t.noteHint}
            name="note"
            maxLength={500}
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            error={problem?.fields.note}
          />
        </CardBody>
        <CardFooter className="justify-end">
          <span role="status" className="sr-only">
            {busy ? t.submitting : ""}
          </span>
          <Button type="submit" loading={busy}>
            {t.submit}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
