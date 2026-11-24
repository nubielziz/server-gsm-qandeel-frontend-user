// The notification center of every account: the feed of order results, account alerts and news, with All / Unread tabs.
// A retail account reads its inbox on the shop routes and a merchant rank on the portal routes; the page asks the session
// which one (`familyOf`), so there is one page and one address. The frame is static; the list reads the session and
// `searchParams`, so it streams behind <Suspense> with a same-size skeleton.
import type { Metadata } from "next";
import { Suspense } from "react";
import { familyOf } from "@/lib/account/family";
import { requireAccount } from "@/lib/api/session";
import { notifications } from "@/lib/i18n/messages/notifications";
import type { SearchParams } from "@/lib/merchant/lists";
import { NOTIFICATIONS_PAGE } from "@/lib/notifications/link";
import { sitePath } from "@/lib/site-path";
import { PageHeader } from "@/components/layout/container";
import { NotificationList, NotificationListSkeleton } from "@/components/notifications/notification-list";
import { PageTransition } from "@/components/layout/page-transition";

export function generateMetadata(): Metadata {
  const t = notifications;
  return { title: t.metaTitle, robots: { index: false, follow: false } };
}

async function Feed({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const me = await requireAccount(sitePath(NOTIFICATIONS_PAGE));
  return <NotificationList family={familyOf(me)} searchParams={searchParams} />;
}

export default function NotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = notifications;
  return (
    <PageTransition>
      <div className="grid gap-4">
        <PageHeader variant="card" title={t.title} description={t.subtitle} />
        <Suspense fallback={<NotificationListSkeleton />}>
          <Feed searchParams={searchParams} />
        </Suspense>
      </div>
    </PageTransition>
  );
}
