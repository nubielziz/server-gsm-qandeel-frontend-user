// Small rules about typed search text, shared by the header combobox (browser) and the results page (server). Pure,
// safe to import anywhere. They mirror the API's own rules (backend plan 29 §5.2, §5.6) where the site needs the same
// answer before the API is asked: which text may be kept as a recent search, and which text is an IMEI.
import { normalizeImei } from "@/lib/format";

/** The typed text as the site compares it: lower case, inner whitespace collapsed to one space, trimmed. */
export function normaliseQuery(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
const ENTITY = /&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,6});/gi;

/** One HTML entity's text (named, decimal or hex), or the entity as written when it is unknown or out of range. */
function decodeEntity(whole: string, body: string): string {
  if (body[0] !== "#") return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  const hex = body[1] === "x" || body[1] === "X";
  const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
  return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
}

/**
 * The text the API searches for (backend plan 29 §4.3 `normaliseText`, mirrored rule for rule): HTML entities decoded
 * once, NFKC, lower case, control characters to spaces, emoji (with the joiner and the variation selectors) and `&`
 * removed, `()[]{}<>|,;:` to spaces, spaces collapsed, trimmed. The search routes refuse a `q` that is empty after this
 * (§5.3: 1-100 characters), so a text such as `&`, `()` or `😀` is never sent as a search.
 */
export function searchText(text: string): string {
  return text
    .replace(ENTITY, decodeEntity)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\p{Extended_Pictographic}|‍|︎|️/gu, "")
    .replace(/&/g, "")
    .replace(/[()[\]{}<>|,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whether a search text may be stored (recent searches here, statistics at the API): 2-64 characters, at most 5 digits
 * in all and no run of 5 digits, no `@`, no link, not a phone number (`+…`). So an IMEI, a phone number, an email
 * address or an order number is never kept, while a model code such as `a525f` is (§5.6 `isRecordableTerm`).
 */
export function isRecordableTerm(text: string): boolean {
  const term = text.trim();
  if (term.length < 2 || term.length > 64) return false;
  if ((term.match(/\d/g) ?? []).length > 5) return false;
  if (/\d{5}/.test(term)) return false;
  if (term.includes("@") || term.startsWith("+")) return false;
  return !/https?:|www\./i.test(term);
}

/** The Luhn check digit of a run of digits (the 15th digit of an IMEI computed from its first 14). */
export function luhnDigit(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    // From the right, every first digit is doubled: the check digit comes after them.
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * The IMEI a search text holds, or null: after removing spaces, dashes, dots and slashes, 15 digits with a valid Luhn
 * check, or 16 digits (an IMEISV: its first 14 digits and their check digit).
 */
export function imeiFromQuery(text: string): string | null {
  const digits = normalizeImei(text.replace(/[./]/g, ""));
  if (/^\d{15}$/.test(digits)) return luhnDigit(digits.slice(0, 14)) === Number(digits[14]) ? digits : null;
  if (/^\d{16}$/.test(digits)) return `${digits.slice(0, 14)}${luhnDigit(digits.slice(0, 14))}`;
  return null;
}
