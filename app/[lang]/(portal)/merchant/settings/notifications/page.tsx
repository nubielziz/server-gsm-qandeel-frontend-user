// Notification preferences and Telegram. These routes need an approved merchant: a pending one gets the notice.
import { Suspense } from "react";
import type { Metadata } from "next";
import { apiSessionGet } from "@/lib/api/server";
import type { NotificationPreferences } from "@/lib/api/types";
import { merchantSettings } from "@/lib/i18n/messages/merchant-settings";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { LoadError, settle } from "@/components/merchant-settings/load";
import { NotificationsForm } from "@/components/merchant-settings/notifications-form";
import { CardSkeleton } from "@/components/merchant-settings/skeletons";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(merchantSettings);
  return { title: t.layout.nav.notifications };
}

export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <div className="grid gap-4">
          <CardSkeleton rows={1} footer={false} />
          <CardSkeleton rows={5} />
        </div>
      }
    >
      <NotificationsContent />
    </Suspense>
  );
}

async function NotificationsContent() {
  const locale = await getLocale();
  const t = await getMessages(merchantSettings);
  const prefs = await settle(locale, () => apiSessionGet<NotificationPreferences>("/client/notification-preferences"));
  if (!prefs.ok) return <LoadError error={prefs.error} locale={locale} />;
  return <NotificationsForm locale={locale} initial={prefs.data} t={t.notifications} fieldTexts={t.fieldErrors} />;
}
