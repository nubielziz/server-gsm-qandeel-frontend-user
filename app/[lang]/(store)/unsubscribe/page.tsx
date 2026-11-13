// The page behind the "Unsubscribe" link of marketing emails (`/unsubscribe?token=`; `proxy.ts` adds the language to the
// emailed link). Fully static: the form reads the token in the browser behind <Suspense> and sends it only when the
// visitor presses the button. Never indexed, and no Referer is sent (the token is in the URL).
import type { Metadata } from "next";
import { Suspense } from "react";
import { Container, PageHeader } from "@/components/layout/container";
import { UnsubscribeForm } from "@/components/store/unsubscribe-form";
import { Card, CardBody } from "@/components/ui/card";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { notifications } from "@/lib/i18n/messages/notifications";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(notifications);
  return { title: t.unsubscribe.metaTitle, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function UnsubscribePage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages(notifications)]);
  return (
    <Container width="narrow" className="py-8 lg:py-12">
      <PageHeader title={t.unsubscribe.title} />
      <Card className="mt-6">
        <CardBody>
          <Suspense
            fallback={
              <div aria-busy="true" className="grid gap-5">
                <SkeletonText lines={2} />
                <Skeleton className="h-12 w-64 max-w-full rounded-control" />
              </div>
            }
          >
            <UnsubscribeForm locale={locale} t={t.unsubscribe} />
          </Suspense>
        </CardBody>
      </Card>
    </Container>
  );
}
