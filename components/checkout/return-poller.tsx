"use client";
// The page the payment gateway sends the buyer back to (`/en/checkout/return?token=<checkout token>`): one URL for
// success AND cancel (handoff §8.3 trap 8). It polls the checkout until it is paid and has a tracking token, every
// 3 seconds (the token routes allow 30 requests a minute per IP), honours Retry-After on 429 and stops after two minutes.
// A paid checkout shows the tracking link prominently: no email carries it, so it must be saved here.
import { useEffect, useState } from "react";
import { CircleCheck, Download, PackageSearch, SearchX } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api/browser";
import { isAbortError, isApiError } from "@/lib/api/errors";
import type { CheckoutSession } from "@/lib/api/types";
import { fmt } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import { sitePath } from "@/lib/site-path";
import type { CheckoutMessages } from "@/lib/i18n/messages/checkout";

const POLL_MS = 3000;
const TIMEOUT_MS = 120_000;

type Phase = "waiting" | "paid" | "timeout" | "notfound";

export type ReturnPollerProps = {
  token: string;
  labels: CheckoutMessages["payment"];
};

export function ReturnPoller({ token, labels }: ReturnPollerProps) {
  const errorText = useErrorText();
  const [phase, setPhase] = useState<Phase>("waiting");
  const [attempt, setAttempt] = useState(0);
  const [session, setSession] = useState<CheckoutSession>();
  const [rateLimited, setRateLimited] = useState(false);
  const [failure, setFailure] = useState<string>();

  useEffect(() => {
    if (!token) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const controller = new AbortController();

    const tick = async () => {
      let delay = POLL_MS;
      try {
        const current = await api.get<CheckoutSession>(`/store/v1/checkout-sessions/${encodeURIComponent(token)}`, { signal: controller.signal });
        if (stopped) return;
        setSession(current);
        setRateLimited(false);
        setFailure(undefined);
        if (current.status === "paid" && current.trackingToken) {
          setPhase("paid");
          return;
        }
      } catch (error) {
        if (stopped || isAbortError(error)) return;
        if (isApiError(error) && (error.status === 404 || error.status === 422)) {
          setPhase("notfound");
          return;
        }
        if (isApiError(error) && error.status === 429) {
          delay = Math.max(POLL_MS, (error.retryAfter ?? 5) * 1000);
          setRateLimited(true);
        } else {
          delay = 5000;
          setFailure(errorText.message(error));
        }
      }
      if (Date.now() - started + delay > TIMEOUT_MS) {
        setPhase("timeout");
        return;
      }
      timer = setTimeout(tick, delay);
    };
    void tick();

    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    };
    // `errorText` is a new object every render; the loop must not restart for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, attempt]);

  const p = (path: string) => sitePath(path);
  const checkoutHref = p(`/checkout/${encodeURIComponent(token)}`);

  if (!token) {
    return (
      <Card>
        <EmptyState
          icon={<SearchX aria-hidden="true" />}
          title={labels.noTokenTitle}
          description={labels.noTokenText}
          action={<ButtonLink href={p("/services")}>{labels.browse}</ButtonLink>}
        />
      </Card>
    );
  }

  if (phase === "notfound") {
    return (
      <Card>
        <EmptyState
          icon={<SearchX aria-hidden="true" />}
          title={labels.notFoundTitle}
          description={labels.notFoundText}
          action={<ButtonLink href={p("/services")}>{labels.browse}</ButtonLink>}
        />
      </Card>
    );
  }

  if (phase === "paid" && session?.trackingToken) {
    const trackPath = p(`/track/${encodeURIComponent(session.trackingToken)}`);
    const trackUrl = `${window.location.origin}${trackPath}`;
    return (
      <div className="grid gap-6">
        <Alert tone="success" icon={<CircleCheck aria-hidden="true" />} title={labels.paidTitle}>
          {labels.paidText}
        </Alert>
        <Card>
          <CardBody className="grid gap-4">
            <div>
              <h2 className="text-heading text-ink">{labels.trackTitle}</h2>
              <p className="mt-1 text-body text-ink-muted">{labels.trackText}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-control border border-line bg-surface-muted p-3">
              <code dir="ltr" className="min-w-0 flex-1 break-all font-mono text-small text-ink">
                {trackUrl}
              </code>
              <CopyButton value={trackUrl} label={labels.saveLink} copiedLabel={labels.linkCopied} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink href={trackPath} size="lg" startIcon={<PackageSearch aria-hidden="true" />}>
                {labels.viewOrder}
              </ButtonLink>
              <a
                href={`/store/v1/orders/${encodeURIComponent(session.trackingToken)}/receipt`}
                target="_blank"
                rel="noopener"
                className={buttonClasses({ variant: "secondary", size: "lg" })}
              >
                <Download aria-hidden="true" />
                {labels.receipt}
              </a>
            </div>
            <p className="text-small text-ink-subtle">{labels.receiptNote}</p>
          </CardBody>
        </Card>
        <p className="text-body text-ink-muted">
          {labels.help}{" "}
          <a href={p("/support")} className="font-semibold text-ink underline underline-offset-4">
            {labels.support}
          </a>
        </p>
      </div>
    );
  }

  if (phase === "timeout") {
    return (
      <div className="grid gap-4">
        <Alert tone="warning" title={labels.timeoutTitle}>
          <p>{labels.timeoutText}</p>
          <p className="mt-2 text-small num" dir="ltr">
            {fmt(labels.reference, { ref: token.slice(0, 8) })}
          </p>
          {failure ? <p className="mt-2">{failure}</p> : null}
        </Alert>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => {
              setPhase("waiting");
              setAttempt((n) => n + 1);
            }}
          >
            {labels.checkAgain}
          </Button>
          <ButtonLink href={checkoutHref} variant="secondary">
            {labels.backToPayment}
          </ButtonLink>
          <ButtonLink href={p("/support")} variant="ghost">
            {labels.support}
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardBody className="grid justify-items-center gap-4 py-10 text-center">
        <div role="status" className="grid justify-items-center gap-3">
          <Spinner size={36} />
          <h2 className="text-heading text-ink">{labels.waitingTitle}</h2>
          <p className="max-w-md text-body text-ink-muted">{rateLimited ? labels.rateLimited : (failure ?? labels.waitingText)}</p>
        </div>
        <p className="text-small text-ink-subtle">
          {labels.cancelledHint}{" "}
          <a href={checkoutHref} className="font-semibold text-ink underline underline-offset-4">
            {labels.backToPayment}
          </a>
        </p>
      </CardBody>
    </Card>
  );
}
