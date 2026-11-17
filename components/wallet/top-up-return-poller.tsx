"use client";
// The notice at the top of the wallet page when a customer comes back from an online payment (`/account/wallet?topUp=<id>`,
// plan F33, D8, BH §3.3). The gateway confirms in its own time, so the page follows the top-up gently:
// - `GET /store/v1/me/wallet/top-ups/:id` right away, then every 5 s while the payment is awaited and every 15 s once it is
//   `in_review` (lib/wallet/top-up-errors.ts); a `Retry-After` (429, 503) is never undercut;
// - it stops on a final state (`credited`, `rejected`, `cancelled`) and after two minutes, and then refreshes the page, so
//   the balance cards and the top-ups list show what the API now says; the notice stays;
// - every change of state is announced (the notice is a live region); a top-up that is not the customer's (404) says so;
// - a signed-out answer refreshes the route (the layout then asks to sign in); any other failure just waits for the next read.
// The reason of a rejection comes from staff: it is a text node. No timer survives the page (the effect aborts and clears).
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, forgetCsrf } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import type { TopUpDetail } from "@/lib/api/types";
import { formatMoney } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import type { TopUpsMessages } from "@/lib/i18n/messages/top-ups";
import { ltr } from "@/lib/merchant/format";
import { isSignedOutError } from "@/lib/merchant/signed-out";
import { isFinalTopUp, pollDelayMs, shouldPollAgain } from "@/lib/wallet/top-up-errors";
import { Alert, type AlertTone } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type Phase = "waiting" | "in_review" | "credited" | "rejected" | "cancelled" | "timeout" | "unavailable";

type PollState = {
  phase: Phase;
  /** What the balance receives (USD), for the credited text. */
  net?: string;
  /** Why staff rejected it. */
  reason?: string | null;
};

function stateOf(detail: TopUpDetail): PollState {
  switch (detail.status) {
    case "in_review":
      return { phase: "in_review" };
    case "credited":
      return { phase: "credited", net: detail.netAmount };
    case "rejected":
      return { phase: "rejected", reason: detail.rejectionReason };
    case "cancelled":
      return { phase: "cancelled" };
    default:
      return { phase: "waiting" };
  }
}

export type TopUpReturnPollerProps = {
  /** The top-up's id from the address: digits only, checked by the page. */
  id: string;
  /** The top-up's own page. */
  href: string;
  labels: TopUpsMessages["poller"];
};

export function TopUpReturnPoller({ id, href, labels: t }: TopUpReturnPollerProps) {
  const router = useRouter();
  const [state, setState] = useState<PollState>({ phase: "waiting" });

  useEffect(() => {
    const controller = new AbortController();
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let status = "awaiting_payment";

    async function read() {
      let retryAfter: number | undefined;
      try {
        const detail = await api.get<TopUpDetail>(`/store/v1/me/wallet/top-ups/${id}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        status = detail.status;
        setState(stateOf(detail));
        if (isFinalTopUp(status)) {
          router.refresh();
          return;
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (isSignedOutError(error)) {
          forgetCsrf("store");
          router.refresh();
          return;
        }
        if (isApiError(error) && error.status === 404) {
          setState({ phase: "unavailable" });
          return;
        }
        retryAfter = isApiError(error) ? error.retryAfter : undefined;
      }
      const delay = pollDelayMs(status, retryAfter);
      if (!shouldPollAgain(Date.now() - started, delay)) {
        setState((previous) => ({ ...previous, phase: "timeout" }));
        router.refresh();
        return;
      }
      timer = setTimeout(read, delay);
    }

    void read();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, router]);

  const money = (amount: string) => ltr(formatMoney(amount, "USD"));
  const view: Record<Phase, { tone: AlertTone; title: string; text: string; busy?: boolean }> = {
    waiting: { tone: "info", title: t.waiting, text: t.waitingText, busy: true },
    in_review: { tone: "info", title: t.inReview, text: t.inReviewText },
    credited: { tone: "success", title: t.credited, text: state.net ? fmt(t.creditedText, { amount: money(state.net) }) : "" },
    rejected: { tone: "danger", title: t.rejected, text: t.rejectedText },
    cancelled: { tone: "info", title: t.cancelled, text: t.cancelledText },
    timeout: { tone: "warning", title: t.timeout, text: t.timeoutText },
    unavailable: { tone: "warning", title: t.unavailable, text: t.unavailableText },
  };
  const current = view[state.phase];

  return (
    <Alert
      tone={current.tone}
      // The waiting and review states are progress, not trouble: announced politely. A warning or an error interrupts.
      role={current.tone === "info" || current.tone === "success" ? "status" : "alert"}
      title={current.title}
      icon={current.busy ? <Spinner size={20} /> : undefined}
      aria-live={current.tone === "info" || current.tone === "success" ? "polite" : undefined}
    >
      {current.text ? <span className="block">{current.text}</span> : null}
      {state.phase === "rejected" && state.reason ? (
        <span dir="auto" className="mt-1 block whitespace-pre-line break-words">
          {t.rejectedReason}: {state.reason}
        </span>
      ) : null}
      {state.phase !== "unavailable" ? (
        <span className="mt-3 block">
          <ButtonLink href={href} variant="secondary" size="sm">
            {t.view}
          </ButtonLink>
        </span>
      ) : null}
    </Alert>
  );
}
