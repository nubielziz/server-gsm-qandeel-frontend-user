// One help article: question, answer (Markdown), category, updated date, a helpful vote, and a way to reach support.
// The address of a deleted Arabic article (decision 039) sends the reader on to the help centre (`legacyPath`, plan 30
// §7.1): inside a 200 answer that streams, so the metadata of a slug with no article is always `noindex`.
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft, Headset } from "lucide-react";
import { Container } from "@/components/layout/container";
import { PageTransition } from "@/components/layout/page-transition";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Markdown } from "@/components/ui/markdown";
import { staticSlugParams } from "@/components/store/static-params";
import { demoteHeadings } from "@/components/store/markdown-source";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { HelpVote } from "@/components/store/help-vote";
import { getHelpArticle, legacyPath, listHelpArticles } from "@/lib/api/public";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/define";
import { common } from "@/lib/i18n/messages/common";
import { store } from "@/lib/i18n/messages/store";
import { sitePath } from "@/lib/site-path";

/** First sentence-ish of a Markdown answer, for the meta description. */
function plainExcerpt(markdown: string, max = 160): string {
  const text = markdown.replace(/[#*_`>\[\]()!-]/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export async function generateMetadata({ params }: PageProps<"/en/help/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const article = await getHelpArticle(slug);
  // No article under this slug (missing, or an old address about to send the reader on): never indexed.
  if (!article) return { robots: { index: false } };
  return {
    title: article.question,
    description: plainExcerpt(article.answerMd) || undefined,
    alternates: { canonical: sitePath(`/help/${encodeURIComponent(article.slug)}`) },
  };
}

/** Every published help article is prerendered; other slugs render on demand. */
export async function generateStaticParams() {
  try {
    const list = await listHelpArticles({ end: 100 });
    return staticSlugParams(list.data.map((article) => article.slug));
  } catch {
    return staticSlugParams([]);
  }
}

export default function HelpArticlePage(props: PageProps<"/en/help/[slug]">) {
  return (
    <PageTransition>
      <Container width="narrow" className="py-8 lg:py-10">
        <Suspense fallback={<ArticleSkeleton />}>
          <Article params={props.params} />
        </Suspense>
      </Container>
    </PageTransition>
  );
}

async function Article({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = store;
  const c = common;
  const article = await getHelpArticle(slug);
  if (!article) {
    const path = await legacyPath("help", slug);
    if (path) permanentRedirect(sitePath(path));
    notFound();
  }
  return (
    <>
      <Breadcrumbs
        label={c.workspace.breadcrumbLabel}
        items={[
          { label: t.help.breadcrumbHome, href: sitePath() },
          { label: t.help.title, href: sitePath("/help") },
          { label: article.question },
        ]}
      />
      <article className="mt-5 rounded-card border border-line bg-surface p-5 shadow-card sm:p-8">
        <header className="grid gap-3">
          {article.category ? (
            <div>
              <Badge tone="outline" shape="tag">
                {article.category}
              </Badge>
            </div>
          ) : null}
          <h1 className="text-title text-ink">{article.question}</h1>
          <p className="text-small text-ink-subtle">{fmt(t.help.updated, { date: formatDate(article.updatedAt) })}</p>
        </header>
        <Markdown source={demoteHeadings(article.answerMd)} className="mt-5" />
      </article>
      <HelpVote
        articleId={article.id}
        slug={article.slug}
        labels={{
          question: t.help.voteQuestion,
          yes: t.help.voteYes,
          no: t.help.voteNo,
          thanks: t.help.voteThanks,
          error: t.help.voteError,
        }}
      />
      <Card className="mt-6">
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-subheading text-ink">{t.help.stillTitle}</h2>
            <p className="text-body text-ink-muted">{t.help.stillText}</p>
          </div>
          <ButtonLink href={sitePath("/support")} startIcon={<Headset aria-hidden="true" />}>
            {t.help.stillCta}
          </ButtonLink>
        </CardBody>
      </Card>
      <p className="mt-6">
        <ButtonLink href={sitePath("/help")} variant="link" startIcon={<ArrowLeft aria-hidden="true" />}>
          {t.help.back}
        </ButtonLink>
      </p>
    </>
  );
}

function ArticleSkeleton() {
  return (
    <div aria-busy="true" aria-hidden="true">
      <Skeleton className="h-5 w-64" />
      <div className="mt-5 grid gap-4 rounded-card border border-line bg-surface p-5 shadow-card sm:p-8">
        <Skeleton className="h-6 w-20" />
        <div className="text-title">
          <Skeleton className="h-[1lh] w-3/4" />
        </div>
        <Skeleton className="h-4 w-40" />
        <SkeletonText lines={2} className="mt-2" />
      </div>
      <Skeleton className="mt-6 h-[7.75rem] rounded-card sm:h-[5.875rem]" />
      <Skeleton className="mt-6 h-[6.5rem] rounded-card" />
      <Skeleton className="mt-6 h-11 w-48" />
    </div>
  );
}
