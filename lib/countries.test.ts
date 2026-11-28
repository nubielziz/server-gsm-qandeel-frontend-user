import { describe, expect, it } from "vitest";
import { COUNTRY_CODES, countryOptions, shopCountryOptions } from "./countries";

describe("shopCountryOptions: the countries the shop sells to", () => {
  it("is the countries of the tax rates, each once, named in English and sorted by name", () => {
    const options = shopCountryOptions([{ country: "US" }, { country: "JO" }, { country: "US" }, { country: "GB" }]);
    expect(options).toEqual([
      { code: "JO", name: "Jordan" },
      { code: "GB", name: "United Kingdom" },
      { code: "US", name: "United States" },
    ]);
  });

  it("reads a code in any case as the upper-case code the API wants", () => {
    expect(shopCountryOptions([{ country: "jo" }])).toEqual([{ code: "JO", name: "Jordan" }]);
  });

  it("offers every country when the shop has no tax rate yet, so the menu is never empty", () => {
    const all = shopCountryOptions([]);
    expect(all).toHaveLength(COUNTRY_CODES.length);
    expect(all).toEqual(countryOptions());
  });
});
