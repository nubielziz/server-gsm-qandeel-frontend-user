// Customer notification center: the feed of order results and news, with All / Unread tabs. The frame is static; the
// list reads the session and `searchParams`, so it streams behind <Suspense> with a same-size skeleton.
import type { Metadata } from "next";
import { Suspense } from "react";
import { getMessages } from "@/lib/i18n/server";
import { notifications } from "@/lib/i18n/messages/notifications";
import type { SearchParams } from "@/lib/merchant/lists";
import { PageHeader } from "@/components/layout/container";
import { NotificationList, NotificationListSkeleton } from "@/components/notifications/notification-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(notifications);
  return { title: t.metaTitle, robots: { index: false, follow: false } };
}

export default async function CustomerNotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = await getMessages(notifications);
  return (
    <div className="grid gap-4">
      <PageHeader variant="card" title={t.title} description={t.subtitle} />
      <Suspense fallback={<NotificationListSkeleton />}>
        <NotificationList surface="customer" searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
