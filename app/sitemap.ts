// sitemap.xml: both languages. Services are matched across languages by id (their slugs differ), help articles and the legal
// documents in force come from the API. Content pages cannot be listed (the API has no list route for them).
import type { MetadataRoute } from "next";
import { getStoreConfig, listHelpArticles } from "@/lib/api/public";
import { allListedServices } from "@/lib/catalog";
import { LOCALES, localePath, type Locale } from "@/lib/i18n/config";

const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:5175").replace(/\/+$/, "");
const url = (locale: Locale, path = "/") => `${site}${localePath(locale, path)}`;

type Entry = MetadataRoute.Sitemap[number];

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
  return entries;
}
