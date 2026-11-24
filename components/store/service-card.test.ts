import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { common } from "@/lib/i18n/messages/common";
import { store as storeMessages } from "@/lib/i18n/messages/store";
import { serviceCardLabels } from "./card-labels";
import { PREFETCH_CARDS, ServiceCard, ServiceCardMini, cardPrefetch } from "./service-card";

describe("cardPrefetch: which card title links prefetch the service page's content (plan P3.2)", () => {
  it("is true for the first PREFETCH_CARDS cards of a list", () => {
    expect(PREFETCH_CARDS).toBe(4);
    expect([0, 1, 2, 3].map(cardPrefetch)).toEqual([true, true, true, true]);
  });

  it("keeps Next's default for the later cards and for cards outside a list", () => {
    expect(cardPrefetch(4)).toBe("auto");
    expect(cardPrefetch(23)).toBe("auto");
    expect(cardPrefetch(undefined)).toBe("auto");
  });
});

describe("the card layout (the owner's design A, 2026-11-24)", () => {
  const labels = serviceCardLabels(storeMessages, common);
  const service = {
    id: 7,
    slug: "micromax-unlock",
    title: "Micromax MMX300 unlock code",
    summary: "",
    type: "imei",
    brand: "Micromax",
    network: "T-Mobile",
    country: "US",
    imageUrl: null,
    availability: "in_stock",
    etaText: "",
    deliveryMinutes: 1440,
    price: { currency: "USD", net: "0.7400", gross: "0.7400" },
  };
  const mini = (fields: Record<string, unknown> = {}) =>
    renderToStaticMarkup(createElement(ServiceCardMini, { service: { ...service, ...fields } as never, decimals: 2, labels }));

  it("names the brand and the service type in the identity row", () => {
    const html = mini();
    expect(html).toContain(">Micromax<");
    expect(html).toContain(`>${common.serviceType.imei}<`);
  });

  it("says the delivery time to screen readers as a sentence and marks a stocked service In stock", () => {
    const html = mini();
    expect(html).toContain(labels.delivery.replace("{time}", ""));
    expect(html).toContain(`>${labels.inStock}<`);
    expect(mini({ availability: "on_request" })).not.toContain(`>${labels.inStock}<`);
  });

  it("keeps the order link's full name while its words hide in a narrow card", () => {
    const html = mini();
    expect(html).toContain(`aria-label="Order ${service.title}"`);
    expect(html).toContain(`<span class="hidden @min-[15rem]:inline">${labels.orderNow}</span>`);
    expect(html).toContain('href="/en/checkout?service=micromax-unlock"');
  });

  it("the big card adds the carrier and country as a pill", () => {
    const html = renderToStaticMarkup(createElement(ServiceCard, { service: service as never, decimals: 2, labels }));
    expect(html).toMatch(/T-Mobile · [^<]+/);
  });
});
