import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreServiceDetail } from "@/lib/api/types";

// The cached store reads are replaced: this test is about which slug resolveService follows, not about the API.
const getStoreService = vi.fn();
vi.mock("@/lib/api/public", () => ({ getStoreService: (...args: unknown[]) => getStoreService(...args) }));

import { alternateSlug, prerenderSlugs, resolveService } from "./resolve-service";

/** The slice of a service page the resolver reads. */
function page(fields: Partial<StoreServiceDetail> & { slug: string }): StoreServiceDetail {
  return { id: 1, locale: "en", alternates: [], ...fields } as unknown as StoreServiceDetail;
}

/** Answers like the API: a slug exists in one language only; anything else is `null` (a 404). */
function api(pages: Record<string, StoreServiceDetail>) {
  getStoreService.mockImplementation(async (slug: string, args: { locale: string }) => {
    const found = pages[`${args.locale}:${slug}`];
    return found ?? null;
  });
}

beforeEach(() => {
  // (A block, not an arrow returning the mock: vitest would call a function returned from beforeEach as its cleanup.)
  getStoreService.mockReset();
});

describe("alternateSlug", () => {
  it("reads the slug of the wanted language", () => {
    const service = page({ slug: "a", alternates: [{ locale: "ar", slug: "fahs-icloud" }] });
    expect(alternateSlug(service, "ar")).toBe("fahs-icloud");
    expect(alternateSlug(service, "en")).toBeNull();
  });

  it("is null for a service with no other page, and for a response without the field", () => {
    expect(alternateSlug(page({ slug: "a" }), "ar")).toBeNull();
    expect(alternateSlug({} as unknown as StoreServiceDetail, "ar")).toBeNull();
  });

  it("ignores an alternate without a slug", () => {
    expect(alternateSlug(page({ slug: "a", alternates: [{ locale: "ar", slug: "" }] }), "ar")).toBeNull();
  });
});

describe("resolveService", () => {
  const english = page({ slug: "icloud-clean-lost-check", id: 1, alternates: [{ locale: "ar", slug: "fahs-icloud" }] });
  const arabic = page({ slug: "fahs-icloud", id: 1, locale: "ar", alternates: [{ locale: "en", slug: "icloud-clean-lost-check" }] });
  const englishOnly = page({ slug: "t-mobile-usa-unlock", id: 6, alternates: [] });

  it("a slug of this language is found", async () => {
    api({ "en:icloud-clean-lost-check": english });
    expect(await resolveService("icloud-clean-lost-check", "en")).toEqual({ kind: "found", service: english });
    expect(getStoreService).toHaveBeenCalledTimes(1);
  });

  it("an English slug on the Arabic page redirects to the Arabic slug from `alternates`, without reading the catalog", async () => {
    api({ "en:icloud-clean-lost-check": english, "ar:fahs-icloud": arabic });
    expect(await resolveService("icloud-clean-lost-check", "ar")).toEqual({ kind: "redirect", slug: "fahs-icloud" });
    expect(getStoreService.mock.calls.map((call) => call[1].locale)).toEqual(["ar", "en"]);
  });

  it("an Arabic slug on the English page redirects the other way", async () => {
    api({ "en:icloud-clean-lost-check": english, "ar:fahs-icloud": arabic });
    expect(await resolveService("fahs-icloud", "en")).toEqual({ kind: "redirect", slug: "icloud-clean-lost-check" });
  });

  it("a service with no page in this language stays other-language (the callers answer 404)", async () => {
    api({ "en:t-mobile-usa-unlock": englishOnly });
    expect(await resolveService("t-mobile-usa-unlock", "ar")).toEqual({ kind: "other-language", locale: "en", slug: "t-mobile-usa-unlock" });
  });

  it("an unknown slug is missing", async () => {
    api({});
    expect(await resolveService("nope", "en")).toEqual({ kind: "missing" });
  });

  it("never redirects to the slug it was asked for", async () => {
    api({ "en:odd": page({ slug: "odd", alternates: [{ locale: "ar", slug: "odd" }] }) });
    expect(await resolveService("odd", "ar")).toEqual({ kind: "other-language", locale: "en", slug: "odd" });
  });

  it("passes the currency of the visitor to both reads", async () => {
    api({ "en:icloud-clean-lost-check": english, "ar:fahs-icloud": arabic });
    await resolveService("icloud-clean-lost-check", "ar", "JOD");
    expect(getStoreService.mock.calls.map((call) => call[1].currency)).toEqual(["JOD", "JOD"]);
  });
});

describe("prerenderSlugs (plan D20: at most 50 a language, featured first)", () => {
  const rows = Array.from({ length: 80 }, (_, i) => ({ slug: `s${i}`, isFeatured: i % 10 === 9 }));

  it("lists the featured services first, then the others in the API's order, up to the cap", () => {
    const slugs = prerenderSlugs(rows, 50);
    expect(slugs).toHaveLength(50);
    expect(slugs.slice(0, 8)).toEqual(["s9", "s19", "s29", "s39", "s49", "s59", "s69", "s79"]);
    expect(slugs[8]).toBe("s0");
    expect(slugs[9]).toBe("s1");
    expect(new Set(slugs).size).toBe(50);
  });

  it("returns every slug when there are fewer than the cap, and none for a zero cap", () => {
    expect(prerenderSlugs(rows.slice(0, 3), 50)).toEqual(["s0", "s1", "s2"]);
    expect(prerenderSlugs(rows, 0)).toEqual([]);
    expect(prerenderSlugs([], 50)).toEqual([]);
  });
});
