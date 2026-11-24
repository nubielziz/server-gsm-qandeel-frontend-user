// The notice an account of a merchant rank gets where the shop's own checkout cannot serve it (an open checkout, a 403 to the
// session): the way to its own order form at the service's checkout address (decision 003), and the way back.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { checkout } from "@/lib/i18n/messages/checkout";
import { PriceListCard } from "./price-list-card";

const render = (orderHref: string | null = "/en/checkout?service=icloud-clean") =>
  renderToStaticMarkup(<PriceListCard labels={checkout.start.priceList} orderHref={orderHref} serviceHref="/en/services/icloud-clean" />);

describe("the merchant notice of the shop checkout", () => {
  it("says the shop checkout is for retail buyers and leads to the account's own order form", () => {
    const html = render();
    expect(html).toContain("The shop checkout is for retail buyers");
    expect(html).toMatch(/<a [^>]*href="\/en\/checkout\?service=icloud-clean"[^>]*>Order at your price<\/a>/);
    expect(html).not.toContain("/account/services");
  });

  it("links back to the service in the shop", () => {
    expect(render()).toMatch(/<a [^>]*href="\/en\/services\/icloud-clean"[^>]*>Back to the service<\/a>/);
  });

  it("offers no order link for a service without a shop page, only the way back", () => {
    const html = render(null);
    expect(html).not.toContain("Order at your price");
    expect(html).toContain("Back to the service");
  });

  it("holds no form, no field and no way to open a checkout", () => {
    const html = render();
    for (const tag of ["<form", "<input", "<select", "<button"]) expect(html, tag).not.toContain(tag);
    expect(html).not.toContain("/store/v1/checkout-sessions");
  });
});
