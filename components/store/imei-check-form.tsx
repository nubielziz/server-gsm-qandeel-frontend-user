"use client";
// The free IMEI check: IMEI field, Turnstile, `POST /store/v1/imei/check`, and the result card. The API's `status` is always
// `unknown` today (no blacklist or lock lookup), so the card says so plainly instead of implying a clean result.
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, CircleHelp, ScanSearch } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { Input } from "@/components/ui/input";
import { Turnstile } from "@/components/turnstile";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import type { ImeiCheckResult } from "@/lib/api/types";
import { formatDateTime, isValidImei, normalizeImei } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { useErrorText } from "@/lib/i18n/error-text";
import type { StoreMessages } from "@/lib/i18n/messages/store";

export type ImeiCheckFormProps = {
  labels: StoreMessages["imei"];
  /** Prefill from `?imei=` (the home page's quick check). A valid one is checked as soon as the security check is ready. */
  initialImei: string;
  servicesHref: string;
};

export function ImeiCheckForm({ labels, initialImei, servicesHref }: ImeiCheckFormProps) {
  const errorText = useErrorText();
  const [imei, setImei] = useState(initialImei);
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string>();
  const [formError, setFormError] = useState<{ message: string; reference?: string }>();
  const [result, setResult] = useState<ImeiCheckResult>();
  const autoRan = useRef(false);
  const resultBox = useRef<HTMLDivElement>(null);
  const inputId = useId();

  function validate(value: string): string | undefined {
    const digits = normalizeImei(value);
    if (!/^\d{15}$/.test(digits)) return labels.errorLength;
    if (!isValidImei(digits)) return labels.errorChecksum;
    return undefined;
  }

  async function run() {
    const problem = validate(imei);
    setFieldError(problem);
    setFormError(undefined);
    if (problem) {
      document.getElementById(inputId)?.focus();
      return;
    }
    if (!token) return;
    setBusy(true);
    try {
      const data = await api.post<ImeiCheckResult>("/store/v1/imei/check", { imei: normalizeImei(imei) }, { turnstileToken: token });
      setResult(data);
    } catch (error) {
      setResult(undefined);
      const field = isApiError(error) ? errorText.fields(error).imei : undefined;
      if (field) {
        setFieldError(field);
        document.getElementById(inputId)?.focus();
      } else {
        setFormError({ message: errorText.message(error), reference: errorText.reference(error) });
      }
    } finally {
      setBusy(false);
      // A Turnstile token is single use and spent even when the request fails validation.
      setToken(null);
      setResetKey((key) => key + 1);
    }
  }

  // The quick check on the home page lands here with `?imei=`: run it once the security check has produced a token.
  useEffect(() => {
    if (autoRan.current || !initialImei || !token || validate(initialImei)) return;
    autoRan.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (result) resultBox.current?.focus();
  }, [result]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void run();
  }

  const status = result?.status ?? "unknown";

  return (
    <div className="grid gap-6">
      <Card>
        <CardBody>
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            <Input
              id={inputId}
              name="imei"
              label={labels.label}
              hint={labels.hint}
              error={fieldError}
              value={imei}
              onChange={(event) => {
                setImei(event.target.value);
                if (fieldError) setFieldError(undefined);
              }}
              placeholder={labels.placeholder}
              inputMode="numeric"
              autoComplete="off"
              maxLength={24}
              required
              dir="ltr"
              inputSize="lg"
              leading={<ScanSearch aria-hidden="true" />}
            />
            <Turnstile onToken={setToken} resetKey={resetKey} />
            {formError ? (
              <Alert tone="danger">
                <p>{formError.message}</p>
                {formError.reference ? <p dir="ltr" className="mt-1 text-small num">{formError.reference}</p> : null}
              </Alert>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="lg" loading={busy} disabled={!token} startIcon={<ScanSearch aria-hidden="true" />}>
                {busy ? labels.checking : labels.submit}
              </Button>
              {!token && !busy ? <p className="text-small text-ink-subtle">{labels.turnstileWaiting}</p> : null}
            </div>
          </form>
        </CardBody>
      </Card>

      <div aria-live="polite">
        {result ? (
          <div ref={resultBox} tabIndex={-1} className="outline-none">
          <Card>
            <CardHeader
              title={labels.resultTitle}
              description={<bdi className="num">{fmt(labels.resultFor, { imei: result.imei })}</bdi>}
              actions={
                <Badge tone="success" icon={<CircleCheck aria-hidden="true" />}>
                  {labels.checksum}: {labels.checksumValid}
                </Badge>
              }
            />
            <CardBody className="grid gap-5">
              <section aria-labelledby={`${inputId}-device`}>
                <h3 id={`${inputId}-device`} className="text-subheading text-ink">
                  {labels.device}
                </h3>
                {result.device ? (
                  <DescriptionList className="mt-2">
                    <DescriptionItem label={labels.brand}>{result.device.brand || "—"}</DescriptionItem>
                    <DescriptionItem label={labels.model}>{result.device.model || "—"}</DescriptionItem>
                    {result.device.marketingName ? <DescriptionItem label={labels.marketingName}>{result.device.marketingName}</DescriptionItem> : null}
                    {result.device.releaseYear ? <DescriptionItem label={labels.releaseYear}><span className="num">{result.device.releaseYear}</span></DescriptionItem> : null}
                    <DescriptionItem label={labels.tac}>
                      <span className="num" dir="ltr">{result.device.tac}</span>
                    </DescriptionItem>
                  </DescriptionList>
                ) : (
                  <p className="mt-2 text-body text-ink-muted">{labels.unknownDeviceNote}</p>
                )}
                <p className="mt-2">
                  <Badge tone={result.checks.tac === "known" ? "success" : "neutral"}>
                    {result.checks.tac === "known" ? labels.tacKnown : labels.tacUnknown}
                  </Badge>
                </p>
              </section>

              <section aria-labelledby={`${inputId}-status`}>
                <h3 id={`${inputId}-status`} className="text-subheading text-ink">
                  {labels.statusTitle}
                </h3>
                <Alert tone="info" icon={<CircleHelp aria-hidden="true" />} title={status === "unknown" ? labels.statusUnknown : status} className="mt-2">
                  <p>{labels.statusNote}</p>
                  <ButtonLink href={servicesHref} variant="secondary" size="sm" className="mt-3" endIcon={<ArrowRight aria-hidden="true" />}>
                    {labels.statusCta}
                  </ButtonLink>
                </Alert>
              </section>

              <p className="text-small text-ink-subtle">
                {labels.checkedAt}: {formatDateTime(result.checkedAt)}
              </p>
              <Link
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  setResult(undefined);
                  setImei("");
                  document.getElementById(inputId)?.focus();
                }}
                className="touch-target inline-flex w-fit text-body font-semibold text-ink underline underline-offset-4"
              >
                {labels.another}
              </Link>
            </CardBody>
          </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
