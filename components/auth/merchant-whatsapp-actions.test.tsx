import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { auth } from "@/lib/i18n/messages/auth";
import { MerchantWhatsAppActions } from "./merchant-whatsapp-actions";

const en = auth.becomeMerchant;

describe("MerchantWhatsAppActions", () => {
  const html = renderToStaticMarkup(<MerchantWhatsAppActions display="+12025550100" t={en} />);

  it("is a submit button (the form checks the details, then opens the chat) with a name that says it opens WhatsApp in a new tab", () => {
    expect(html).toMatch(/<button[^>]*type="submit"/);
    expect(html).toContain("Chat on WhatsApp");
    expect(html).toContain('<span class="sr-only"> (opens WhatsApp in a new tab)</span>');
    expect(html).toContain('aria-hidden="true"'); // the icon
    expect(html).not.toContain("<a ");
  });

  it("is enabled by itself and disabled when the form asks (until the script has loaded)", () => {
    expect(/<button[^>]*>/.exec(html)?.[0]).not.toContain('disabled=""');
    const off = renderToStaticMarkup(<MerchantWhatsAppActions display="+12025550100" t={en} disabled />);
    expect(/<button[^>]*>/.exec(off)?.[0]).toContain('disabled=""');
  });

  it("shows the number as left-to-right selectable text after its label", () => {
    expect(html).toContain(en.numberLabel);
    expect(html).toMatch(/<span dir="ltr"[^>]*>\+12025550100<\/span>/);
  });

  it("puts the button first and the number under it", () => {
    expect(html.indexOf("Chat on WhatsApp")).toBeLessThan(html.indexOf(en.numberLabel));
  });
});

describe("become-a-merchant messages", () => {
  it("has the three steps and a plain prefilled message", () => {
    expect(en.steps).toHaveLength(3);
    expect(en.message).not.toContain("{");
    expect(en.message).toBe("Hello, I would like to open a merchant account.");
  });
});
