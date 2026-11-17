// Customer notification center: the feed of order results and news, with All / Unread tabs. The frame is static; the
// list reads the session and `searchParams`, so it streams behind <Suspense> with a same-size skeleton.
import type { Metadata } from "next";
import { Suspense } from "react";
import { notifications } from "@/lib/i18n/messages/notifications";
import type { SearchParams } from "@/lib/merchant/lists";
import { PageHeader } from "@/components/layout/container";
import { NotificationList, NotificationListSkeleton } from "@/components/notifications/notification-list";
import { SoundToggle } from "@/components/notifications/sound-toggle";
import { PageTransition } from "@/components/layout/page-transition";

export function generateMetadata(): Metadata {
  const t = notifications;
  return { title: t.metaTitle, robots: { index: false, follow: false } };
}

export default function CustomerNotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = notifications;
  return (
    <PageTransition>
      <div className="grid gap-4">
        <PageHeader variant="card" title={t.title} description={t.subtitle} actions={<SoundToggle labels={t.sound} />} />
        <Suspense fallback={<NotificationListSkeleton />}>
          <NotificationList surface="customer" searchParams={searchParams} />
        </Suspense>
      </div>
    </PageTransition>
  );
}
