import { describe, expect, it } from "vitest";
import type { SuggestBody, SuggestFilter, SuggestService } from "@/lib/api/types";
import { buildGroups, completionParts, filterHref, flatten, optionCounts, optionHref, resultsHref, type SearchPaths } from "./options";

const PATHS: SearchPaths = { results: "/en/services", imei: "/en/imei-check" };

function service(id: number, slug: string): SuggestService {
  return {
    id,
    slug,
    title: slug,
    titleHighlight: slug,
    brand: "Samsung",
    network: "",
    type: "imei",
    category: { id: 1, name: "Unlock" },
    imageUrl: null,
    availability: "in_stock",
    price: { currency: "USD", net: "10.0000", gross: "10.0000" },
  };
}

function body(over: Partial<SuggestBody> = {}): SuggestBody {
  return {
    q: "sams",
    engine: "typesense",
    ghost: "ung",
    completions: [
      { text: "samsung", kind: "brand" },
      { text: "samsung frp", kind: "title" },
    ],
    services: [service(1, "samsung-frp-bypass"), service(2, "samsung-kg-removal")],
    filters: [{ kind: "brand", value: "samsung", label: "Samsung", count: 12 }],
    didYouMean: null,
    popular: [],
    intent: null,
    ...over,
  };
}

describe("buildGroups: the sections of the list", () => {
  it("typed text: suggestions (the ghost's phrase first, once), services, filters", () => {
    const groups = buildGroups({ value: "sams", answer: body(), ghost: "ung", recent: [], coarse: false });
    expect(groups.map((group) => group.key)).toEqual(["suggestions", "services", "filters"]);
    expect(groups[0].options).toEqual([
      { kind: "completion", text: "samsung" },
      { kind: "completion", text: "samsung frp" },
    ]);
    expect(groups[1].options).toHaveLength(2);
  });

  it("an empty box: recent searches with Clear as their last option, then popular ones not already recent", () => {
    const groups = buildGroups({
      value: "  ",
      answer: body({ q: "", popular: ["icloud", "frp", "imei check"], completions: [], services: [], filters: [], ghost: null }),
      ghost: "",
      recent: ["FRP", "unlock"],
      coarse: false,
    });
    expect(groups.map((group) => group.key)).toEqual(["recent", "popular"]);
    expect(groups[0].options.at(-1)).toEqual({ kind: "clearRecent" });
    expect(groups[0].options).toHaveLength(3);
    expect(groups[1].options).toEqual([
      { kind: "popular", text: "icloud" },
      { kind: "popular", text: "imei check" },
    ]);
  });

  it("an empty box ignores an answer for other text (popular searches come only with the empty answer)", () => {
    const groups = buildGroups({ value: "", answer: body({ popular: ["icloud"] }), ghost: "", recent: [], coarse: false });
    expect(groups).toEqual([]);
  });

  it("an IMEI: one option, Check IMEI, and nothing else", () => {
    const groups = buildGroups({ value: "3569 3803 5643 809", answer: body(), ghost: "", recent: [], coarse: false });
    expect(groups).toEqual([{ key: "imei", options: [{ kind: "imei", imei: "356938035643809" }] }]);
    expect(optionHref(groups[0].options[0], "", PATHS)).toBe("/en/imei-check?imei=356938035643809");
  });

  it("Did you mean only when it adds something", () => {
    const fresh = buildGroups({ value: "samsng frp ", answer: body({ didYouMean: "samsung frp", completions: [], ghost: null }), ghost: "", recent: [], coarse: false });
    expect(fresh[0].options).toEqual([{ kind: "didYouMean", text: "samsung frp" }]);
    // `samsung fr` is the start of the completion `samsung frp`: no second, half-finished correction.
    const covered = buildGroups({
      value: "samsng fr",
      answer: body({ didYouMean: "samsung fr", completions: [{ text: "samsung frp", kind: "title" }], ghost: null }),
      ghost: "",
      recent: [],
      coarse: false,
    });
    expect(covered[0].options).toEqual([{ kind: "completion", text: "samsung frp" }]);
  });

  it("never offers the typed text itself as a completion", () => {
    const groups = buildGroups({ value: "Samsung", answer: body({ completions: [{ text: "samsung", kind: "brand" }] }), ghost: "", recent: [], coarse: false });
    expect(groups[0].key).toBe("services");
  });

  it("phones get 3 suggestions, 4 services and 2 filters at most", () => {
    const many = body({
      completions: Array.from({ length: 6 }, (_, i) => ({ text: `samsung ${i}`, kind: "title" as const })),
      services: Array.from({ length: 6 }, (_, i) => service(i + 1, `s-${i}`)),
      filters: Array.from({ length: 4 }, (_, i): SuggestFilter => ({ kind: "brand", value: `b${i}`, label: `B${i}`, count: 1 })),
    });
    const fine = buildGroups({ value: "sams", answer: many, ghost: "", recent: [], coarse: false });
    const coarse = buildGroups({ value: "sams", answer: many, ghost: "", recent: [], coarse: true });
    expect(fine.map((group) => group.options.length)).toEqual([6, 6, 4]);
    expect(coarse.map((group) => group.options.length)).toEqual([3, 4, 2]);
  });

  it("flatten gives the keyboard order and optionCounts the live region's numbers", () => {
    const groups = buildGroups({ value: "sams", answer: body(), ghost: "ung", recent: [], coarse: false });
    expect(flatten(groups).map((option) => option.kind)).toEqual(["completion", "completion", "service", "service", "filter"]);
    expect(optionCounts(groups)).toEqual({ suggestions: 3, services: 2 });
  });
});

