// The options of the header combobox, worked out from what was typed, the last suggest answer and the recent searches
// (backend plan 29 §7 "Combobox"). One flat order for the keyboard, cut into labelled groups for the eye:
// - text typed: "Check IMEI …" when the text is an IMEI; Suggestions (the ghost's whole phrase first, then the API's
//   completions, then "Did you mean …?" when it adds something); Services; Filters (ready chips);
// - an empty box: Recent searches (with "Clear recent searches" as their last option) and Popular searches.
// Phones get fewer rows (3 suggestions, 4 services, 2 filters). Pure: no DOM, safe to import anywhere (unit-tested).
import type { SuggestBody, SuggestFilter, SuggestService } from "@/lib/api/types";
import { imeiFromQuery, normaliseQuery } from "./terms";

/** Where the options lead, already language-prefixed (`/en/services`, `/en/imei-check`). */
export type SearchPaths = { results: string; imei: string };

export type SearchOption =
  /** A phrase that completes the text (the ghost's phrase or an API completion): fills the box or searches it. */
  | { kind: "completion"; text: string }
  /** The API's correction of the complete words. */
  | { kind: "didYouMean"; text: string }
  | { kind: "service"; service: SuggestService }
  | { kind: "filter"; filter: SuggestFilter }
  | { kind: "recent"; text: string }
  | { kind: "popular"; text: string }
  /** The last option of Recent searches: forgets them. */
  | { kind: "clearRecent" }
  | { kind: "imei"; imei: string };

export type OptionGroupKey = "imei" | "suggestions" | "services" | "filters" | "recent" | "popular";
export type OptionGroup = { key: OptionGroupKey; options: SearchOption[] };

/** How many rows each section shows: a phone (coarse pointer) gets fewer. */
export const LIMITS = {
  fine: { suggestions: 6, services: 6, filters: 4, recent: 8, popular: 8 },
  coarse: { suggestions: 3, services: 4, filters: 2, recent: 8, popular: 8 },
} as const;

export type BuildInput = {
  /** The raw text of the box. */
  value: string;
  /** The last answer (it may be for an earlier text while the next one is on its way), or null. */
  answer: SuggestBody | null;
  /** The raw text that answer was asked for (defaults to the answer's own `q`). */
  answerFor?: string;
  /** The ghost drawn after `value` (`ghostFor`), "" for none. Its whole phrase becomes the first suggestion. */
  ghost: string;
  recent: string[];
  coarse: boolean;
};

/** Options whose text the box can take (Tab, Right arrow, the phone's fill arrow). */
export function isPhrase(option: SearchOption): option is Extract<SearchOption, { text: string }> {
  return "text" in option;
}

/** The groups to draw, in order; empty groups are left out. */
export function buildGroups({ value, answer, answerFor, ghost, recent, coarse }: BuildInput): OptionGroup[] {
  const limits = coarse ? LIMITS.coarse : LIMITS.fine;
  const typed = normaliseQuery(value);
  const groups: OptionGroup[] = [];
  const push = (key: OptionGroupKey, options: SearchOption[]) => {
    if (options.length > 0) groups.push({ key, options });
  };

  if (!typed) {
    const recentShown = recent.slice(0, limits.recent);
    push("recent", recentShown.length > 0 ? [...recentShown.map((text): SearchOption => ({ kind: "recent", text })), { kind: "clearRecent" }] : []);
    const seen = new Set(recentShown.map((text) => normaliseQuery(text)));
    // Popular searches come only with the answer for the empty box (the API sends them for `q=` alone).
    const popular = answer && !normaliseQuery(answerFor ?? answer.q) && Array.isArray(answer.popular) ? answer.popular : [];
    push(
      "popular",
      popular
        .filter((text) => !seen.has(normaliseQuery(text)))
        .slice(0, limits.popular)
        .map((text): SearchOption => ({ kind: "popular", text })),
    );
    return groups;
  }

  const imei = imeiFromQuery(value);
  if (imei) {
    // An IMEI runs no search (the API answers `intent: 'imei'` and nothing else): one way on, the IMEI check.
    push("imei", [{ kind: "imei", imei }]);
    return groups;
  }

  const phrases: SearchOption[] = [];
  const taken = new Set<string>([typed]);
  const addPhrase = (option: Extract<SearchOption, { text: string }>) => {
    const key = normaliseQuery(option.text);
    if (!key || taken.has(key)) return;
    taken.add(key);
    phrases.push({ ...option, text: key });
  };
  if (ghost) addPhrase({ kind: "completion", text: value + ghost });
  for (const completion of answer?.completions ?? []) addPhrase({ kind: "completion", text: completion.text });
  const correction = answer?.didYouMean ? normaliseQuery(answer.didYouMean) : "";
  // "Did you mean" only when it says something new: not the text itself, nor the start of a phrase already offered.
  if (correction && ![...taken].some((text) => text.startsWith(correction))) addPhrase({ kind: "didYouMean", text: correction });
  push("suggestions", phrases.slice(0, limits.suggestions));
  push("services", (answer?.services ?? []).slice(0, limits.services).map((service): SearchOption => ({ kind: "service", service })));
  push("filters", (answer?.filters ?? []).slice(0, limits.filters).map((filter): SearchOption => ({ kind: "filter", filter })));
  return groups;
}

