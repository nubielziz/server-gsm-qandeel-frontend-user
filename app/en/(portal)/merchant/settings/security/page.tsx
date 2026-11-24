// Security: change password and two-step verification. Both work for pending merchants too (handoff §4.15).
import { Suspense } from "react";
import type { Metadata } from "next";
import { requireMerchant } from "@/lib/api/session";
import { common } from "@/lib/i18n/messages/common";
import { merchantSettings } from "@/lib/i18n/messages/merchant-settings";
import { PasswordForm } from "@/components/merchant-settings/password-form";
import { CardSkeleton } from "@/components/merchant-settings/skeletons";
import { TwoFactor } from "@/components/merchant-settings/two-factor";
import { PageTransition } from "@/components/layout/page-transition";

export function generateMetadata(): Metadata {
  const t = merchantSettings;
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
          </div>
        }
      >
        <SecurityContent />
      </Suspense>
    </PageTransition>
  );
}

async function SecurityContent() {
  const me = await requireMerchant();
  const t = merchantSettings;
  const ui = common.ui;
  return (
    <div className="grid gap-4">
      <PasswordForm t={t.security.password} fieldTexts={t.fieldErrors} showLabel={ui.showPassword} hideLabel={ui.hidePassword} />
      <TwoFactor enabled={me.twofaEnabled} t={t.security.twoFactor} fieldTexts={t.fieldErrors} />
    </div>
  );
}
