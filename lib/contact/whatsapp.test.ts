import { afterEach, describe, expect, it, vi } from "vitest";
import { displayWhatsAppNumber, merchantWhatsApp, normaliseWhatsAppNumber, whatsAppChatLink, whatsAppLink } from "./whatsapp";

describe("normaliseWhatsAppNumber", () => {
  it("keeps only the digits of a number written with a plus, spaces, dashes or brackets", () => {
    expect(normaliseWhatsAppNumber("+1 202 555 0100")).toBe("12025550100");
    expect(normaliseWhatsAppNumber("+1 (202) 555-0100")).toBe("12025550100");
    expect(normaliseWhatsAppNumber("  +962 7 9012 3456  ")).toBe("962790123456");
  });

  it("drops the 00 dialling prefix, which wa.me does not take", () => {
    expect(normaliseWhatsAppNumber("0012025550100")).toBe("12025550100");
    expect(normaliseWhatsAppNumber("00 962 7 9012 3456")).toBe("962790123456");
  });

  it("accepts 8 and 15 digits and refuses 7 and 16", () => {
    expect(normaliseWhatsAppNumber("12345678")).toBe("12345678");
    expect(normaliseWhatsAppNumber("123456789012345")).toBe("123456789012345");
    expect(normaliseWhatsAppNumber("1234567")).toBeNull();
    expect(normaliseWhatsAppNumber("1234567890123456")).toBeNull();
  });

  it("refuses a number that is too short or too long once formatting is removed", () => {
    expect(normaliseWhatsAppNumber("+1 202")).toBeNull();
    expect(normaliseWhatsAppNumber("+1 202 555 0100 0100 0100")).toBeNull();
  });

  it("treats empty, blank, unset and text without digits as not configured", () => {
    expect(normaliseWhatsAppNumber("")).toBeNull();
    expect(normaliseWhatsAppNumber("   ")).toBeNull();
    expect(normaliseWhatsAppNumber(undefined)).toBeNull();
    expect(normaliseWhatsAppNumber(null)).toBeNull();
    expect(normaliseWhatsAppNumber("call us")).toBeNull();
    expect(normaliseWhatsAppNumber("+000 000")).toBeNull();
  });
});

describe("merchantWhatsApp", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("gives the digits for the link and the number as the owner grouped it for the page", () => {
    vi.stubEnv("NEXT_PUBLIC_MERCHANT_WHATSAPP", "+1 202 555 0100");
    expect(merchantWhatsApp()).toEqual({ digits: "12025550100", display: "+1 202 555 0100" });
    vi.stubEnv("NEXT_PUBLIC_MERCHANT_WHATSAPP", "  +20 12  10230575 ");
    expect(merchantWhatsApp()).toEqual({ digits: "201210230575", display: "+20 12 10230575" });
  });

  it("is null when the value is unset, empty or malformed", () => {
    vi.stubEnv("NEXT_PUBLIC_MERCHANT_WHATSAPP", undefined);
    expect(merchantWhatsApp()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_MERCHANT_WHATSAPP", "");
    expect(merchantWhatsApp()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_MERCHANT_WHATSAPP", "12 34");
    expect(merchantWhatsApp()).toBeNull();
  });
});

describe("whatsAppLink", () => {
  it("opens the chat with the number and the encoded text", () => {
    expect(whatsAppLink("12025550100", "Hello, I would like to open a merchant account.")).toBe(
      "https://wa.me/12025550100?text=Hello%2C%20I%20would%20like%20to%20open%20a%20merchant%20account.",
    );
  });

  it("encodes Arabic text", () => {
    const text = "مرحبًا، أرغب في فتح حساب تاجر.";
    const link = whatsAppLink("12025550100", text);
    expect(link).toBe(`https://wa.me/12025550100?text=${encodeURIComponent(text)}`);
    expect(link).toMatch(/^[\x21-\x7e]+$/); // ASCII only: every Arabic letter is percent-encoded
    expect(new URL(link).searchParams.get("text")).toBe(text);
  });

  it("encodes the characters that would end or split the query: &, # and +", () => {
    const link = whatsAppLink("12025550100", "a&b #1 c+d");
    expect(link).toBe("https://wa.me/12025550100?text=a%26b%20%231%20c%2Bd");
    expect(new URL(link).searchParams.get("text")).toBe("a&b #1 c+d");
    expect(new URL(link).hash).toBe("");
  });
});

describe("displayWhatsAppNumber", () => {
  it("keeps the owner's grouping when the number is written with a plus, digits and spaces", () => {
    expect(displayWhatsAppNumber("+20 12 10230575", "201210230575")).toBe("+20 12 10230575");
    expect(displayWhatsAppNumber(" +1   202 555 0100 ", "12025550100")).toBe("+1 202 555 0100");
  });

  it("falls back to a plus and the digits for any other way of writing it", () => {
    expect(displayWhatsAppNumber("0012025550100", "12025550100")).toBe("+12025550100");
    expect(displayWhatsAppNumber("+1 (202) 555-0100", "12025550100")).toBe("+12025550100");
    expect(displayWhatsAppNumber("12025550100", "12025550100")).toBe("+12025550100");
    expect(displayWhatsAppNumber("+0 20 12 10230575", "201210230575")).toBe("+201210230575");
    expect(displayWhatsAppNumber(undefined, "12025550100")).toBe("+12025550100");
  });
});

describe("the chat link without a message", () => {
  it("is the wa.me address of the number and nothing else", () => {
    expect(whatsAppChatLink("201210230575")).toBe("https://wa.me/201210230575");
  });
});
