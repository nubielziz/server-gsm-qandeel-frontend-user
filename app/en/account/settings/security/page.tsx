// Security, for an account of either rank: change the password and two-step verification, each on the routes of the account's
// family. An account that signs in by email link has no password yet: it is offered one (the forgot-password page sends the
// mail that sets it), and two-step verification waits for it because the second step is asked after the password. The warning
// for a temporary password sits above every page of the account area (the gate in the frame), and this page is where it points.
import { Suspense } from "react";
import type { Metadata } from "next";
import { capabilitiesOf } from "@/lib/account/capabilities";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { SETTINGS_PATHS } from "@/lib/account/settings-nav";
import { requireAccount } from "@/lib/api/session";
import { account } from "@/lib/i18n/messages/account";
import { merchantSettings } from "@/lib/i18n/messages/merchant-settings";
import { sitePath } from "@/lib/site-path";
import { PasswordForm } from "@/components/account/password-form";
import { CardSkeleton } from "@/components/merchant-settings/skeletons";
import { TwoFactor } from "@/components/merchant-settings/two-factor";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageTransition } from "@/components/layout/page-transition";

export function generateMetadata(): Metadata {
  return { title: account.settings.nav.security, robots: { index: false, follow: false } };
}

async function SecurityContent() {
  const me = await requireAccount(sitePath(SETTINGS_PATHS.security));
  const caps = capabilitiesOf(me);
  const s = account.settings;
  const t = merchantSettings;
  return (
    <div className="grid gap-4">
      <Card as="section" id="password" aria-labelledby="password-title">
        <CardHeader
          title={<span id="password-title">{s.password.title}</span>}
          description={me.hasPassword ? s.password.description : undefined}
        />
        <CardBody>
          {me.hasPassword ? (
            <PasswordForm endpoint={FAMILY_ROUTES[caps.family].password} t={s.password} />
          ) : (
            <Alert
              title={s.password.noneTitle}
              action={
                <ButtonLink href={sitePath("/forgot-password")} variant="secondary" size="sm">
                  {s.password.noneAction}
                </ButtonLink>
              }
            >
              {s.password.noneText}
            </Alert>
          )}
        </CardBody>
      </Card>

      {caps.twoStep ? (
        <TwoFactor family={caps.family} enabled={me.twofaEnabled} t={t.security.twoFactor} fieldTexts={t.fieldErrors} />
      ) : (
        <Card as="section" id="two-factor" tone="muted" aria-labelledby="two-factor-title">
          <CardHeader
            title={<span id="two-factor-title">{s.twoFactorNeedsPassword.title}</span>}
            description={s.twoFactorNeedsPassword.text}
          />
        </Card>
      )}
    </div>
  );
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
