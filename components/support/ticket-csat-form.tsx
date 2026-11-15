"use client";
// TicketCsatForm: a 1-5 rating once the ticket is resolved (`POST /store/v1/tickets/:token/csat`, one rating per
// ticket). Native radios, so the arrow keys and the group label work without extra code. The conversation owns the ticket's
// state (feature 28): after the rating is saved it is told through `onSaved`, so there is no `router.refresh()`.
import { useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api/browser";
import { useErrorText } from "@/lib/i18n/error-text";
import type { SupportMessages } from "@/lib/i18n/messages/support";
import { FormAlert } from "@/components/auth/form-alert";
import { feedbackFrom, NO_FEEDBACK, type FormFeedback } from "@/components/auth/form-errors";
import { useFocusOnFeedback } from "@/components/auth/use-focus-on-feedback";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export function TicketCsatForm({
  token,
  t,
  onSaved,
}: {
  token: string;
  t: SupportMessages["ticket"]["csat"];
  /** Called with the score after the API saved it. */
  onSaved(score: number): void;
}) {
  const errorText = useErrorText();
  const form = useRef<HTMLFormElement>(null);
  const [score, setScore] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(NO_FEEDBACK);
  useFocusOnFeedback(feedback, form);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || score === null) return;
    setBusy(true);
    setFeedback(NO_FEEDBACK);
    try {
      await api.post(`/store/v1/tickets/${encodeURIComponent(token)}/csat`, { score });
      toast.success(t.saved);
      onSaved(score);
    } catch (error) {
      setFeedback(feedbackFrom(error, errorText, ["score"]));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={form} onSubmit={onSubmit} className="grid gap-3">
      <fieldset className="grid gap-2">
        <legend className="text-subheading text-ink">{t.title}</legend>
        <p className="text-body text-ink-muted">{t.text}</p>
        <div role="radiogroup" aria-label={t.label} className="mt-1 flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="relative">
              <input
                type="radio"
                name="score"
                value={n}
                checked={score === n}
                onChange={() => setScore(n)}
                className="peer sr-only"
              />
              <span
                className={
                  "num grid size-11 cursor-pointer place-items-center rounded-control border border-line-strong bg-surface text-body font-semibold text-ink " +
                  "transition-colors hover:bg-surface-muted peer-checked:border-inverse peer-checked:bg-inverse peer-checked:text-on-inverse " +
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
                }
              >
                {n}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <FormAlert message={feedback.message} reference={feedback.reference} />
      <div>
        <Button type="submit" variant="secondary" loading={busy} disabled={score === null}>
          {t.submit}
        </Button>
      </div>
    </form>
  );
}
