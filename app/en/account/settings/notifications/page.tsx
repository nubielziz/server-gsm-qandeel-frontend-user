// Notification preferences: the low-balance alert and the email switches of the portal. A merchant rank has them; any other
// rank is sent to the account home (`requireRank`), and a refusal of the API for the same reason does the same.
import { Suspense } from "react";
import type { Metadata } from "next";
import { FAMILY_ROUTES } from "@/lib/account/routes";
import { SETTINGS_PATHS } from "@/lib/account/settings-nav";
import { apiSessionGet } from "@/lib/api/server";
import { requireRank } from "@/lib/api/session";
import type { NotificationPreferences } from "@/lib/api/types";
import { account } from "@/lib/i18n/messages/account";
import { merchantSettings } from "@/lib/i18n/messages/merchant-settings";
import { sitePath } from "@/lib/site-path";
import { LoadError, settle } from "@/components/merchant-settings/load";
import { NotificationsForm } from "@/components/merchant-settings/notifications-form";
import { CardSkeleton } from "@/components/merchant-settings/skeletons";
import { PageTransition } from "@/components/layout/page-transition";

export function generateMetadata(): Metadata {
  return { title: account.settings.nav.notifications, robots: { index: false, follow: false } };
}

async function NotificationsContent() {
  const next = sitePath(SETTINGS_PATHS.notifications);
  await requireRank("merchant", next);
  const t = merchantSettings;
  const prefs = await settle(() => apiSessionGet<NotificationPreferences>(FAMILY_ROUTES.client.notificationPreferences), next);
  if (!prefs.ok) return <LoadError error={prefs.error} />;
  return <NotificationsForm initial={prefs.data} t={t.notifications} fieldTexts={t.fieldErrors} />;
}

export default function NotificationsPage() {
  return (
    <PageTransition>
      <Suspense fallback={<CardSkeleton rows={5} />}>
        <NotificationsContent />
      </Suspense>
    </PageTransition>
  );
}
