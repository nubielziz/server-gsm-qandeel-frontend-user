// The free IMEI check. The page shell is static; the form reads `?imei=` (a quick check from the home page) behind <Suspense>.
import { Suspense } from "react";
import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/layout/container";
import { PageTransition } from "@/components/layout/page-transition";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ImeiCheckForm } from "@/components/store/imei-check-form";
import { firstParam, type SearchParams } from "@/components/store/search-params";
import { common } from "@/lib/i18n/messages/common";
import { store } from "@/lib/i18n/messages/store";
import { sitePath } from "@/lib/site-path";

export function generateMetadata(): Metadata {
  const t = store;
  return {
    title: t.imei.title,
    description: t.imei.metaDescription,
    alternates: { canonical: sitePath("/imei-check") },
  };
}

export default function ImeiCheckPage(props: PageProps<"/en/imei-check">) {
  const t = store;
  const c = common;
  return (
    <PageTransition>
      <Container width="narrow" className="py-8 lg:py-10">
        <PageHeader
          eyebrow={
            <Breadcrumbs
              label={c.workspace.breadcrumbLabel}
              items={[{ label: t.home.title, href: sitePath() }, { label: t.imei.title }]}
            />
          }
          title={t.imei.title}
          description={t.imei.description}
        />
        <div className="mt-6">
          <Suspense fallback={<FormSkeleton />}>
            <Form searchParams={props.searchParams} />
          </Suspense>
        </div>
      </Container>
    </PageTransition>
  );
}

async function Form({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const t = store;
  return (
    <ImeiCheckForm
      labels={t.imei}
      initialImei={firstParam(params.imei, 40)}
      servicesHref={`${sitePath("/services")}`}
    />
  );
}

/** Same box as the form card: label, 52px field, hint, security check, button. */
function FormSkeleton() {
  return (
    <Card>
      <CardBody>
        <div aria-hidden="true" className="grid gap-4">
          <div className="grid gap-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-13" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3 sm:hidden" />
          </div>
          <Skeleton className="h-[79px]" />
          <Skeleton className="h-12 w-36" />
        </div>
      </CardBody>
    </Card>
  );
}
