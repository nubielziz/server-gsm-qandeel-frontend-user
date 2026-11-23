import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { WhatsAppFloat } from "./whatsapp-float";

const KEPT = process.env.NEXT_PUBLIC_MERCHANT_WHATSAPP;

afterEach(() => {
  if (KEPT === undefined) delete process.env.NEXT_PUBLIC_MERCHANT_WHATSAPP;
  else process.env.NEXT_PUBLIC_MERCHANT_WHATSAPP = KEPT;
});

describe("WhatsAppFloat", () => {
  it("links to a chat with the team's number, in a new tab, with a name a screen reader can say", () => {
    process.env.NEXT_PUBLIC_MERCHANT_WHATSAPP = "+1 202 555 0100";
    const html = renderToStaticMarkup(<WhatsAppFloat />);
    expect(html).toContain('href="https://wa.me/12025550100"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('aria-label="Chat with us on WhatsApp (opens WhatsApp in a new tab)"');
    expect(html).toContain("whatsapp.png");
  });

  it("draws nothing when no number is configured, or when it is not a phone number", () => {
    delete process.env.NEXT_PUBLIC_MERCHANT_WHATSAPP;
    expect(renderToStaticMarkup(<WhatsAppFloat />)).toBe("");
    process.env.NEXT_PUBLIC_MERCHANT_WHATSAPP = "call us";
    expect(renderToStaticMarkup(<WhatsAppFloat />)).toBe("");
  });
});
