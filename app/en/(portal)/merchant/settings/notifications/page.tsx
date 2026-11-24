// Notification preferences. These routes need an approved merchant: a pending one gets the notice.
import { Suspense } from "react";
import type { Metadata } from "next";
import { apiSessionGet } from "@/lib/api/server";
import type { NotificationPreferences } from "@/lib/api/types";
import { merchantSettings } from "@/lib/i18n/messages/merchant-settings";
import { LoadError, settle } from "@/components/merchant-settings/load";
import { NotificationsForm } from "@/components/merchant-settings/notifications-form";
import { CardSkeleton } from "@/components/merchant-settings/skeletons";
import { PageTransition } from "@/components/layout/page-transition";

export function generateMetadata(): Metadata {
  const t = merchantSettings;
  return { title: t.layout.nav.notifications };
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

async function NotificationsContent() {
  const t = merchantSettings;
  const prefs = await settle(() => apiSessionGet<NotificationPreferences>("/client/notification-preferences"));
  if (!prefs.ok) return <LoadError error={prefs.error} />;
  return <NotificationsForm initial={prefs.data} t={t.notifications} fieldTexts={t.fieldErrors} />;
}
