import { describe, expect, it } from "vitest";
import { auth } from "@/lib/i18n/messages/auth";
import { merchantMessage, prepareMerchantChat } from "./merchant-apply";
import type { DetailsValues } from "./sign-up-fields";

const labels = {
  firstName: auth.fields.firstName,
  lastName: auth.fields.lastName,
  email: auth.fields.email,
  phone: auth.fields.phone,
  country: auth.fields.country,
};
const countries = [
  { code: "JO", name: "Jordan" },
  { code: "US", name: "United States" },
];
const base = auth.becomeMerchant.message;
const input = { digits: "12025550100", base, labels, countries, text: auth.signUp.errors };
const good: DetailsValues = {
  firstName: " Sam ",
  lastName: "Hamdan",
  email: "sam@example.com",
  phone: "+962 79 123 4567",
  country: "JO",
};

describe("the merchant message", () => {
  it("keeps the sentence the page has always sent, then one line per detail", () => {
    expect(merchantMessage(base, good, labels, "Jordan")).toBe(
      [
        "Hello, I would like to open a merchant account.",
        "First name: Sam",
        "Last name: Hamdan",
        "Email address: sam@example.com",
        "Phone number: +962 79 123 4567",
        "Country: Jordan",
      ].join("\n"),
    );
  });

  it("writes names typed in any script as they are", () => {
    const message = merchantMessage(base, { ...good, firstName: "\u0633\u0627\u0645\u064a", lastName: "\u0627\u0644\u062d\u0645\u062f\u0627\u0646" }, labels, "Jordan");
    expect(message).toContain("First name: \u0633\u0627\u0645\u064a");
    expect(message).toContain("Last name: \u0627\u0644\u062d\u0645\u062f\u0627\u0646");
  });
});

describe("pressing the WhatsApp button", () => {
  it("opens the chat with the team's number and the details in the message, the country by name", () => {
    const chat = prepareMerchantChat(good, input);
    expect(chat.ok).toBe(true);
    if (!chat.ok) return;
    const url = new URL(chat.href);
    expect(url.origin + url.pathname).toBe("https://wa.me/12025550100");
    const text = url.searchParams.get("text") ?? "";
    expect(text.split("\n")[0]).toBe(base);
    expect(text).toContain("First name: Sam");
    expect(text).toContain("Email address: sam@example.com");
    expect(text).toContain("Phone number: +962 79 123 4567");
    expect(text).toContain("Country: Jordan");
    expect(text).not.toContain("JO");
    // Written into the link as one encoded text, line breaks included.
    expect(chat.href).toContain(encodeURIComponent("\nCountry: Jordan"));
  });

  it("is checked like the sign-up form and opens nothing while a detail is wrong", () => {
    const empty = prepareMerchantChat({ firstName: "", lastName: "", email: "", phone: "", country: "" }, input);
    expect(empty).toEqual({
      ok: false,
      problems: {
        firstName: auth.signUp.errors.required,
        lastName: auth.signUp.errors.required,
        email: auth.signUp.errors.required,
        phone: auth.signUp.errors.required,
        country: auth.signUp.errors.country,
      },
    });
    expect(prepareMerchantChat({ ...good, email: "sam" }, input)).toEqual({ ok: false, problems: { email: auth.signUp.errors.email } });
    expect(prepareMerchantChat({ ...good, phone: "12345" }, input)).toEqual({ ok: false, problems: { phone: auth.signUp.errors.phone } });
    expect(prepareMerchantChat({ ...good, firstName: "A".repeat(61) }, input)).toEqual({
      ok: false,
      problems: { firstName: auth.signUp.errors.name },
    });
    expect(prepareMerchantChat({ ...good, country: "FR" }, input)).toEqual({ ok: false, problems: { country: auth.signUp.errors.country } });
  });
});