describe("links", () => {
  it("a phrase searches it; a service opens its page", () => {
    expect(resultsHref(PATHS.results, "samsung frp")).toBe("/en/services?q=samsung+frp");
    expect(optionHref({ kind: "recent", text: "at&t" }, "", PATHS)).toBe("/en/services?q=at%26t");
    expect(optionHref({ kind: "service", service: service(1, "samsung-frp-bypass") }, "", PATHS)).toBe("/en/services/samsung-frp-bypass");
    expect(optionHref({ kind: "clearRecent" }, "", PATHS)).toBeNull();
  });

  it("a filter chip keeps the words it does not stand for", () => {
    const brand: SuggestFilter = { kind: "brand", value: "samsung", label: "Samsung", count: 3 };
    expect(filterHref(PATHS.results, "samsung frp", brand)).toBe("/en/services?q=frp&brand=Samsung");
    expect(filterHref(PATHS.results, "sams", brand)).toBe("/en/services?brand=Samsung");
    const network: SuggestFilter = { kind: "network", value: "vodafone", label: "Vodafone", count: 2 };
    expect(filterHref(PATHS.results, "vod", network)).toBe("/en/services?network=Vodafone");
    const country: SuggestFilter = { kind: "country", value: "GB", label: "Country: United Kingdom", count: 2 };
    expect(filterHref(PATHS.results, "united unlock", country)).toBe("/en/services?q=unlock&country=GB");
    const category: SuggestFilter = { kind: "category", value: "4", label: "Carrier unlock", count: 9 };
    expect(filterHref(PATHS.results, "carrier unlock iphone", category)).toBe("/en/services?q=iphone&category=4");
  });

  it("a label that does not spell the value sends the value", () => {
    expect(filterHref(PATHS.results, "x", { kind: "brand", value: "lg", label: "LG Electronics", count: 1 })).toBe("/en/services?q=x&brand=lg");
  });
});

describe("completionParts", () => {
  it("the typed part plain, the rest bold", () => {
    expect(completionParts("samsung frp", "Sams")).toEqual({ typed: "sams", rest: "ung frp" });
    expect(completionParts("samsung frp", "samsung ")).toEqual({ typed: "samsung", rest: " frp" });
  });

  it("a typo match is bold as a whole", () => {
    expect(completionParts("samsung frp", "samsng")).toEqual({ typed: "", rest: "samsung frp" });
  });
});
