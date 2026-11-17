// Quick view (mockup "product quick view"): a card's eye link (`/en/quick-view/<slug>`) followed inside the shop is
// intercepted here and shown in a dialog over the current page, which stays as it was. Opened directly (new tab,
// refresh, shared link) the same URL is the service page (../../../quick-view/[slug]). The frame and the skeletons are
// static; the title, body and actions read the slug, so each streams in behind <Suspense>. The same slugs as the service
// page are prerendered: their title, body and actions are then static output, and a prefetch of the dialog carries them
// (plan P3.3). The price (currency cookie) renders on the click, behind its own <Suspense> in the body.
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
import { serviceStaticParams } from "@/components/store/service-static-params";
import { store } from "@/lib/i18n/messages/store";

/** The service page's prerendered slugs (at most 50; every other slug renders on demand). */
export async function generateStaticParams() {
  return serviceStaticParams();
}

export default function QuickViewDialog({ params }: { params: Promise<{ slug: string }> }) {
  const t = store;
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
