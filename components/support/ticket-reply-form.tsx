"use client";
// TicketReplyForm: adds a message to the ticket (`POST /store/v1/tickets/:token/messages`), then `router.refresh()` so the
// server-rendered conversation shows it. Replying reopens a resolved ticket and moves a pending one back to open.
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { api } from "@/lib/api/browser";
import { useErrorText } from "@/lib/i18n/error-text";
import type { SupportMessages } from "@/lib/i18n/messages/support";
import { FormAlert } from "@/components/auth/form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "@/components/auth/form-errors";
import { useFocusOnFeedback } from "@/components/auth/use-focus-on-feedback";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

export type TicketReplyFormProps = {
  token: string;
  t: SupportMessages["ticket"]["reply"];
  /** Shown above the box: "This ticket is resolved. Your reply reopens it." or "We are waiting for your reply." */
  hint?: string;
};

export function TicketReplyForm({ token, t, hint }: TicketReplyFormProps) {
  const router = useRouter();
  const errorText = useErrorText();
  const form = useRef<HTMLFormElement>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  useFocusOnFeedback(feedback, form);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!body.trim()) {
      setFeedback({ fields: { body: errorText.field({ field: "body", code: "required", message: "" }) ?? "" }, message: null, reference: null });
      return;
    }
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    try {
      await api.post(`/store/v1/tickets/${encodeURIComponent(token)}/messages`, { body: body.trim() });
      setBody("");
      toast.success(t.sent);
      router.refresh();
    } catch (error) {
      setFeedback(feedbackFrom(error, errorText, ["body"]));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="grid gap-3">
      {hint ? <p className="text-small text-ink-subtle">{hint}</p> : null}
      <Textarea
        name="body"
        label={t.label}
        labelHidden
        placeholder={t.placeholder}
        rows={4}
        maxLength={4000}
        required
        value={body}
        onChange={(e) => setBody(e.target.value)}
        error={feedback.fields.body}
      />
      <FormAlert message={feedback.message} reference={feedback.reference} />
      <div className="flex justify-end">
        <Button type="submit" loading={busy} startIcon={<Send aria-hidden="true" className="rtl:-scale-x-100" />}>
          {t.submit}
        </Button>
      </div>
    </form>
  );
}
