// One help article: question, answer (Markdown), category, updated date, and a way to reach support.
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Headset } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Markdown } from "@/components/ui/markdown";
import { staticSlugParams } from "@/components/store/static-params";
import { demoteHeadings } from "@/components/store/markdown-source";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { getHelpArticle, listHelpArticles } from "@/lib/api/public";
import { formatDate } from "@/lib/format";
import { dirOf, isLocale, localePath } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/define";
import { common } from "@/lib/i18n/messages/common";
import { store } from "@/lib/i18n/messages/store";
import { getLocale, getMessages } from "@/lib/i18n/server";

/** First sentence-ish of a Markdown answer, for the meta description. */
function plainExcerpt(markdown: string, max = 160): string {
  const text = markdown.replace(/[#*_`>\[\]()!-]/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export async function generateMetadata({ params }: PageProps<"/[lang]/help/[slug]">): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, getLocale()]);
  const article = await getHelpArticle(slug);
  if (!article) return { robots: { index: false } };
  return {
    title: article.question,
    description: plainExcerpt(article.answerMd) || undefined,
    alternates: { canonical: localePath(locale, `/help/${encodeURIComponent(article.slug)}`) },
  };
}

/** Every published help article of the language is prerendered; other slugs render on demand. */
export async function generateStaticParams() {
  try {
    const list = await listHelpArticles({ locale: await getLocale(), end: 100 });
    return staticSlugParams(list.data.map((article) => article.slug));
  } catch {
    return staticSlugParams([]);
  }
}

export default function HelpArticlePage(props: PageProps<"/[lang]/help/[slug]">) {
  return (
    <Container width="narrow" className="py-8 lg:py-10">
      <Suspense fallback={<ArticleSkeleton />}>
        <Article params={props.params} />
      </Suspense>
    </Container>
  );
}

async function Article({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, locale, t, c] = await Promise.all([params, getLocale(), getMessages(store), getMessages(common)]);
  const article = await getHelpArticle(slug);
  if (!article) notFound();
  // `/help/:slug` has no language parameter: the article may be in the other language than the page.
  const articleLocale = isLocale(article.locale) ? article.locale : locale;
  return (
    <>
      <Breadcrumbs
        label={c.workspace.breadcrumbLabel}
        items={[
          { label: t.help.breadcrumbHome, href: localePath(locale) },
          { label: t.help.title, href: localePath(locale, "/help") },
          { label: article.question },
        ]}
      />
      <article className="mt-5 rounded-card border border-line bg-surface p-5 shadow-card sm:p-8" lang={articleLocale} dir={dirOf(articleLocale)}>
        <header className="grid gap-3">
          {article.category ? (
            <div>
              <Badge tone="outline" shape="tag">
                {article.category}
              </Badge>
            </div>
          ) : null}
          <h1 className="text-title text-ink">{article.question}</h1>
          <p className="text-small text-ink-subtle">{fmt(t.help.updated, { date: formatDate(article.updatedAt, locale) })}</p>
        </header>
        <Markdown source={demoteHeadings(article.answerMd)} className="mt-5" />
      </article>
      <Card className="mt-6">
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-subheading text-ink">{t.help.stillTitle}</h2>
            <p className="text-body text-ink-muted">{t.help.stillText}</p>
          </div>
          <ButtonLink href={localePath(locale, "/support")} startIcon={<Headset aria-hidden="true" />}>
            {t.help.stillCta}
          </ButtonLink>
        </CardBody>
      </Card>
      <p className="mt-6">
        <ButtonLink href={localePath(locale, "/help")} variant="link" startIcon={<ArrowLeft aria-hidden="true" className="rtl:-scale-x-100" />}>
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
      <Skeleton className="mt-6 h-[6.5rem] rounded-card" />
      <Skeleton className="mt-6 h-11 w-48" />
    </div>
  );
}
