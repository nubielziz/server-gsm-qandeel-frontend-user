// Content and legal pages (terms, privacy, refund, cookies and the pages staff write). The body is Markdown from the
// admin console, rendered without raw HTML. 404 when the page is missing, a draft or not in force. The address of a
// retired Arabic page (decision 039) sends the reader on to the home page (`legacyPath`, plan 30 §7.1): inside a 200
// answer that streams, so the metadata of a slug with no page is always `noindex`.
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Scale } from "lucide-react";
import { Container } from "@/components/layout/container";
import { PageTransition } from "@/components/layout/page-transition";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Markdown } from "@/components/ui/markdown";
import { demoteHeadings } from "@/components/store/markdown-source";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { getContentPage, legacyPath } from "@/lib/api/public";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { common } from "@/lib/i18n/messages/common";
import { store } from "@/lib/i18n/messages/store";
import { siteImage } from "@/lib/site-images";
import { sitePath } from "@/lib/site-path";

export async function generateMetadata({ params }: PageProps<"/en/pages/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await getContentPage(slug);
  // No page under this slug (missing, or an old address about to send the reader on): never indexed.
  if (!page) return { robots: { index: false } };
  const title = page.seoTitle || page.title;
  const og = siteImage("og-default.jpg");
  return {
    title,
    description: page.seoDescription || undefined,
    robots: page.noindex ? { index: false } : undefined,
    alternates: { canonical: page.canonicalUrl ?? sitePath(`/pages/${encodeURIComponent(page.slug)}`) },
    openGraph: { title, description: page.seoDescription || undefined, type: "article", locale: "en_US", images: og ? [{ url: og }] : undefined },
  };
}

export default function ContentPage(props: PageProps<"/en/pages/[slug]">) {
  return (
    <PageTransition>
      <Container width="narrow" className="py-8 lg:py-10">
        <Suspense fallback={<PageSkeleton />}>
          <Page params={props.params} />
        </Suspense>
      </Container>
    </PageTransition>
  );
}

async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = store;
  const c = common;
  const page = await getContentPage(slug);
  if (!page) {
    const path = await legacyPath("page", slug);
    if (path) permanentRedirect(sitePath(path));
    notFound();
  }
  return (
    <>
      <Breadcrumbs
        label={c.workspace.breadcrumbLabel}
        items={[{ label: t.page.breadcrumbHome, href: sitePath() }, { label: page.title }]}
      />
      <article className="mt-5 rounded-card border border-line bg-surface p-5 shadow-card sm:p-8">
        <header className="grid gap-3 border-b border-line pb-5">
          {page.legal ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="outline" shape="tag" icon={<Scale aria-hidden="true" />}>
                {t.page.legalNotice}
              </Badge>
              <Badge tone="neutral" shape="tag">
                {fmt(t.page.version, { version: page.legal.version })}
              </Badge>
            </div>
          ) : null}
          <h1 className="text-title text-ink">{page.title}</h1>
          <p className="text-small text-ink-subtle">
            {page.legal
              ? fmt(t.page.effective, { date: formatDate(page.legal.effectiveFrom) })
              : fmt(t.page.updated, { date: formatDate(page.updatedAt) })}
          </p>
        </header>
        <Markdown source={demoteHeadings(page.bodyMd)} className="mt-5" />
      </article>
    </>
  );
}

function PageSkeleton() {
  return (
    <div aria-busy="true" aria-hidden="true">
      <Skeleton className="h-5 w-48" />
      <div className="mt-5 grid gap-4 rounded-card border border-line bg-surface p-5 shadow-card sm:p-8">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-4 w-48" />
        <SkeletonText lines={3} className="mt-4" />
      </div>
    </div>
  );
}
