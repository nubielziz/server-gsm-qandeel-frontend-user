// sitemap.xml: the site's English addresses (decision 039: no other language, no alternates). Services, help articles,
// content pages (`GET /store/v1/pages`, newest first, without bodies) and the legal documents in force come from the API.
// A content page that is marked `noindex` is live but never listed here; drafts and legal documents are not in the page
// list at all. Old Arabic addresses are never listed: they answer a permanent redirect (next.config.ts).
import type { MetadataRoute } from "next";
import { getStoreConfig, listContentPages, listHelpArticles } from "@/lib/api/public";
import type { StorePageListItem } from "@/lib/api/types";
import { allListedServices } from "@/lib/catalog";
import { sitePath } from "@/lib/site-path";

const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:5175").replace(/\/+$/, "");
const url = (path = "/") => `${site}${sitePath(path)}`;

type Entry = MetadataRoute.Sitemap[number];

/** The page route takes at most 100 rows a request. */
const PAGE_ROWS = 100;

/** Every published content page: 100 a request, until the API's total is reached. */
async function allContentPages(): Promise<StorePageListItem[]> {
  const rows: StorePageListItem[] = [];
  for (let start = 0; ; start += PAGE_ROWS) {
    const page = await listContentPages({ start, end: start + PAGE_ROWS });
    rows.push(...page.data);
    if (page.data.length === 0 || start + PAGE_ROWS >= page.total) return rows;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: Entry[] = [];

  for (const path of ["/", "/services", "/imei-check", "/help", "/track"]) {
    entries.push({
      url: url(path),
      changeFrequency: path === "/" || path === "/services" ? "daily" : "monthly",
      priority: path === "/" ? 1 : path === "/services" ? 0.9 : 0.6,
    });
  }

  try {
    const [config, services] = await Promise.all([getStoreConfig(), allListedServices()]);

    // Legal documents in force (the API lists only English versions: a retired one in another language is history).
    for (const doc of config.legalDocuments) {
      entries.push({ url: url(`/pages/${doc.type}`), lastModified: doc.effectiveFrom ?? undefined, changeFrequency: "yearly", priority: 0.3 });
    }

    // Services: one entry per listing.
    for (const service of services) {
      entries.push({ url: url(`/services/${encodeURIComponent(service.slug)}`), changeFrequency: "weekly", priority: 0.8 });
    }

    const help = await listHelpArticles({ end: 100 });
    for (const article of help.data) {
      entries.push({ url: url(`/help/${encodeURIComponent(article.slug)}`), lastModified: article.updatedAt, changeFrequency: "monthly", priority: 0.5 });
    }
  } catch {
    // The API is unreachable: serve the static pages only rather than failing the sitemap.
  }

  // Content pages (landing pages, tools, blog, static pages). Their own guard keeps a failing page list from dropping the
  // entries above.
  try {
    for (const page of await allContentPages()) {
      if (page.noindex) continue;
      entries.push({ url: url(`/pages/${encodeURIComponent(page.slug)}`), lastModified: page.updatedAt, changeFrequency: "monthly", priority: 0.5 });
    }
  } catch {
    // The page list is unreachable: the sitemap keeps what it has.
  }
  return entries;
}
