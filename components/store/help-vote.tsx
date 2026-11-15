"use client";
// HelpVote: "Was this article helpful?" under a help article. `POST /store/v1/help/:slug/vote { helpful }` is public (no
// Turnstile, no CSRF) and answers 204, also for a repeat from the same address on the same day: the page therefore never
// says whether the vote counted and never shows a count. Only the leading id of the slug counts for the API. A 404 (the
// article was unpublished meanwhile) and any other failure show the one error text; a 429 shows the wait.
// The article id is remembered in `sessionStorage` so a visitor who comes back to the article in the same tab sees the
// thanks again instead of the buttons; without storage (private window) it is remembered in memory for the page's life.
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { CircleCheck, ThumbsDown, ThumbsUp } from "lucide-react";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { pathOf } from "@/lib/api/query";
import { useErrorText } from "@/lib/i18n/error-text";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export type HelpVoteLabels = {
  /** "Was this article helpful?" */
  question: string;
  yes: string;
  no: string;
  /** "Thank you for your feedback." */
  thanks: string;
  /** "We could not record your answer. Try again later." */
  error: string;
};

export type HelpVoteProps = {
  /** The article's numeric id: the key the answer is remembered under. */
  articleId: number;
  /** The article's slug, as the API gave it (`<id>-<words>`). */
  slug: string;
  labels: HelpVoteLabels;
};

// ── Which articles this tab has answered ──────────────────────────────────────────────────────────────────────────────

const answered = new Set<number>();
const listeners = new Set<() => void>();
const storageKey = (articleId: number) => `gsm:help-vote:${articleId}`;

function hasAnswered(articleId: number): boolean {
  if (answered.has(articleId)) return true;
  try {
    return window.sessionStorage.getItem(storageKey(articleId)) !== null;
  } catch {
    return false; // storage blocked: only this page's own memory counts
  }
}

function rememberAnswer(articleId: number): void {
  answered.add(articleId);
  try {
    window.sessionStorage.setItem(storageKey(articleId), "1");
  } catch {
    // Storage blocked or full: the in-memory set above still holds for this page.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Two buttons and the outcome. Mount it under the article; it needs the `ErrorTextProvider` of the root layout. */
export function HelpVote({ articleId, slug, labels }: HelpVoteProps) {
  const errorText = useErrorText();
  const questionId = useId();
  // False on the server and on the first client render (the buttons are there), the remembered answer right after.
  const voted = useSyncExternalStore(
    subscribe,
    () => hasAnswered(articleId),
    () => false,
  );
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const [problem, setProblem] = useState<{ message: string; reference: string | null } | null>(null);
  const interacted = useRef(false);
  const thanks = useRef<HTMLParagraphElement>(null);
  const failure = useRef<HTMLDivElement>(null);

  // Focus follows the visitor's own action only (never on load): the thanks once the buttons lock, the error when it shows.
  useEffect(() => {
    if (voted && interacted.current) thanks.current?.focus();
  }, [voted]);
  useEffect(() => {
    if (problem) failure.current?.focus();
  }, [problem]);

  async function vote(helpful: boolean) {
    if (busy || voted) return;
    interacted.current = true;
    setBusy(helpful ? "yes" : "no");
    setProblem(null);
    try {
      await api.post(pathOf("/store/v1/help/:slug/vote", { slug }), { helpful });
      rememberAnswer(articleId);
    } catch (error) {
      setProblem({
        message: isApiError(error) && error.status === 429 ? errorText.message(error) : labels.error,
        reference: errorText.reference(error) ?? null,
      });
    } finally {
      setBusy(null);
    }
  }

  const locked = voted || busy !== null;
  return (
    <section aria-labelledby={questionId} className="mt-6 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 id={questionId} className="text-subheading text-ink">
          {labels.question}
        </h2>
        <div role="group" aria-labelledby={questionId} className="flex flex-wrap gap-3">
          <Button variant="secondary" disabled={locked} loading={busy === "yes"} startIcon={<ThumbsUp aria-hidden="true" />} onClick={() => vote(true)}>
            {labels.yes}
          </Button>
          <Button variant="secondary" disabled={locked} loading={busy === "no"} startIcon={<ThumbsDown aria-hidden="true" />} onClick={() => vote(false)}>
            {labels.no}
          </Button>
        </div>
      </div>
      {/* Always in the page so that a message put into it is announced. */}
      <div aria-live="polite" className="[&:not(:empty)]:mt-4">
        {voted ? (
          <p ref={thanks} tabIndex={-1} className="flex items-center gap-2 text-body font-semibold text-success-ink">
            <CircleCheck aria-hidden="true" className="size-5 shrink-0" />
            {labels.thanks}
          </p>
        ) : null}
        {problem ? (
          <Alert ref={failure} tabIndex={-1} tone="danger">
            <span>{problem.message}</span>
            {problem.reference ? <span className="num mt-1 block text-small opacity-80">{problem.reference}</span> : null}
          </Alert>
        ) : null}
      </div>
    </section>
  );
}
