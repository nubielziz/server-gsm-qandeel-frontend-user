// Where the payment gateway sends the buyer back: waits for the payment to be confirmed, then shows the tracking link.
import { Suspense } from "react";
import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";
import { ReturnPoller } from "@/components/checkout/return-poller";
import { firstParam, type SearchParams } from "@/components/store/search-params";
import { checkout } from "@/lib/i18n/messages/checkout";
import { getLocale, getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(checkout);
  return { title: t.meta.payment, robots: { index: false, follow: false } };
}

export default async function CheckoutReturnPage(props: PageProps<"/[lang]/checkout/return">) {
  const t = await getMessages(checkout);
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
  const [params, locale, t] = await Promise.all([searchParams, getLocale(), getMessages(checkout)]);
  return <ReturnPoller token={firstParam(params.token, 128)} locale={locale} labels={t.payment} />;
}
