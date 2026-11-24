"use client";
// Change password (POST /client/security/password). 422 on `currentPassword` = wrong password, WEAK_PASSWORD on
// `newPassword`. A success ends the merchant's other sessions; the refresh re-reads the account so the
// must-change-password gate (components/merchant/must-change-password-gate.tsx) lifts.
import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/browser";
import type { MerchantSettingsMessages } from "@/lib/i18n/messages/merchant-settings";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/password-input";
import { toast } from "@/components/ui/toast";
import { ProblemAlert, useFocusFirstInvalid, useFormProblem } from "./form-problem";

const FIELDS = ["currentPassword", "newPassword"];

type Props = {
  t: MerchantSettingsMessages["security"]["password"];
  fieldTexts: MerchantSettingsMessages["fieldErrors"];
  /** Texts for the password inputs' show/hide button (the UI strings). */
  showLabel: string;
  hideLabel: string;
};

export function PasswordForm({ t, fieldTexts, showLabel, hideLabel }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const { problem, fail, failFields, clear } = useFormProblem(fieldTexts);
  useFocusFirstInvalid(formRef, problem);
  const busy = saving || refreshing;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const local: Record<string, string> = {};
    if (!current) local.currentPassword = t.required;
    if (next !== confirm) local.confirm = t.mismatch;
    if (Object.keys(local).length > 0) {
      failFields(local);
      return;
    }
    clear();
    setSaving(true);
    try {
      await api.post("/client/security/password", { currentPassword: current, newPassword: next });
      toast.success(t.saved, t.savedText);
      setCurrent("");
      setNext("");
      setConfirm("");
      startRefresh(() => router.refresh());
    } catch (error) {
      fail(error, FIELDS);
    } finally {
      setSaving(false);
    }
  }

  const common = { showLabel, hideLabel };
  return (
    <Card id="password" as="section">
      <form ref={formRef} onSubmit={onSubmit} noValidate aria-busy={busy || undefined} className="flex min-w-0 flex-col">
        <CardHeader title={t.title} description={t.description} divided />
        <CardBody className="grid gap-5">
          <ProblemAlert problem={problem} />
          <PasswordInput
            {...common}
            label={t.current}
            required
            name="currentPassword"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            error={problem?.fields.currentPassword}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <PasswordInput
              {...common}
              label={t.next}
              required
              name="newPassword"
              autoComplete="new-password"
              hint={t.nextHint}
              maxLength={128}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              error={problem?.fields.newPassword}
            />
            <PasswordInput
              {...common}
              label={t.confirm}
              required
              name="confirmPassword"
              autoComplete="new-password"
              maxLength={128}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={problem?.fields.confirm}
            />
          </div>
        </CardBody>
        <CardFooter className="justify-end">
          <span role="status" className="sr-only">
            {busy ? t.submitting : ""}
          </span>
          <Button type="submit" loading={busy} disabled={!current && !next && !confirm}>
            {t.submit}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
