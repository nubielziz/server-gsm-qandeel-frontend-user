// The slots of the personal price layer (decision 003), drawn for each state: what the server draws (the public price, marked for
// the guard), what a guest and a retail account see (the public price, no placeholder), and what an account of a merchant rank
// sees (a placeholder, then its own price; "Not available for your account" with the buy action off). Also: the server's card
// draws its price through a slot, and the guard's CSS rule names the attributes the layer sets.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AnchorHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: unknown }) => (
    <a href={href} data-prefetch={String(prefetch)} {...props} />
  ),
}));

import { Money } from "@/components/ui/money";
import { common } from "@/lib/i18n/messages/common";
import { store as storeMessages } from "@/lib/i18n/messages/store";
import {
  EARLY,
  FAILED,
  OWN_PRICES_ATTRIBUTE,
  PENDING,
  PUBLIC,
  RETAIL_PRICE_ATTRIBUTE,
  UNAVAILABLE,
  type OwnPriceState,
} from "@/lib/store/own-prices";
import { serviceCardLabels } from "./card-labels";
import { OwnBuyView, OwnPrice, OwnPriceBlockView, OwnPriceView, RetailOnlyView } from "./own-price";
import { ServiceCard } from "./service-card";

const labels = storeMessages.ownPrice;
const OWN: OwnPriceState = { kind: "own", price: "3.2000", currency: "USD" };
/** The public price as the server draws it (EUR, so it can never be mistaken for the merchant's USD). */
const RETAIL = <Money amount="4.9900" currency="EUR" decimals={2} />;
const RETAIL_TEXT = "€4.99";

const line = (state: OwnPriceState) =>
  renderToStaticMarkup(
    <OwnPriceView state={state} labels={labels} className="text-heading font-bold">
      {RETAIL}
    </OwnPriceView>,
  );

describe("OwnPriceView: a price in a line", () => {
  it("the server's drawing: the public price, marked so the guard can hide it from a merchant session before hydration", () => {
    const html = line(EARLY);
    expect(html).toContain(RETAIL_TEXT);
    expect(html).toContain(`${RETAIL_PRICE_ATTRIBUTE}=""`);
  });

  it("a guest and a retail account: the public price as drawn, unmarked, and no placeholder", () => {
    const html = line(PUBLIC);
    expect(html).toContain(RETAIL_TEXT);
    expect(html).not.toContain(RETAIL_PRICE_ATTRIBUTE);
    expect(html).not.toContain("skeleton");
    expect(html).not.toContain(labels.loading);
  });

  it("a merchant rank while its price loads: a neutral placeholder, never the public price", () => {
    const html = line(PENDING);
    expect(html).not.toContain(RETAIL_TEXT);
    expect(html).toContain("skeleton");
    expect(html).toContain(labels.loading);
  });

  it("a merchant rank: its own price in its wallet's currency, never the public one", () => {
    const html = line(OWN);
    expect(html).toContain("$3.20");
    expect(html).not.toContain(RETAIL_TEXT);
    expect(html).toContain("text-heading font-bold");
  });

  it('a service the merchant rank may not buy: "Not available for your account"', () => {
    const html = line(UNAVAILABLE);
    expect(html).toContain("Not available for your account");
    expect(html).not.toContain(RETAIL_TEXT);
  });

  it("a read that failed: no price at all", () => {
    const html = line(FAILED);
    expect(html).not.toContain(RETAIL_TEXT);
    expect(html).not.toContain("$");
    expect(html).toContain(labels.failed);
  });

  it("the hooked slot, drawn on the server, is the server's drawing: a guest gets the public price in the HTML itself", () => {
    const html = renderToStaticMarkup(<OwnPrice serviceId={7}>{RETAIL}</OwnPrice>);
    expect(html).toContain(RETAIL_TEXT);
    expect(html).toContain(`${RETAIL_PRICE_ATTRIBUTE}=""`);
  });
});

describe("OwnPriceBlockView: the price block of the service page and the quick view", () => {
  const rule = { min: 5, max: 5, options: [] };
  const block = (state: OwnPriceState) =>
    renderToStaticMarkup(
      <OwnPriceBlockView state={state} labels={labels} rule={rule} q={common.quantity} t={storeMessages.service}>
        <p>public block {RETAIL}</p>
        <p>{storeMessages.service.taxNote}</p>
      </OwnPriceBlockView>,
    );

  it("a guest and a retail account: the public block and its tax line, as the server drew them", () => {
    for (const state of [EARLY, PUBLIC]) {
      const html = block(state);
      expect(html).toContain("public block");
      expect(html).toContain(storeMessages.service.taxNote);
    }
    expect(block(EARLY)).toContain(`${RETAIL_PRICE_ATTRIBUTE}=""`);
    expect(block(PUBLIC)).not.toContain(RETAIL_PRICE_ATTRIBUTE);
  });

  it("a merchant rank: its own price with the same notes, without the tax line and without the public block", () => {
    const html = block(OWN);
    expect(html).toContain("$3.20");
    expect(html).toContain("$16.00"); // "5 for": the notes are worked from the own price
    expect(html).not.toContain("public block");
    expect(html).not.toContain(storeMessages.service.taxNote);
  });

  it("a merchant rank while its price loads: the block's placeholder, no public price", () => {
    const html = block(PENDING);
    expect(html).toContain("skeleton");
    expect(html).not.toContain(RETAIL_TEXT);
    expect(html).toContain(labels.loading);
  });

  it("not for sale to the account: says so, with no price", () => {
    const html = block(UNAVAILABLE);
    expect(html).toContain("Not available for your account");
    expect(html).not.toContain(RETAIL_TEXT);
  });
});

