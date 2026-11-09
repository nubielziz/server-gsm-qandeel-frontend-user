// The filter fields of the catalog (search, brand, carrier, country, sort) and their buttons. Rendered twice by the page:
// in the sidebar (desktop) and in a drawer (phones). Options come from the catalog itself (`catalogFacets`).
import { Input, Select } from "@/components/ui/input";
import { countryName } from "@/lib/countries";
import type { Locale } from "@/lib/i18n/config";
import { FilterForm } from "./filter-form";

export type CatalogFilterValues = {
  q: string;
  brand: string;
  network: string;
  country: string;
  sort: "featured" | "title";
};

export type CatalogFilterLabels = {
  search: string;
  searchPlaceholder: string;
  brand: string;
  network: string;
  country: string;
  allBrands: string;
  allNetworks: string;
  allCountries: string;
  sort: string;
  sortFeatured: string;
  sortTitle: string;
  apply: string;
  clear: string;
};

export type CatalogFiltersProps = {
  /** Language-prefixed `/services` path. */
  action: string;
  locale: Locale;
  values: CatalogFilterValues;
  facets: { brands: string[]; networks: string[]; countries: string[] };
  labels: CatalogFilterLabels;
};

/** Makes sure a selected value that is not a known facet (a hand-typed URL) still shows in its select. */
function withCurrent(list: string[], current: string): string[] {
  return current && !list.some((v) => v.toLowerCase() === current.toLowerCase()) ? [...list, current] : list;
}

function matching(list: string[], current: string): string {
  return list.find((v) => v.toLowerCase() === current.toLowerCase()) ?? current;
}

export function CatalogFilters({ action, locale, values, facets, labels }: CatalogFiltersProps) {
  const brands = withCurrent(facets.brands, values.brand);
  const networks = withCurrent(facets.networks, values.network);
  const countries = withCurrent(facets.countries, values.country);
  return (
    <FilterForm action={action} defaultSort="featured" applyLabel={labels.apply} clearLabel={labels.clear}>
      <Input type="search" name="q" label={labels.search} placeholder={labels.searchPlaceholder} defaultValue={values.q} autoComplete="off" />
      {brands.length > 0 ? (
        <Select
          name="brand"
          label={labels.brand}
          defaultValue={matching(brands, values.brand)}
          options={[{ value: "", label: labels.allBrands }, ...brands.map((b) => ({ value: b, label: b }))]}
        />
      ) : null}
      {networks.length > 0 ? (
        <Select
          name="network"
          label={labels.network}
          defaultValue={matching(networks, values.network)}
          options={[{ value: "", label: labels.allNetworks }, ...networks.map((n) => ({ value: n, label: n }))]}
        />
      ) : null}
      {countries.length > 0 ? (
        <Select
          name="country"
          label={labels.country}
          defaultValue={matching(countries, values.country.toUpperCase())}
          options={[{ value: "", label: labels.allCountries }, ...countries.map((c) => ({ value: c, label: countryName(c, locale) }))]}
        />
      ) : null}
      <Select
        name="sort"
        label={labels.sort}
        defaultValue={values.sort}
        options={[
          { value: "featured", label: labels.sortFeatured },
          { value: "title", label: labels.sortTitle },
        ]}
      />
    </FilterForm>
  );
}
