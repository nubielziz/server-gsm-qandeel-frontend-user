import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { whatsAppLink } from "@/lib/contact/whatsapp";
import { auth } from "@/lib/i18n/messages/auth";
import { MerchantWhatsAppActions } from "./merchant-whatsapp-actions";

const en = auth.becomeMerchant;
const href = whatsAppLink("12025550100", en.message);

describe("MerchantWhatsAppActions", () => {
  it("renders the wa.me link in a new tab with noopener, and a name that says it opens WhatsApp in a new tab", () => {
    const html = renderToStaticMarkup(<MerchantWhatsAppActions href={href} display="+12025550100" t={en} />);
    expect(html).toContain(`href="${href}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toMatch(/rel="[^"]*noopener[^"]*"/);
    expect(html).toContain("Chat on WhatsApp");
    expect(html).toContain('<span class="sr-only"> (opens WhatsApp in a new tab)</span>');
    expect(html).toContain('aria-hidden="true"'); // the icon
  });

  it("shows the number as left-to-right selectable text after its label", () => {
    const html = renderToStaticMarkup(<MerchantWhatsAppActions href={href} display="+12025550100" t={en} />);
    expect(html).toContain(en.numberLabel);
    expect(html).toMatch(/<span dir="ltr"[^>]*>\+12025550100<\/span>/);
  });

  it("puts the button first and the number under it", () => {
    const html = renderToStaticMarkup(<MerchantWhatsAppActions href={href} display="+12025550100" t={en} />);
    expect(html.indexOf("Chat on WhatsApp")).toBeLessThan(html.indexOf(en.numberLabel));
  });
});

describe("become-a-merchant messages", () => {
  it("has the three steps and a plain prefilled message", () => {
    expect(en.steps).toHaveLength(3);
    expect(en.message).not.toContain("{");
  });
});
