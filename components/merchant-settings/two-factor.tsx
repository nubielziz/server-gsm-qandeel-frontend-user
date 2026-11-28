"use client";
// Two-step verification, for an account of either rank (the routes are the family's own, `FAMILY_ROUTES[family].twoFactor`):
// off → "Set up" (POST setup, no body) → QR + key + 6-digit code → POST enable; on → disable with a code (POST disable).
// TWOFA_ALREADY_ENABLED / TWOFA_NOT_ENABLED (409) resync the state.
// The QR is an SVG string from the API: it is only ever used as an <img> data URI, never injected as HTML.
import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import type { AccountFamily } from "@/lib/account/family";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { api } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import type { TwoFactorSetup } from "@/lib/api/types";
import type { MerchantSettingsMessages } from "@/lib/i18n/messages/merchant-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ProblemAlert, useFocusFirstInvalid, useFormProblem } from "./form-problem";

type Phase = { kind: "idle" } | { kind: "setup"; setup: TwoFactorSetup } | { kind: "disable" };

type Props = {
  /** The routes of this account's family: `store` for a retail rank, `client` for a merchant rank. */
  family: AccountFamily;
  enabled: boolean;
  t: MerchantSettingsMessages["security"]["twoFactor"];
  fieldTexts: MerchantSettingsMessages["fieldErrors"];
};

export function TwoFactor({ family, enabled, t, fieldTexts }: Props) {
  const routes = FAMILY_ROUTES[family].twoFactor;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [override, setOverride] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const { problem, fail, failFields, clear } = useFormProblem(fieldTexts);
  useFocusFirstInvalid(formRef, problem);

  const on = override ?? enabled;
  const working = busy || refreshing;
  const refresh = () => startRefresh(() => router.refresh());

  function reset() {
    setPhase({ kind: "idle" });
    setCode("");
    clear();
  }

  /** Runs a call; resyncs the on/off state when the server says it is already in the other state. */
  async function run(action: () => Promise<void>) {
    setBusy(true);
    clear();
    try {
      await action();
    } catch (error) {
      if (isApiError(error) && error.code === "TWOFA_ALREADY_ENABLED") {
        setOverride(true);
        setPhase({ kind: "idle" });
        refresh();
      } else if (isApiError(error) && error.code === "TWOFA_NOT_ENABLED") {
        setOverride(false);
        setPhase({ kind: "idle" });
        refresh();
      }
      fail(error, ["code"]);
    } finally {
      setBusy(false);
    }
  }

  const startSetup = () =>
    run(async () => {
      const setup = await api.post<TwoFactorSetup>(routes.setup);
      setCode("");
      setPhase({ kind: "setup", setup });
    });

  function submitCode(path: "enable" | "disable") {
    return async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (working) return;
      if (!/^\d{6}$/.test(code)) {
        failFields({ code: t.codeRequired });
        return;
      }
      await run(async () => {
        await api.post(routes[path], { code });
        setOverride(path === "enable");
        toast.success(path === "enable" ? t.enabledToast : t.disabledToast);
        reset();
        refresh();
      });
    };
  }

  // The API answers a wrong code with a 422 on `code`; show one clear sentence for it.
  const codeError = problem?.fields.code ? (problem.fields.code === t.codeRequired ? t.codeRequired : t.codeInvalid) : undefined;

  const codeField = (
    <Input
      label={t.codeLabel}
      required
      name="code"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      pattern="[0-9]*"
      dir="ltr"
      hint={t.codeHint}
      value={code}
      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
      error={codeError}
      fieldClassName="max-w-56"
    />
  );

  return (
    <Card id="two-factor" as="section">
      <CardHeader
        title={t.title}
        description={on ? t.onText : t.offText}
        divided
        actions={<Badge tone={on ? "success" : "neutral"}>{on ? t.on : t.off}</Badge>}
      />
      <CardBody className="grid gap-5">
        <ProblemAlert problem={problem} />

        {phase.kind === "setup" ? (
          <form ref={formRef} method="post" onSubmit={submitCode("enable")} noValidate className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
              {/* A data URI of the API's SVG: shown as an image, so no markup from the answer can run. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(phase.setup.qrSvg)}`}
                alt={t.qrAlt}
                width={176}
                height={176}
                className="size-44 rounded-card border border-line bg-surface p-2"
              />
              <div className="grid min-w-0 content-start gap-3">
                <div>
                  <h3 className="text-subheading text-ink">{t.scanTitle}</h3>
                  <p className="mt-1 text-body text-ink-muted">{t.scanText}</p>
                </div>
                <div>
                  <p className="text-small font-semibold text-ink">{t.secretLabel}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <code dir="ltr" className="select-all break-all rounded-badge bg-surface-sunken px-2.5 py-1.5 font-mono text-small text-ink">
                      {phase.setup.secret}
                    </code>
                    <CopyButton value={phase.setup.secret} />
                  </div>
                </div>
                <a
                  href={phase.setup.otpauthUrl}
                  className="inline-flex min-h-11 w-fit items-center gap-2 text-body font-semibold text-ink underline underline-offset-4"
                >
                  <KeyRound aria-hidden="true" className="size-4" />
                  {t.openApp}
                </a>
              </div>
            </div>
            {codeField}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={working}>
                {t.enable}
              </Button>
              <Button variant="secondary" disabled={working} onClick={reset}>
                {t.cancel}
              </Button>
              <span role="status" className="sr-only">
                {working ? t.enabling : ""}
              </span>
            </div>
          </form>
        ) : phase.kind === "disable" ? (
          <form ref={formRef} method="post" onSubmit={submitCode("disable")} noValidate className="grid gap-5">
            <div>
              <h3 className="text-subheading text-ink">{t.disableTitle}</h3>
              <p className="mt-1 text-body text-ink-muted">{t.disableText}</p>
            </div>
            {codeField}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="danger" loading={working}>
                {t.disable}
              </Button>
              <Button variant="secondary" disabled={working} onClick={reset}>
                {t.cancel}
              </Button>
              <span role="status" className="sr-only">
                {working ? t.disabling : ""}
              </span>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-xl text-small text-ink-subtle">{t.sessionsNote}</p>
            {on ? (
              <Button
                variant="secondary"
                disabled={working}
                onClick={() => {
                  clear();
                  setPhase({ kind: "disable" });
                }}
              >
                {t.disable}
              </Button>
            ) : (
              <Button loading={working} onClick={startSetup}>
                {t.setUp}
              </Button>
            )}
            <span role="status" className="sr-only">
              {working ? t.settingUp : ""}
            </span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
