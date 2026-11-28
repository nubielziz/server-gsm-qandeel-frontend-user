"use client";
// TicketReplyForm: writes to the ticket (feature 28). `Enter` sends, `Shift+Enter` starts a new line; files upload as they
// are picked and go with the message as `fileIds` (PDF, JPEG or PNG, 5 MB, five a message; a message may be files only).
// The answer of the `POST` goes to `onSent`, which appends it to the conversation: there is no `router.refresh()` any
// more, and the event the stream sends for the same message is ignored by id. Focus stays in the box after sending.
// Replying moves a pending ticket back to open (the page's hint says so). A resolved ticket shows no box at all (the
// conversation shows the closed notice instead, owner 2026-11-15); a send or an upload that still meets one (staff closed it
// a moment ago) answers `409 TICKET_RESOLVED`, which goes to `onClosed` with the box's text so the notice can keep it.
import { useId, useReducer, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { FileText, Paperclip, Send, X } from "lucide-react";
import { isApiError } from "@/lib/api/errors";
import type { TicketMessage } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { fmt } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import { useMounted } from "@/lib/use-mounted";
import type { SupportMessages } from "@/lib/i18n/messages/support";
import {
  activeChips,
  ATTACHMENT_ACCEPT,
  canSend,
  chipsReducer,
  formatFileSize,
  MAX_ATTACHMENTS,
  planPicks,
  uploadedIds,
  type AttachmentProblem,
  type Chip,
} from "@/lib/support/attachments";
import { TICKET_RESOLVED } from "@/lib/support/reply-area";
import { sendsMessage } from "@/lib/support/send-key";
import type { TicketAdapter } from "@/lib/support/ticket-api";
import { FormAlert } from "@/components/auth/form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "@/components/auth/form-errors";
import { useFocusOnFeedback } from "@/components/auth/use-focus-on-feedback";
import { Button, buttonClasses } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export type TicketReplyFormProps = {
  adapter: Pick<TicketAdapter, "send" | "upload">;
  t: SupportMessages["ticket"]["reply"];
  /** Shown above the box: "We are waiting for your reply." */
  hint?: string;
  /** The text the box starts with (a message the API refused while the ticket was closed, back after a reopen). */
  initialBody?: string;
  /** The message as the API stored it: the conversation appends it. */
  onSent(message: TicketMessage): void;
  /** Whether the box holds unsent text or files, told on every change the visitor makes. */
  onDraft?(drafting: boolean): void;
  /** The API refused a message or a file because the ticket is closed: `text` is what the box held. */
  onClosed?(text: string): void;
};

/** A message or file refused because staff resolved the ticket. */
const refusedAsClosed = (error: unknown) => isApiError(error) && error.code === TICKET_RESOLVED;

const BODY_MAX = 4000;

export function TicketReplyForm({ adapter, t, hint, initialBody = "", onSent, onDraft, onClosed }: TicketReplyFormProps) {
  const errorText = useErrorText();
  const hintId = useId();
  const form = useRef<HTMLFormElement>(null);
  const mounted = useMounted();
  const box = useRef<HTMLTextAreaElement>(null);
  const nextKey = useRef(1);
  const [body, setBody] = useState(initialBody);
  const [chips, dispatch] = useReducer(chipsReducer, [] as Chip[]);
  /** A sentence about the last pick that is not about one file (too many files). */
  const [pickNote, setPickNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  useFocusOnFeedback(feedback, form);

  const atLimit = activeChips(chips) >= MAX_ATTACHMENTS;
  const problemText = (problem: AttachmentProblem) => t.fileErrors[problem];

  /** Why an upload failed, in words: the field code of `file` (`type`, `empty`, `too_large`), else the whole error. */
  function uploadErrorText(error: unknown): string {
    if (isApiError(error)) {
      if (error.status === 413) return t.fileErrors.too_large;
      const code = error.fieldError("file")?.code;
      if (code === "type" || code === "empty" || code === "too_large") return t.fileErrors[code];
      if (error.status === 422) return errorText.field(error.fieldError("file")) ?? errorText.message(error);
    }
    return errorText.message(error);
  }

  function onType(event: ChangeEvent<HTMLTextAreaElement>) {
    const text = event.target.value;
    setBody(text);
    onDraft?.(text.trim() !== "" || chips.length > 0);
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    // The same file can then be picked again after it was removed.
    event.target.value = "";
    if (picked.length === 0) return;
    const plan = planPicks(activeChips(chips), picked);
    setPickNote(plan.overflow ? t.tooMany : null);
    setFeedback(NO_FEEDBACK);
    const added: Chip[] = [];
    const uploads: { key: number; file: File }[] = [];
    picked.forEach((file, index) => {
      const refused = plan.rejected.find((entry) => entry.index === index);
      if (!refused && !plan.accepted.includes(index)) return; // left out for the limit
      const key = nextKey.current++;
      added.push({
        key,
        name: file.name,
        size: file.size,
        status: refused ? "error" : "uploading",
        fileId: null,
        error: refused ? problemText(refused.problem) : null,
      });
      if (!refused) uploads.push({ key, file });
    });
    dispatch({ type: "add", chips: added });
    onDraft?.(body.trim() !== "" || chips.length + added.length > 0);
    for (const { key, file } of uploads) {
      adapter.upload(file).then(
        (uploaded) => dispatch({ type: "done", key, fileId: uploaded.id }),
        (error: unknown) => {
          dispatch({ type: "fail", key, error: uploadErrorText(error) });
          if (refusedAsClosed(error)) onClosed?.(box.current?.value ?? body);
        },
      );
    }
  }

  async function submit() {
    if (busy) return;
    const check = canSend(body, chips);
    if (check.waiting) {
      setFeedback({ fields: { fileIds: t.waitUpload }, message: null, reference: null });
      return;
    }
    if (!check.ok) {
      setFeedback({ fields: { body: errorText.field({ field: "body", code: "required", message: "" }) ?? "" }, message: null, reference: null });
      return;
    }
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    try {
      const message = await adapter.send({ body: body.trim(), fileIds: uploadedIds(chips) });
      setBody("");
      setPickNote(null);
      dispatch({ type: "clear" });
      onDraft?.(false);
      toast.success(t.sent);
      onSent(message);
      box.current?.focus();
    } catch (error) {
      // Staff closed the ticket a moment ago: the conversation swaps the box for the closed notice, which keeps the text.
      if (refusedAsClosed(error) && onClosed) onClosed(body);
      else setFeedback(feedbackFrom(error, errorText, ["body", "fileIds"]));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter is a new line; a key that confirms an input method's text is not a send (lib/support/send-key.ts).
    if (!sendsMessage({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing })) return;
    event.preventDefault();
    void submit();
  }

  return (
    <form ref={form} method="post" onSubmit={onSubmit} noValidate className="grid gap-3">
      {hint ? <p className="text-small text-ink-subtle">{hint}</p> : null}
      <Textarea
        ref={box}
        name="body"
        label={t.label}
        labelHidden
        placeholder={t.placeholder}
        hint={t.enterHint}
        rows={4}
        maxLength={BODY_MAX}
        value={body}
        onChange={onType}
        onKeyDown={onKeyDown}
        error={feedback.fields.body}
      />

      {chips.length > 0 ? (
        <ul aria-label={t.attached} className="grid gap-2">
          {chips.map((chip) => (
            <li key={chip.key} className="flex min-h-11 items-center gap-3 rounded-control border border-line bg-surface px-3 py-1.5">
              {chip.status === "uploading" ? (
                <Spinner />
              ) : (
                <FileText aria-hidden="true" className={cn("size-4 shrink-0", chip.status === "error" ? "text-danger" : "text-ink-muted")} />
              )}
              <span className="min-w-0 flex-1 text-small">
                <bdi className="block truncate font-semibold text-ink">{chip.name}</bdi>
                {chip.status === "error" ? (
                  <span role="alert" className="block text-danger-ink">
                    {chip.error}
                  </span>
                ) : (
                  <span className="num block text-ink-subtle">{chip.status === "uploading" ? t.uploading : formatFileSize(chip.size)}</span>
                )}
              </span>
              <IconButton
                label={fmt(t.removeFile, { name: chip.name })}
                size="sm"
                onClick={() => {
                  dispatch({ type: "remove", key: chip.key });
                  onDraft?.(body.trim() !== "" || chips.length > 1);
                }}
              >
                <X aria-hidden="true" />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : null}
      {pickNote ? (
        <p role="alert" className="text-small text-danger-ink">
          {pickNote}
        </p>
      ) : null}
      {feedback.fields.fileIds ? (
        <p role="alert" className="text-small text-danger-ink">
          {feedback.fields.fileIds}
        </p>
      ) : null}

      <FormAlert message={feedback.message} reference={feedback.reference} />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {/* A real label around the input: the whole button opens the file chooser and names it. */}
          <label
            className={cn(
              buttonClasses({ variant: "secondary", size: "sm" }),
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
              atLimit ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            )}
          >
            <Paperclip aria-hidden="true" />
            {t.attach}
            <input
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              disabled={atLimit}
              aria-describedby={hintId}
              onChange={onPick}
              className="sr-only"
            />
          </label>
          <span id={hintId} className="text-small text-ink-subtle">
            {t.attachHint}
          </span>
        </div>
        <Button type="submit" loading={busy} disabled={!mounted} startIcon={<Send aria-hidden="true" />}>
          {t.submit}
        </Button>
      </div>
    </form>
  );
}
