// sitemap.xml: both languages. Services are matched across languages by id (their slugs differ); help articles, content
// pages (`GET /store/v1/pages`, newest first, without bodies) and the legal documents in force come from the API. A content
// page that is marked `noindex` is live but never listed here; drafts and legal documents are not in the page list at all.
import type { MetadataRoute } from "next";
import { getStoreConfig, listContentPages, listHelpArticles } from "@/lib/api/public";
import type { StorePageListItem } from "@/lib/api/types";
import { allListedServices } from "@/lib/catalog";
import { LOCALES, localePath, type Locale } from "@/lib/i18n/config";

const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:5175").replace(/\/+$/, "");
const url = (locale: Locale, path = "/") => `${site}${localePath(locale, path)}`;

type Entry = MetadataRoute.Sitemap[number];

/** The page route takes at most 100 rows a request. */
const PAGE_ROWS = 100;

/** Every published content page of one language: 100 a request, until the API's total is reached. */
async function allContentPages(locale: Locale): Promise<StorePageListItem[]> {
  const rows: StorePageListItem[] = [];
  for (let start = 0; ; start += PAGE_ROWS) {
    const page = await listContentPages({ locale, start, end: start + PAGE_ROWS });
    rows.push(...page.data);
    if (page.data.length === 0 || start + PAGE_ROWS >= page.total) return rows;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: Entry[] = [];

  // Pages that exist in both languages.
  for (const path of ["/", "/services", "/imei-check", "/help", "/track"]) {
    entries.push(
      ...LOCALES.map((locale) => ({
        url: url(locale, path),
        changeFrequency: path === "/" || path === "/services" ? ("daily" as const) : ("monthly" as const),
        priority: path === "/" ? 1 : path === "/services" ? 0.9 : 0.6,
        alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, url(l, path)])) },
      })),
    );
  }

  try {
    const [config, en, ar] = await Promise.all([getStoreConfig(), allListedServices("en"), allListedServices("ar")]);

    // Legal documents in force: only the languages that have one.
    for (const doc of config.legalDocuments) {
      const locale = LOCALES.find((l) => l === doc.locale);
      if (locale) entries.push({ url: url(locale, `/pages/${doc.type}`), lastModified: doc.effectiveFrom ?? undefined, changeFrequency: "yearly", priority: 0.3 });
    }

    // Services: one entry per listing, with the other language's slug as the alternate.
    const byId = { en: new Map(en.map((s) => [s.id, s.slug])), ar: new Map(ar.map((s) => [s.id, s.slug])) };
    for (const locale of LOCALES) {
      for (const service of locale === "en" ? en : ar) {
        const languages: Record<string, string> = {};
        for (const other of LOCALES) {
          const slug = byId[other].get(service.id);
          if (slug) languages[other] = url(other, `/services/${encodeURIComponent(slug)}`);
        }
        entries.push({
          url: url(locale, `/services/${encodeURIComponent(service.slug)}`),
          changeFrequency: "weekly",
          priority: 0.8,
          alternates: { languages },
        });
      }
    }

    for (const locale of LOCALES) {
      const help = await listHelpArticles({ locale, end: 100 });
      for (const article of help.data) {
        entries.push({ url: url(locale, `/help/${encodeURIComponent(article.slug)}`), lastModified: article.updatedAt, changeFrequency: "monthly", priority: 0.5 });
      }
    }
  } catch {
    // The API is unreachable: serve the static pages only rather than failing the sitemap.
  }

  // Content pages (landing pages, tools, blog, static pages). Their own guard keeps a failing page list from dropping the
  // entries above. A page of one language has no known twin in the other (the slugs differ), so there are no alternates.
  try {
    for (const locale of LOCALES) {
      for (const page of await allContentPages(locale)) {
        if (page.noindex) continue;
        entries.push({ url: url(locale, `/pages/${encodeURIComponent(page.slug)}`), lastModified: page.updatedAt, changeFrequency: "monthly", priority: 0.5 });
      }
    }
  } catch {
    // The page list is unreachable: the sitemap keeps what it has.
  }
  return entries;
}