describe("OwnBuyView: the buy action", () => {
  const buy = (state: OwnPriceState, merchant?: string) =>
    renderToStaticMarkup(
      <OwnBuyView state={state} merchant={merchant ? <a href="#order">{merchant}</a> : undefined}>
        <a href="#buy">Buy now</a>
      </OwnBuyView>,
    );

  it("is on for everybody, and for a merchant rank whose price is there or on its way", () => {
    for (const state of [EARLY, PUBLIC, PENDING, OWN, FAILED]) {
      const html = buy(state);
      expect(html).toContain("Buy now");
      expect(html).not.toContain("inert");
    }
  });

  it("is off for a service the account may not buy: out of reach and dimmed", () => {
    const html = buy(UNAVAILABLE);
    expect(html).toContain('inert=""');
    expect(html).toContain("opacity-50");
  });

  it("gives a merchant rank its own action where there is one (a file service), and everybody else theirs", () => {
    expect(buy(PUBLIC, "Order")).toContain("Buy now");
    expect(buy(EARLY, "Order")).toContain("Buy now");
    expect(buy(OWN, "Order")).toContain('href="#order"');
    expect(buy(PENDING, "Order")).not.toContain("Buy now");
  });
});

describe("RetailOnlyView: a price that sums up many services", () => {
  const view = (visitor: "early" | "public" | "personal") =>
    renderToStaticMarkup(
      <RetailOnlyView visitor={visitor} fallback={<span>space</span>}>
        From {RETAIL}
      </RetailOnlyView>,
    );

  it("a guest and a retail account see it; the server marks it for the guard", () => {
    expect(view("public")).toContain(RETAIL_TEXT);
    expect(view("early")).toContain(`${RETAIL_PRICE_ATTRIBUTE}=""`);
  });

  it("a merchant rank does not: the fallback holds its place", () => {
    const html = view("personal");
    expect(html).not.toContain(RETAIL_TEXT);
    expect(html).toContain("space");
  });
});

describe("the shop's card", () => {
  const service = {
    id: 42,
    slug: "icloud-clean",
    title: "iCloud Clean",
    summary: "",
    type: "imei",
    brand: "Apple",
    network: "",
    country: null,
    imageUrl: null,
    availability: "on_request",
    etaText: "",
    deliveryMinutes: 5,
    price: { currency: "EUR", net: "4.9900", gross: "4.9900" },
  };

  it("draws its public price and its order link through the slots of the layer", () => {
    const html = renderToStaticMarkup(
      <ServiceCard service={service as never} decimals={2} labels={serviceCardLabels(storeMessages, common)} />,
    );
    const marker = html.indexOf(`<span class="contents" ${RETAIL_PRICE_ATTRIBUTE}="">`);
    expect(marker).toBeGreaterThan(-1);
    expect(html.indexOf(RETAIL_TEXT)).toBeGreaterThan(marker);
    expect(html).toContain('href="/en/checkout?service=icloud-clean"');
  });
});

describe("the guard's CSS rule", () => {
  it("hides the marked public prices while the page of a merchant session is not live", () => {
    const css = readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8");
    const rule = new RegExp(`\\[${OWN_PRICES_ATTRIBUTE}\\] \\[${RETAIL_PRICE_ATTRIBUTE}\\] \\{\\s*visibility: hidden;`);
    expect(css).toMatch(rule);
  });

  it("the root layout runs the guard script", () => {
    const layout = readFileSync(path.join(__dirname, "../../app/en/layout.tsx"), "utf8");
    expect(layout).toContain("dangerouslySetInnerHTML={{ __html: OWN_PRICES_GUARD }}");
  });
});

describe("no merchant price reaches a shared read", () => {
  it("lib/api/public.ts never reads a route of the account's own catalog", () => {
    const source = readFileSync(path.join(__dirname, "../../lib/api/public.ts"), "utf8");
    expect(source).not.toMatch(/\/client\//);
    expect(source).not.toContain("own-prices");
  });
});