/** Every option of the groups in display order: what the arrows walk through (the index is the option's id suffix). */
export function flatten(groups: OptionGroup[]): SearchOption[] {
  return groups.flatMap((group) => group.options);
}

/** The words a filter chip stands for: its label without a `Kind:` prefix, lower case. */
function labelWords(filter: SuggestFilter): string[] {
  return normaliseQuery(filter.label.replace(/^[^:]{1,20}:\s*/, "")).split(" ").filter(Boolean);
}

/** The URL parameter of a filter kind on the catalog page (`category` takes the category id). */
const FILTER_PARAMS: Record<SuggestFilter["kind"], string> = { brand: "brand", network: "network", country: "country", category: "category" };

/**
 * The catalog link of a filter chip: the typed words minus the ones the chip stands for (`samsung frp` + Brand: Samsung
 * → `?q=frp&brand=Samsung`; `vod` + Carrier: Vodafone → `?network=Vodafone`), `q` left out when nothing remains.
 * Brand and carrier go as their label when it spells the value (the catalog matches them without case); a country as
 * its ISO code; a category as its id.
 */
export function filterHref(results: string, value: string, filter: SuggestFilter): string {
  const words = labelWords(filter);
  const rest = value
    .trim()
    .split(/\s+/)
    .filter((word) => word && !words.some((label) => label.startsWith(word.toLowerCase())))
    .join(" ");
  const params = new URLSearchParams();
  if (rest) params.set("q", rest);
  const named = filter.kind === "brand" || filter.kind === "network";
  const sendLabel = named && filter.label.trim().toLowerCase() === filter.value.trim().toLowerCase();
  params.set(FILTER_PARAMS[filter.kind], sendLabel ? filter.label.trim() : filter.value);
  return `${results}?${params.toString()}`;
}

/** The results page of a phrase: `/en/services?q=samsung+frp`. */
export function resultsHref(results: string, text: string): string {
  const q = text.trim();
  return q ? `${results}?${new URLSearchParams({ q }).toString()}` : results;
}

/** Where an option leads (null for "Clear recent searches", which acts in place). */
export function optionHref(option: SearchOption, value: string, paths: SearchPaths): string | null {
  switch (option.kind) {
    case "completion":
    case "didYouMean":
    case "recent":
    case "popular":
      return resultsHref(paths.results, option.text);
    case "service":
      return `${paths.results}/${encodeURIComponent(option.service.slug)}`;
    case "filter":
      return filterHref(paths.results, value, option.filter);
    case "imei":
      return `${paths.imei}?${new URLSearchParams({ imei: option.imei }).toString()}`;
    case "clearRecent":
      return null;
  }
}

/**
 * A completion as it is drawn: the typed part plain and the rest bold (`sams` → `sams` + **`ung`**); a phrase that does
 * not start with the typed text (a typo match) is bold as a whole.
 */
export function completionParts(text: string, value: string): { typed: string; rest: string } {
  const typed = normaliseQuery(value);
  return typed && text.startsWith(typed) ? { typed, rest: text.slice(typed.length) } : { typed: "", rest: text };
}

/** How many suggestions (every option but services and "Clear recent searches") and services the list holds. */
export function optionCounts(groups: OptionGroup[]): { suggestions: number; services: number } {
  let suggestions = 0;
  let services = 0;
  for (const option of flatten(groups)) {
    if (option.kind === "service") services += 1;
    else if (option.kind !== "clearRecent") suggestions += 1;
  }
  return { suggestions, services };
}
