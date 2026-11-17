// Old addresses on the three slug pages (decision 039, plan 30 §7.1). The first hop (an old Arabic address answers 308 to
// the same path under `/en`) is next.config.ts; this is the second: a slug the page does not know is looked up as a
// retired address and the reader is sent on with `permanentRedirect` (on a streamed page an instant redirect inside a
// 200 answer), else the page is a 404. Because that answer is a 200, the metadata of a slug with no page must say
// `noindex`: pinned here for the service, content and help pages. The API reads are replaced; the pages' own code runs.
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LegacySlug, StoreServiceDetail } from "@/lib/api/types";

const reads = vi.hoisted(() => ({
  services: new Map<string, unknown>(),
  pages: new Map<string, unknown>(),
  help: new Map<string, unknown>(),
  legacy: new Map<string, LegacySlug>(),
}));

vi.mock("@/lib/api/public", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api/public")>();
  const legacy = async (kind: string, slug: string) => reads.legacy.get(`${kind}:${slug}`) ?? null;
  return {
    ...original,
    getStoreService: async (slug: string) => reads.services.get(slug) ?? null,
    getContentPage: async (slug: string) => reads.pages.get(slug) ?? null,
    getHelpArticle: async (slug: string) => reads.help.get(slug) ?? null,
    getLegacySlug: legacy,
    legacyPath: async (kind: string, slug: string) => (await legacy(kind, slug))?.path ?? null,
  };
});

import ServicePage, { generateMetadata as serviceMetadata } from "@/app/en/(store)/services/[slug]/page";
import ContentPage, { generateMetadata as pageMetadata } from "@/app/en/(store)/pages/[slug]/page";
import HelpArticlePage, { generateMetadata as helpMetadata } from "@/app/en/(store)/help/[slug]/page";

const SERVICE = { id: 1, slug: "icloud-clean-lost-check", title: "iCloud check", summary: "", seoTitle: "", seoDescription: "" } as unknown as StoreServiceDetail;

beforeEach(() => {
  for (const map of Object.values(reads)) map.clear();
  reads.services.set(SERVICE.slug, SERVICE);
  reads.pages.set("terms", { slug: "terms", title: "Terms", seoTitle: "", seoDescription: "", noindex: false, canonicalUrl: null });
  reads.help.set("12-how-to-order", { slug: "12-how-to-order", question: "How to order", answerMd: "Like this." });
  // The two rows the demo seed adds (plan 30 §4.5), and an old page and help article.
  reads.legacy.set("service:legacy-demo-service", { path: `/services/${SERVICE.slug}`, slug: SERVICE.slug });
  reads.legacy.set("service:legacy-demo-gone", { path: "/services", slug: null });
  reads.legacy.set("page:about-ar", { path: "/", slug: null });
  reads.legacy.set("help:7-old-article", { path: "/help", slug: null });
});

const props = (slug: string) => ({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) }) as never;

/** The first element of the tree (without rendering components) whose component has this name. */
function findElement(node: ReactNode, name: string): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, name);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement<Record<string, unknown>>(node)) return null;
  if (typeof node.type === "function" && node.type.name === name) return node;
  return findElement(node.props.children as ReactNode, name);
}

/**
 * Runs the part of a page that reads the slug (the async component inside its <Suspense>) and answers how it ended:
 * a redirect (`redirect:<status>:<url>`), the not-found page (`404`) or a render (`rendered`).
 */
async function outcome(page: (p: never) => ReactNode, part: string, slug: string): Promise<string> {
  const element = findElement(page(props(slug)), part);
  if (!element) throw new Error(`no <${part}> in the page`);
  try {
    await (element.type as (p: unknown) => Promise<unknown>)(element.props);
    return "rendered";
  } catch (error) {
    const digest = String((error as { digest?: unknown }).digest ?? "");
    if (digest.startsWith("NEXT_REDIRECT;")) {
      const parts = digest.split(";");
      return `redirect:${parts.at(-2)}:${parts.slice(2, -2).join(";")}`;
    }
    if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) return "404";
    throw error;
  }
}

describe("the metadata of a slug with no page is noindex (the in-between answer is a 200)", () => {
  it("service page: an old address, one with no page on sale, and an unknown slug", async () => {
    for (const slug of ["legacy-demo-service", "legacy-demo-gone", "nope"]) {
      expect(await serviceMetadata(props(slug)), slug).toEqual({ robots: { index: false } });
    }
    expect((await serviceMetadata(props(SERVICE.slug))).robots).toBeUndefined();
  });

  it("content page: an old address and an unknown slug", async () => {
    for (const slug of ["about-ar", "nope"]) expect(await pageMetadata(props(slug)), slug).toEqual({ robots: { index: false } });
    expect((await pageMetadata(props("terms"))).robots).toBeUndefined();
  });

  it("help article: an old address and an unknown slug", async () => {
    for (const slug of ["7-old-article", "9-nope"]) expect(await helpMetadata(props(slug)), slug).toEqual({ robots: { index: false } });
    expect((await helpMetadata(props("12-how-to-order"))).robots).toBeUndefined();
  });
});

describe("where an old address sends the reader (permanentRedirect: 308 where the status line is not yet sent)", () => {
  it("service page: the service's page on sale, else the service list; an unknown slug is a 404", async () => {
    expect(await outcome(ServicePage, "ServiceContent", "legacy-demo-service")).toBe(`redirect:308:/en/services/${SERVICE.slug}`);
    expect(await outcome(ServicePage, "ServiceContent", "legacy-demo-gone")).toBe("redirect:308:/en/services");
    expect(await outcome(ServicePage, "ServiceContent", "nope")).toBe("404");
  });

  it("content page: the home page; an unknown slug is a 404", async () => {
    expect(await outcome(ContentPage, "Page", "about-ar")).toBe("redirect:308:/en");
    expect(await outcome(ContentPage, "Page", "nope")).toBe("404");
  });

  it("help article: the help centre; an unknown slug is a 404", async () => {
    expect(await outcome(HelpArticlePage, "Article", "7-old-article")).toBe("redirect:308:/en/help");
    expect(await outcome(HelpArticlePage, "Article", "9-nope")).toBe("404");
  });
});
