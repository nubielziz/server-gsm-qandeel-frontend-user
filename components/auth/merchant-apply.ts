// The merchant application on the "Become a merchant" page: a short form (first name, last name, email, phone, country; no
// password) whose WhatsApp button opens the team's chat with those details written into the message. Nothing is sent to our API
// and nothing is kept: the details only travel inside the `wa.me` link. The form is checked like the sign-up form
// (`checkDetails`). Pure: the page's component draws, this file decides.
import { whatsAppLink } from "@/lib/contact/whatsapp";
import { checkDetails, type DetailsValues, type SignUpErrorTexts } from "./sign-up-fields";

/** The labels of the five details, as the form shows them (`auth.fields`). */
export type DetailLabels = Record<keyof DetailsValues, string>;

/**
 * The message the chat opens with: the sentence the page has always sent first (kept as it is), then one line per detail
 * ("First name: Sam"), so the team has everything in the chat. The country is written by name, the rest as typed (trimmed).
 *
 * @param base the sentence ("Hello, I would like to open a merchant account.")
 * @param labels the field labels
 * @param countryName the name of the chosen country
 */
export function merchantMessage(base: string, values: DetailsValues, labels: DetailLabels, countryName: string): string {
  const lines = [
    `${labels.firstName}: ${values.firstName.trim()}`,
    `${labels.lastName}: ${values.lastName.trim()}`,
    `${labels.email}: ${values.email.trim()}`,
    `${labels.phone}: ${values.phone.trim()}`,
    `${labels.country}: ${countryName}`,
  ];
  return [base, ...lines].join("\n");
}

/** What pressing the button does: the problems to show under the fields, or the link to open. */
export type MerchantApplication = { ok: true; href: string } | { ok: false; problems: Record<string, string> };

/**
 * Checks the form and builds the `wa.me` link with the details in the message. A form with a problem opens nothing.
 *
 * @param digits the team's WhatsApp number as digits (`merchantWhatsApp().digits`)
 * @param countries the countries the menu offers, `{ code, name }`
 */
export function prepareMerchantChat(
  values: DetailsValues,
  input: {
    digits: string;
    base: string;
    labels: DetailLabels;
    countries: readonly { code: string; name: string }[];
    text: Pick<SignUpErrorTexts, "required" | "name" | "email" | "phone" | "country">;
  },
): MerchantApplication {
  const problems = checkDetails(
    values,
    input.countries.map((country) => country.code),
    input.text,
  );
  if (Object.keys(problems).length > 0) return { ok: false, problems };
  const country = input.countries.find((entry) => entry.code === values.country);
  const message = merchantMessage(input.base, values, input.labels, country?.name ?? values.country);
  return { ok: true, href: whatsAppLink(input.digits, message) };
}
