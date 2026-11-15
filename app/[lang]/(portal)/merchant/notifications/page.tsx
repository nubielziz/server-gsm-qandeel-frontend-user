// Merchant notification center: the same feed as the customer area, on the merchant surface (`/client/notifications`).
// Open to a merchant who is still waiting for approval too. The frame is static; the list streams behind <Suspense>.
import type { Metadata } from "next";
import { Suspense } from "react";
import { getMessages } from "@/lib/i18n/server";
import { notifications } from "@/lib/i18n/messages/notifications";
import type { SearchParams } from "@/lib/merchant/lists";
import { PageHeader } from "@/components/layout/container";
import { NotificationList, NotificationListSkeleton } from "@/components/notifications/notification-list";
import { SoundToggle } from "@/components/notifications/sound-toggle";
import { PageTransition } from "@/components/layout/page-transition";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(notifications);
  return { title: t.metaTitle, robots: { index: false, follow: false } };
}

export default async function MerchantNotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = await getMessages(notifications);
  return (
    <PageTransition>
      <div className="grid gap-4">
        <PageHeader variant="card" title={t.title} description={t.subtitle} actions={<SoundToggle labels={t.sound} />} />
        <Suspense fallback={<NotificationListSkeleton />}>
          <NotificationList surface="merchant" searchParams={searchParams} />
        </Suspense>
      </div>
    </PageTransition>
  );
}
