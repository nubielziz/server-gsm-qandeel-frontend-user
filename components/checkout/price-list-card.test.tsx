// The notice that takes the place of the shop checkout for a merchant rank.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { checkout } from "@/lib/i18n/messages/checkout";
import { PriceListCard } from "./price-list-card";

const render = () =>
  renderToStaticMarkup(
    <PriceListCard
      labels={checkout.start.priceList}
      priceListHref="/en/account/services/42"
      serviceHref="/en/services/icloud-clean"
    />,
  );

describe("the price list card", () => {
  it("says the shop checkout is for retail buyers and leads to the account's own price", () => {
    const html = render();
    expect(html).toContain("The shop checkout is for retail buyers");
    expect(html).toMatch(/<a [^>]*href="\/en\/account\/services\/42"[^>]*>Order at your price<\/a>/);
  });

  it("links back to the service in the shop", () => {
    expect(render()).toMatch(/<a [^>]*href="\/en\/services\/icloud-clean"[^>]*>Back to the service<\/a>/);
  });

  it("holds no form, no field and no way to open a checkout", () => {
    const html = render();
    for (const tag of ["<form", "<input", "<select", "<button"]) expect(html, tag).not.toContain(tag);
    expect(html).not.toContain("/store/v1/checkout-sessions");
  });
});
