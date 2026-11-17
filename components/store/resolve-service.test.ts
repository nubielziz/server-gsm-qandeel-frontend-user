import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LegacySlug, StoreServiceDetail } from "@/lib/api/types";

// The cached store reads are replaced: this test is about what resolveService answers, not about the API.
const getStoreService = vi.fn();
const getLegacySlug = vi.fn();
vi.mock("@/lib/api/public", () => ({
  getStoreService: (...args: unknown[]) => getStoreService(...args),
  getLegacySlug: (...args: unknown[]) => getLegacySlug(...args),
}));

import { prerenderSlugs, resolveService } from "./resolve-service";

/** The slice of a service page the resolver reads. */
function page(fields: Partial<StoreServiceDetail> & { slug: string }): StoreServiceDetail {
  return { id: 1, ...fields } as unknown as StoreServiceDetail;
}

/**
 * Answers like the API: a known slug is its page, anything else `null` (a 404); an old address (decision 039, the
 * seeded `legacy-demo-service` and `legacy-demo-gone` of plan 30 §4.5) is what `GET /store/v1/legacy-slugs/service/:slug`
 * answers, anything else `null`.
 */
function api(pages: Record<string, StoreServiceDetail>, legacy: Record<string, LegacySlug> = {}) {
  getStoreService.mockImplementation(async (slug: string) => pages[slug] ?? null);
  getLegacySlug.mockImplementation(async (kind: string, slug: string) => (kind === "service" ? (legacy[slug] ?? null) : null));
}

beforeEach(() => {
  vi.clearAllMocks();
  getStoreService.mockReset();
  getLegacySlug.mockReset();
});

describe("resolveService", () => {
  const service = page({ slug: "icloud-clean-lost-check", id: 1 });
  const legacy = {
    "legacy-demo-service": { path: "/services/icloud-clean-lost-check", slug: "icloud-clean-lost-check" },
    "legacy-demo-gone": { path: "/services", slug: null },
  };

  it("a known slug is found, with one read and no old-address lookup", async () => {
    api({ "icloud-clean-lost-check": service }, legacy);
    expect(await resolveService("icloud-clean-lost-check")).toEqual({ kind: "found", service });
    expect(getStoreService).toHaveBeenCalledTimes(1);
    expect(getLegacySlug).not.toHaveBeenCalled();
  });

  it("an old address of a service on sale redirects to that service's page", async () => {
    api({ "icloud-clean-lost-check": service }, legacy);
    expect(await resolveService("legacy-demo-service")).toEqual({
      kind: "redirect",
      slug: "icloud-clean-lost-check",
      path: "/services/icloud-clean-lost-check",
    });
    expect(getLegacySlug).toHaveBeenCalledExactlyOnceWith("service", "legacy-demo-service");
  });

  it("an old address of a service with no page on sale redirects to the service list", async () => {
    api({ "icloud-clean-lost-check": service }, legacy);
    expect(await resolveService("legacy-demo-gone")).toEqual({ kind: "redirect", slug: null, path: "/services" });
  });

  it("an unknown slug that was never an address is missing", async () => {
    api({}, legacy);
    expect(await resolveService("nope")).toEqual({ kind: "missing" });
    expect(getStoreService).toHaveBeenCalledTimes(1);
    expect(getLegacySlug).toHaveBeenCalledExactlyOnceWith("service", "nope");
  });

  it("never redirects to the slug that was just not found (two caches out of step would loop)", async () => {
    api({}, { odd: { path: "/services/odd", slug: "odd" } });
    expect(await resolveService("odd")).toEqual({ kind: "missing" });
  });

  it("passes the currency of the visitor to the read, and no language", async () => {
    api({ "icloud-clean-lost-check": service });
    await resolveService("icloud-clean-lost-check", "JOD");
    expect(getStoreService.mock.calls).toEqual([["icloud-clean-lost-check", { currency: "JOD" }]]);
  });
});

describe("prerenderSlugs (plan D20: at most 50, featured first)", () => {
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
