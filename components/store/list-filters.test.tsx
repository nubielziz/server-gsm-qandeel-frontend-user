import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LazyListFilters, type ListFiltersProps } from "./list-filters";

const props: ListFiltersProps = {
  action: "/en/services",
  keep: [],
  top: [{ name: "stock", label: "Availability", options: [{ value: "1", label: "In stock only", count: "(3)", selected: false }] }],
  price: null,
  groups: [],
  locale: "en",
  labels: { priceRange: "Price", minPrice: "Minimum price", maxPrice: "Maximum price", showMore: "Show {count} more", showLess: "Show less", apply: "Show results", clear: "Clear all" },
  clearHref: null,
};

describe("LazyListFilters: the phone drawer's copy of the filter form (plan P3.4)", () => {
  it("renders nothing on the server, so the page's HTML holds only the sidebar's form", () => {
    expect(renderToStaticMarkup(<LazyListFilters dialogId="catalog-filters" {...props} />)).toBe("");
  });
});
