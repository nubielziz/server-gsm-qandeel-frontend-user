// "Track an order": explains where the tracking link comes from and opens the order page. Fully static.
import type { Metadata } from "next";
import { LifeBuoy, PackageSearch } from "lucide-react";
import { Container, PageHeader } from "@/components/layout/container";
import { PageTransition } from "@/components/layout/page-transition";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { TrackForm } from "@/components/store/track-form";
import { common } from "@/lib/i18n/messages/common";
import { store } from "@/lib/i18n/messages/store";
import { sitePath } from "@/lib/site-path";

export function generateMetadata(): Metadata {
  const t = store;
  return {
    title: t.track.title,
    description: t.track.metaDescription,
    alternates: { canonical: sitePath("/track") },
  };
}

export default function TrackPage() {
  const t = store;
  const c = common;
  return (
    <PageTransition>
      <Container width="narrow" className="py-8 lg:py-10">
        <PageHeader
          eyebrow={
            <Breadcrumbs label={c.workspace.breadcrumbLabel} items={[{ label: t.track.breadcrumbHome, href: sitePath() }, { label: t.track.title }]} />
          }
          title={t.track.title}
          description={t.track.description}
        />
        <div className="mt-6 grid gap-6">
          <Card>
            <CardBody>
              <TrackForm labels={t.track} />
            </CardBody>
          </Card>
          <Card tone="muted">
            <CardBody className="grid gap-5">
              <div className="flex gap-3">
                <PackageSearch aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink-muted" />
                <div>
                  <h2 className="text-subheading text-ink">{t.track.whereTitle}</h2>
                  <p className="mt-1 text-body text-ink-muted">{t.track.whereText}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <LifeBuoy aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink-muted" />
                <div>
                  <h2 className="text-subheading text-ink">{t.track.noLinkTitle}</h2>
                  <p className="mt-1 text-body text-ink-muted">{t.track.noLinkText}</p>
                  <ButtonLink href={sitePath("/support")} variant="secondary" size="sm" className="mt-3">
                    {t.track.noLinkCta}
                  </ButtonLink>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </Container>
    </PageTransition>
  );
}
