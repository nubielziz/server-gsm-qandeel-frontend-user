// The listbox markup of the header search (ARIA 1.2): groups with labels, options with ids and `aria-selected`, no active
// option by default, real links out of the tab order, no prefetch, and the title's marks without injected HTML.
import type { AnchorHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => (
    <a href={href} data-prefetch={String(prefetch)} {...props} />
  ),
}));

import type { SuggestBody } from "@/lib/api/types";
import { buildGroups } from "@/lib/search/options";
import { SuggestionList, filterText, type SuggestionListLabels } from "./suggestion-list";

const LABELS: SuggestionListLabels = {
  label: "Search services",
  suggestions: "Suggestions",
  services: "Services",
  filters: "Filters",
  recent: "Recent searches",
  clearRecent: "Clear recent searches",
  popular: "Popular searches",
  fill: "Fill in {text}",
  imei: "Check IMEI {imei}",
  didYouMean: "Did you mean {q}?",
  taxNote: "Prices before tax",
  country: "Country: {name}",
  brand: "Brand: {name}",
  network: "Carrier: {name}",
  category: "Category: {name}",
  inStock: "In stock",
  onRequest: "On request",
};

const ANSWER: SuggestBody = {
  q: "sams",
  engine: "typesense",
  ghost: "ung",
  completions: [{ text: "samsung frp", kind: "title" }],
  services: [
    {
      id: 7,
      slug: "samsung-frp-bypass",
      title: "Samsung FRP <Bypass>",
      titleHighlight: "<mark>Samsung</mark> FRP &lt;Bypass&gt;",
      brand: "Samsung",
      network: "",
      type: "imei",
      category: { id: 1, name: "FRP" },
      imageUrl: "/store/v1/media/abc.jpg",
      availability: "in_stock",
      price: { currency: "USD", net: "12.5000", gross: "12.5000" },
    },
  ],
  filters: [{ kind: "brand", value: "samsung", label: "Samsung", count: 3 }],
  didYouMean: null,
  popular: [],
  intent: null,
};

function draw(active: number | null, coarse = false) {
  const groups = buildGroups({ value: "sams", answer: ANSWER, ghost: "ung", recent: [], coarse });
  return renderToStaticMarkup(
    <SuggestionList
      id="s1-listbox"
      groups={groups}
      active={active}
      optionId={(i) => `s1-option-${i}`}
      value="sams"
      paths={{ results: "/en/services", imei: "/en/imei-check" }}
      labels={LABELS}
      coarse={coarse}
      onPick={() => {}}
      onFill={() => {}}
    />,
  );
}

describe("SuggestionList", () => {
  it("is a named listbox of labelled groups", () => {
    const html = draw(null);
    expect(html).toMatch(/^<div id="s1-listbox" role="listbox" aria-label="Search services"/);
    for (const key of ["suggestions", "services", "filters"]) {
      expect(html).toContain(`role="group" aria-labelledby="s1-listbox-${key}"`);
      expect(html).toContain(`id="s1-listbox-${key}" role="presentation"`);
    }
  });

  it("has no active option by default; the active one is aria-selected", () => {
    const none = draw(null);
    expect(none).not.toContain('aria-selected="true"');
    expect(none.match(/role="option"/g)).toHaveLength(4);
    const second = draw(1);
    expect(second.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(second).toMatch(/id="s1-option-1" role="option" aria-selected="true"/);
  });

  it("options are links out of the tab order and never prefetched", () => {
    const html = draw(null);
    expect(html).toContain('href="/en/services?q=samsung"');
    expect(html).toContain('href="/en/services/samsung-frp-bypass"');
    expect(html).toContain('href="/en/services?brand=Samsung"');
    expect(html.match(/tabindex="-1"/g)).toHaveLength(4);
    expect(html).not.toContain('data-prefetch="true"');
  });

  it("draws the typed part plain and the rest bold, and the title's marks as text (no injected tags)", () => {
    const html = draw(null);
    expect(html).toContain("sams<strong");
    expect(html).toContain('<mark class="bg-transparent font-bold text-ink">Samsung</mark>');
    expect(html).toContain("FRP &lt;Bypass&gt;");
    expect(html).not.toContain("<Bypass>");
    expect(html).toContain("$12.50");
    expect(html).toContain("In stock");
  });

  it("shows the phone's fill arrow, hidden from assistive technology, only on coarse pointers", () => {
    expect(draw(null)).not.toContain('title="Fill in');
    const phone = draw(null, true);
    expect(phone).toMatch(/<span aria-hidden="true" title="Fill in samsung"/);
  });
});

describe("filterText", () => {
  it("names the filter's kind, unless the label already does", () => {
    expect(filterText({ kind: "brand", value: "samsung", label: "Samsung", count: 1 }, LABELS)).toBe("Brand: Samsung");
    expect(filterText({ kind: "country", value: "GB", label: "United Kingdom", count: 1 }, LABELS)).toBe("Country: United Kingdom");
    expect(filterText({ kind: "country", value: "GB", label: "Country: United Kingdom", count: 1 }, LABELS)).toBe("Country: United Kingdom");
    expect(filterText({ kind: "network", value: "vodafone", label: "Vodafone", count: 1 }, LABELS)).toBe("Carrier: Vodafone");
  });
});
