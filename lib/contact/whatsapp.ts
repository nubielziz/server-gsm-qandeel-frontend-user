// The team's WhatsApp contact for merchant applications (owner's decision, 2026-11-16): the site collects nothing, it only
// points a visitor to a WhatsApp number where a team member completes the steps, and staff then create the account in the
// admin console. The number is a BUILD-TIME value, `NEXT_PUBLIC_MERCHANT_WHATSAPP` (see .env.example); unset, empty or
// malformed means "not configured" and the page falls back to the support page, never to a broken `wa.me` link.
// The home page's floating WhatsApp button (owner, 2026-11-23) opens a chat with the same number: the site has one.
// Pure functions, safe to import anywhere (Server and Client Components, tests).

/** An international number has at most 15 digits (E.164) and, with a country code, at least 8 in practice. */
const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

/**
 * The digits of a phone number written in any common way ("+1 202 555 0100", "(1) 202-555-0100", "0012025550100").
 * Everything but digits is dropped, then the leading zeros: `wa.me` wants the number "in international format, omitting
 * any zeroes", and no country code starts with 0, so the `00` dialling prefix of "0012025550100" is not part of the number.
 *
 * @param raw What the owner wrote in the environment (may be unset).
 * @returns The digits when there are 8 to 15 of them, else null ("not configured").
 */
export function normaliseWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  return digits.length >= MIN_DIGITS && digits.length <= MAX_DIGITS ? digits : null;
}

/**
 * The number as the page shows it: as the owner grouped it when it is written with "+", digits and single spaces
 * ("+20 12 10230575" is easier to read and to type on a phone than "+201210230575"), else "+" and the digits.
 *
 * @param raw What the owner wrote in the environment.
 * @param digits The digits `normaliseWhatsAppNumber` kept from it.
 */
export function displayWhatsAppNumber(raw: string | null | undefined, digits: string): string {
  const written = (raw ?? "").trim().replace(/\s+/g, " ");
  return /^\+\d[\d ]*$/.test(written) && written.replace(/\D/g, "") === digits ? written : `+${digits}`;
}

/**
 * The team's number from `NEXT_PUBLIC_MERCHANT_WHATSAPP` as `{ digits, display }` (`digits` for the link, `display` for
 * the page: see `displayWhatsAppNumber`), or null when it is not configured. The value is fixed into the build, like
 * every `NEXT_PUBLIC_*` value.
 */
export function merchantWhatsApp(): { digits: string; display: string } | null {
  // The literal `process.env.NEXT_PUBLIC_*` expression is what `next build` replaces: do not read it through a variable.
  const raw = process.env.NEXT_PUBLIC_MERCHANT_WHATSAPP;
  const digits = normaliseWhatsAppNumber(raw);
  return digits ? { digits, display: displayWhatsAppNumber(raw, digits) } : null;
}

/** The `wa.me` link that opens a chat with `digits` and the message already typed (the visitor still presses send). */
export function whatsAppLink(digits: string, text: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** The `wa.me` link that opens a chat with `digits` and nothing typed (the home page's floating button). */
export function whatsAppChatLink(digits: string): string {
  return `https://wa.me/${digits}`;
}
