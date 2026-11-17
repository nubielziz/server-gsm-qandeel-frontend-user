// Where the payment gateway sends the buyer back: waits for the payment to be confirmed, then shows the tracking link.
import { Suspense } from "react";
import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";
import { ReturnPoller } from "@/components/checkout/return-poller";
import { firstParam, type SearchParams } from "@/components/store/search-params";
import { checkout } from "@/lib/i18n/messages/checkout";

export function generateMetadata(): Metadata {
  const t = checkout;
  return { title: t.meta.payment, robots: { index: false, follow: false } };
}

export default function CheckoutReturnPage(props: PageProps<"/en/checkout/return">) {
  const t = checkout;
  return (
    <Container width="narrow" className="py-8 lg:py-10">
      <PageHeader title={t.payment.title} />
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-64 rounded-card" />}>
          <Poller searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Container>
  );
}

async function Poller({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const t = checkout;
  return <ReturnPoller token={firstParam(params.token, 128)} labels={t.payment} />;
}
