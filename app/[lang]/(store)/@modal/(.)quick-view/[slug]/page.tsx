// Quick view (mockup "product quick view"): a card's eye link (`/[lang]/quick-view/<slug>`) followed inside the shop is
// intercepted here and shown in a dialog over the current page, which stays as it was. Opened directly (new tab,
// refresh, shared link) the same URL is the service page (../../../quick-view/[slug]). The frame and the skeletons are
// static; the title, body and actions read the slug and the currency cookie, so each streams in behind <Suspense>.
import { Suspense } from "react";
import {
  QuickViewActions,
  QuickViewActionsSkeleton,
  QuickViewBody,
  QuickViewBodySkeleton,
  QuickViewTitle,
  QuickViewTitleSkeleton,
} from "@/components/store/quick-view";
import { QuickViewModal } from "@/components/store/quick-view-modal";
import { store } from "@/lib/i18n/messages/store";
import { getMessages } from "@/lib/i18n/server";

export default async function QuickViewDialog({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getMessages(store);
  return (
    <QuickViewModal
      eyebrow={t.quickView.eyebrow}
      title={
        <Suspense fallback={<QuickViewTitleSkeleton />}>
          <QuickViewTitle params={params} />
        </Suspense>
      }
      footer={
        <Suspense fallback={<QuickViewActionsSkeleton />}>
          <QuickViewActions params={params} />
        </Suspense>
      }
    >
      <Suspense fallback={<QuickViewBodySkeleton />}>
        <QuickViewBody params={params} />
      </Suspense>
    </QuickViewModal>
  );
}
