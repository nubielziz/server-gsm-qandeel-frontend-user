// Help center: search, category chips (derived from the articles themselves) and an accordion of questions. The shell is
// static; the filtered list reads `searchParams` behind <Suspense>.
import { Suspense } from "react";
import type { Metadata } from "next";
import { LifeBuoy, SearchX } from "lucide-react";
import { Container, PageHeader } from "@/components/layout/container";
import { PageTransition } from "@/components/layout/page-transition";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { firstParam, type SearchParams } from "@/components/store/search-params";
import { Accordion } from "@/components/store/service-parts";
import { listHelpArticles } from "@/lib/api/public";
import { formatNumber } from "@/lib/format";
import { plural } from "@/lib/i18n/define";
import { common } from "@/lib/i18n/messages/common";
import { store } from "@/lib/i18n/messages/store";
import { sitePath } from "@/lib/site-path";

export function generateMetadata(): Metadata {
  const t = store;
  return {
    title: t.help.title,
    description: t.help.metaDescription,
    alternates: { canonical: sitePath("/help") },
  };
}

export default function HelpPage(props: PageProps<"/en/help">) {
  const t = store;
  const c = common;
  return (
    <PageTransition>
      <Container width="narrow" className="py-8 lg:py-10">
        <PageHeader
          eyebrow={
            <Breadcrumbs label={c.workspace.breadcrumbLabel} items={[{ label: t.home.title, href: sitePath() }, { label: t.help.title }]} />
          }
          title={t.help.title}
          description={t.help.description}
        />
        <Suspense fallback={<HelpSkeleton rows={8} chips={5} />}>
          <HelpList searchParams={props.searchParams} />
        </Suspense>
      </Container>
    </PageTransition>
  );
}

async function HelpList({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const t = store;
  const q = firstParam(params.q);
  const category = firstParam(params.category);
  const base = sitePath("/help");

  // The unfiltered list gives the categories (and is shared by every visitor); the filtered one is the page's content.
  const [all, filtered] = await Promise.all([
    listHelpArticles({ end: 100 }),
    q || category ? listHelpArticles({ q: q || undefined, category: category || undefined, end: 100 }) : null,
  ]);
  const articles = filtered ?? all;
  const categories = [...new Set(all.data.map((a) => a.category).filter(Boolean))];
  const href = (cat: string) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (cat) query.set("category", cat);
    const qs = query.toString();
    return qs ? `${base}?${qs}` : base;
  };

  return (
    <div className="mt-6 grid gap-5">
      <SearchInput
        action={base}
        label={t.help.search}
        placeholder={t.help.searchPlaceholder}
        submitLabel={t.help.searchSubmit}
        defaultValue={q}
        hidden={category ? { category } : undefined}
        large
      />
      {categories.length > 1 ? (
        <Tabs
          label={t.help.categories}
          variant="pill"
          activeKey={category || "all"}
          items={[
            { key: "all", label: t.help.all, href: href("") },
            ...categories.map((cat) => ({ key: cat, label: cat, href: href(cat) })),
          ]}
        />
      ) : null}

      <TabPanel activeKey={category || "all"}>
        <div className="grid gap-5">
          {all.data.length === 0 ? (
            <Card>
              <EmptyState
                icon={<LifeBuoy aria-hidden="true" />}
                title={t.help.noneTitle}
                description={t.help.noneText}
              />
            </Card>
          ) : articles.data.length === 0 ? (
            <Card>
              <EmptyState
                icon={<SearchX aria-hidden="true" />}
                title={t.help.emptyTitle}
                description={t.help.emptyText}
                action={
                  <ButtonLink href={base} variant="secondary">
                    {t.help.emptyAction}
                  </ButtonLink>
                }
              />
            </Card>
          ) : (
            <>
              <p aria-live="polite" className="text-body font-semibold text-ink">
                {plural(articles.total, t.help.results, formatNumber(articles.total))}
              </p>
              <Accordion
                items={articles.data.map((article) => ({
                  id: article.id,
                  question: article.question,
                  answerMd: article.answerMd,
                  href: sitePath(`/help/${encodeURIComponent(article.slug)}`),
                  openLabel: t.help.openArticle,
                }))}
              />
            </>
          )}
        </div>
      </TabPanel>
    </div>
  );
}

function HelpSkeleton({ rows, chips }: { rows: number; chips: number }) {
  return (
    <div aria-busy="true" className="mt-6 grid gap-5">
      <Skeleton className="h-13" />
      {chips > 0 ? (
        <div aria-hidden="true" className="flex h-11 gap-2 overflow-hidden">
          {Array.from({ length: chips }, (_, i) => (
            <Skeleton key={i} className="h-11 w-24 shrink-0 rounded-full" />
          ))}
        </div>
      ) : null}
      {rows > 0 ? (
        <>
          <div className="text-body">
            <Skeleton className="h-[1lh] w-24" />
          </div>
          <div aria-hidden="true" className="divide-y divide-line rounded-card border border-line bg-surface shadow-card">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex min-h-14 items-center px-5 py-3 sm:px-6">
                <Skeleton className="h-5 w-2/3" />
              </div>
            ))}
          </div>
        </>
      ) : (
        <Skeleton className="h-[22rem] rounded-card" />
      )}
    </div>
  );
}
