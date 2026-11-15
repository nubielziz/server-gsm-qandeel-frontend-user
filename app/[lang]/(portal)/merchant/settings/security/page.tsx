// Security: change password, two-step verification, active sessions. All three work for pending merchants too
// (handoff §4.15).
import { Suspense } from "react";
import type { Metadata } from "next";
import { apiSessionList } from "@/lib/api/server";
import { requireMerchant } from "@/lib/api/session";
import type { MerchantSession } from "@/lib/api/types";
import { listQuery } from "@/lib/api/query";
import { common } from "@/lib/i18n/messages/common";
import { merchantSettings } from "@/lib/i18n/messages/merchant-settings";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { LoadError, settle } from "@/components/merchant-settings/load";
import { PasswordForm } from "@/components/merchant-settings/password-form";
import { SessionsTable } from "@/components/merchant-settings/sessions-table";
import { CardSkeleton } from "@/components/merchant-settings/skeletons";
import { TwoFactor } from "@/components/merchant-settings/two-factor";
import { PageTransition } from "@/components/layout/page-transition";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(merchantSettings);
  return { title: t.layout.nav.security };
}

export default function SecurityPage() {
  return (
    <PageTransition>
      <Suspense
        fallback={
          <div className="grid gap-4">
            <CardSkeleton rows={3} />
            <CardSkeleton rows={1} />
            <CardSkeleton rows={2} footer={false} />
          </div>
        }
      >
        <SecurityContent />
      </Suspense>
    </PageTransition>
  );
}

async function SecurityContent() {
  const locale = await getLocale();
  const [me, t] = await Promise.all([requireMerchant(locale), getMessages(merchantSettings)]);
  const ui = common[locale].ui;
  const sessions = await settle(locale, () =>
    apiSessionList<MerchantSession>("/client/sessions", { query: listQuery({ start: 0, end: 100, sort: "lastSeenAt", order: "desc" }) }),
  );
  return (
    <div className="grid gap-4">
      <PasswordForm t={t.security.password} fieldTexts={t.fieldErrors} showLabel={ui.showPassword} hideLabel={ui.hidePassword} />
      <TwoFactor enabled={me.twofaEnabled} t={t.security.twoFactor} fieldTexts={t.fieldErrors} />
      {sessions.ok ? (
        <SessionsTable sessions={sessions.data.data} locale={locale} t={t.security.sessions} utc={t.utc} />
      ) : (
        <LoadError error={sessions.error} locale={locale} />
      )}
    </div>
  );
}
