import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { whatsAppLink } from "@/lib/contact/whatsapp";
import { auth } from "@/lib/i18n/messages/auth";
import { MerchantWhatsAppActions } from "./merchant-whatsapp-actions";

const en = auth.en.register;
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

  it("adds a note with the code in a left-to-right run only when there is a referral code", () => {
    const plain = renderToStaticMarkup(<MerchantWhatsAppActions href={href} display="+12025550100" t={en} />);
    expect(plain).not.toContain("referral code");
    const withCode = renderToStaticMarkup(
      <MerchantWhatsAppActions href={href} display="+12025550100" t={en} referral={{ code: "GSM0001", note: en.referralNote }} />,
    );
    expect(withCode).toMatch(/The referral code <span dir="ltr"[^>]*>GSM0001<\/span> will be included in your message\./);
  });

  it("reserves the note's slot with and without a referral code, so the block keeps its height and nothing moves", () => {
    const slot = /<div class="min-h-\[2lh\] text-small">/;
    const plain = renderToStaticMarkup(<MerchantWhatsAppActions href={href} display="+12025550100" t={en} />);
    const withCode = renderToStaticMarkup(
      <MerchantWhatsAppActions href={href} display="+12025550100" t={en} referral={{ code: "GSM0001", note: en.referralNote }} />,
    );
    expect(plain).toMatch(slot);
    expect(withCode).toMatch(slot);
    // Without a code the slot is empty; with one the note sits in it, under the button and above the number.
    expect(plain).toMatch(/<div class="min-h-\[2lh\] text-small"><\/div>/);
    expect(withCode.indexOf("Chat on WhatsApp")).toBeLessThan(withCode.indexOf("GSM0001"));
    expect(withCode.indexOf("GSM0001")).toBeLessThan(withCode.indexOf(en.numberLabel));
  });
});

describe("merchant register messages", () => {
  it("has the three steps, and the referral texts carry the code placeholder", () => {
    expect(en.steps).toHaveLength(3);
    for (const key of ["referralSentence", "referralNote"] as const) {
      expect(en[key]).toContain("{code}");
    }
  });
});
