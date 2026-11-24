// Privacy, for every account: ask for a copy of the data we hold. The retail rank can also ask for erasure; a merchant rank is
// told to ask the team to move the account to the retail rank first, and the page sends no erasure request for it.
import { Suspense } from "react";
import type { Metadata } from "next";
import { capabilitiesOf } from "@/lib/account/capabilities";
import { SETTINGS_PATHS } from "@/lib/account/settings-nav";
import { requireAccount } from "@/lib/api/session";
import { account } from "@/lib/i18n/messages/account";
import { common } from "@/lib/i18n/messages/common";
import { sitePath } from "@/lib/site-path";
import { newTicketHref } from "@/lib/support/new-ticket-link";
import { PrivacyRequests } from "@/components/account/privacy-requests";
import { CardSkeleton } from "@/components/merchant-settings/skeletons";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageTransition } from "@/components/layout/page-transition";

export function generateMetadata(): Metadata {
  return { title: account.settings.nav.privacy, robots: { index: false, follow: false } };
}

async function PrivacyContent() {
  const me = await requireAccount(sitePath(SETTINGS_PATHS.privacy));
  const caps = capabilitiesOf(me);
  const s = account.settings;
  return (
    <Card as="section" id="privacy" aria-labelledby="privacy-title">
      <CardHeader title={<span id="privacy-title">{s.privacy.title}</span>} description={s.privacy.description} />
      <CardBody>
        <PrivacyRequests
          t={s.privacy}
          requestStatus={common.status.request}
          canErase={caps.dataErasure}
          supportHref={newTicketHref(true, null)}
        />
      </CardBody>
    </Card>
  );
}

export default function PrivacyPage() {
  return (
    <PageTransition>
      <Suspense fallback={<CardSkeleton rows={2} footer={false} />}>
        <PrivacyContent />
      </Suspense>
    </PageTransition>
  );
}
