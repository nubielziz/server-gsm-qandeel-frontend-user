// The checks, the request body and the server's field errors of the forms that collect a person's details: the sign-up form
// (first name, last name, email, phone, country, password: `POST /store/v1/auth/sign-up`), the "finish your account" form of a
// sign-up link opened in another browser (the same without the email: `POST /store/v1/auth/sign-up/finish`) and the merchant
// application on the "Become a merchant" page (the same five details, no password, nothing sent to the API). The checks mirror the server's (backend
// decision 079) so that a typing mistake is told before anything is sent; the server stays the judge, and its field errors land
// under the same fields. Pure: no React, no API calls (the send is passed in), so each rule has a unit test.
import { isApiError } from "@/lib/api/errors";
import type { PendingDetails, SignUpFinishInput, SignUpInput } from "@/lib/api/types";
import { latinDigits } from "@/lib/format";
import { isOnlyDialCode, withCountry } from "@/lib/phone/dial";
import type { ErrorText } from "@/lib/i18n/error-text";
import { feedbackFrom, type FormFeedback } from "./form-errors";

/** A first or last name is 1 to 60 characters (code points, as the server counts them). */
export const NAME_MAX = 60;
/** The first name, one space and the last name must fit the account's name column: 120 characters. */
export const NAME_TOTAL_MAX = 120;
/** A phone number is an optional leading + and 7 to 15 digits (E.164 allows 15). */
export const PHONE_MIN_DIGITS = 7;
export const PHONE_MAX_DIGITS = 15;
/** The password policy the page's rules text states: 10 to 128 characters, at least 5 different ones. */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;
export const PASSWORD_MIN_DISTINCT = 5;

/** What a person types, apart from the password. The keys are the names of the inputs and of the API's fields. */
export type DetailsValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country: string;
};

export type SignUpValues = DetailsValues & { password: string };

/** The form's field names, in the order they are drawn (the first one with a problem gets the focus). */
export const SIGN_UP_FIELDS = ["firstName", "lastName", "email", "country", "phone", "password"] as const;

/** The sentences of the checks (`auth.signUp.errors`). */
export type SignUpErrorTexts = {
  required: string;
  name: string;
  /** Said under the last name when the first name, a space and the last name together are longer than 120 characters. */
  nameTogether: string;
  email: string;
  phone: string;
  country: string;
  passwordLength: string;
  passwordVariety: string;
};

/** The empty form. */
export const EMPTY_DETAILS: DetailsValues = { firstName: "", lastName: "", email: "", phone: "", country: "" };

/**
 * The invisible direction marks (U+200E, U+200F, U+202A to U+202E, U+2066 to U+2069). A phone number or a name pasted from a
 * contact card or a chat often carries them; the server refuses them in names and phones, so the form drops them before it checks
 * and sends (a mark is never part of what a person means to write).
 */
const DIRECTION_MARKS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/** A name as it is sent: the invisible direction marks dropped, then trimmed. */
export function cleanName(raw: string): string {
  return raw.replace(DIRECTION_MARKS, "").trim();
}

/** The number of characters the server counts: code points, not UTF-16 units. */
function characters(text: string): number {
  return [...text].length;
}

/**
 * A phone number the way the API reads it: invisible direction marks, spaces, dashes, dots and brackets removed (the server removes
 * the separators too), and Arabic-Indic and Persian digits turned into 0-9 (an Arabic keyboard types them; the API only takes Latin
 * digits).
 */
export function cleanPhone(raw: string): string {
  return latinDigits(raw.replace(DIRECTION_MARKS, "").trim()).replace(/[\s\-.()]/g, "");
}

/**
 * What choosing a country does to the phone box: a box that holds no number yet (nothing, or only a calling code) gets the
 * country's calling code, ready for the number; a box with a number is left alone, whatever its code (a person may live in one
 * country and keep a number of another).
 * @returns the new value of the box, or null to leave it as it is
 */
export function phoneForCountry(phone: string, country: string): string | null {
  if (!isOnlyDialCode(phone)) return null;
  const next = withCountry("", country);
  return next === phone ? null : next;
}

const PHONE_SHAPE = new RegExp(`^\\+?\\d{${PHONE_MIN_DIGITS},${PHONE_MAX_DIGITS}}$`);
/** An address has something before an @, something after it and no space; the server's check is the full one. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

/** True for an optional leading + and 7 to 15 digits, once the separators are removed. */
export function isPhone(raw: string): boolean {
  return PHONE_SHAPE.test(cleanPhone(raw));
}

/**
 * What is wrong with the details, as `{ field: sentence }` (empty when all is well). Everything is required (a phone box that holds
 * only a calling code counts as empty); a name is 1 to 60 characters once trimmed; the phone has the shape of `isPhone`; the country is one of `countries` (the codes the menu offers).
 * The email is checked only when `values` has one (the finish form has none: the address is already proved).
 * @param countries the codes of the countries the menu offers
 */
export function checkDetails(
  values: Omit<DetailsValues, "email"> & { email?: string },
  countries: readonly string[],
  t: Pick<SignUpErrorTexts, "required" | "name" | "email" | "phone" | "country">,
): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const key of ["firstName", "lastName"] as const) {
    const name = cleanName(values[key]);
    if (name === "") problems[key] = t.required;
    else if (characters(name) > NAME_MAX) problems[key] = t.name;
  }
  if (values.email !== undefined) {
    const email = values.email.trim();
    if (email === "") problems.email = t.required;
    else if (!EMAIL_SHAPE.test(email)) problems.email = t.email;
  }
  // A box that holds only the calling code the country field wrote (or a lone +) holds no number: it is missing, not malformed.
  if (isOnlyDialCode(values.phone)) problems.phone = t.required;
  else if (!isPhone(values.phone)) problems.phone = t.phone;
  if (values.country === "") problems.country = t.country;
  else if (!countries.includes(values.country)) problems.country = t.country;
  return problems;
}

/** What is wrong with a password: nothing typed, a length outside 10 to 128, or fewer than 5 different characters. */
export function checkPassword(password: string, t: Pick<SignUpErrorTexts, "required" | "passwordLength" | "passwordVariety">): string | null {
  if (password === "") return t.required;
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return t.passwordLength;
  if (new Set(password).size < PASSWORD_MIN_DISTINCT) return t.passwordVariety;
  return null;
}

/**
 * The joined name check: when both names are fine on their own but "first, a space, last" is longer than 120 characters (two names
 * of 60), the sentence for the last name; null otherwise. Run after the per-name checks, so it never hides a missing name.
 */
export function checkNameTogether(values: Pick<DetailsValues, "firstName" | "lastName">, t: Pick<SignUpErrorTexts, "nameTogether">): string | null {
  const first = cleanName(values.firstName);
  const last = cleanName(values.lastName);
  if (first === "" || last === "" || characters(first) > NAME_MAX || characters(last) > NAME_MAX) return null;
  return characters(first) + 1 + characters(last) > NAME_TOTAL_MAX ? t.nameTogether : null;
}

/** What is wrong with the whole sign-up form, as `{ field: sentence }` (empty when all is well). */
export function checkSignUp(values: SignUpValues, countries: readonly string[], t: SignUpErrorTexts): Record<string, string> {
  const problems = checkDetails(values, countries, t);
  const together = checkNameTogether(values, t);
  if (together) problems.lastName = together;
  const password = checkPassword(values.password, t);
  if (password) problems.password = password;
  return problems;
}

/**
 * The body of `POST /store/v1/auth/sign-up`: every key, the text trimmed, the phone as the API reads it (`cleanPhone`). The
 * password is sent as typed: spaces in it count.
 */
export function signUpBody(values: SignUpValues): SignUpInput {
  return {
    email: values.email.trim(),
    password: values.password,
    firstName: cleanName(values.firstName),
    lastName: cleanName(values.lastName),
    country: values.country,
    phone: cleanPhone(values.phone),
  };
}

/** A code that says "nothing was sent" (a missing key or an empty value). */
const MISSING = new Set(["required", "invalid_type"]);

/**
 * The sentences that replace the generic ones under the fields the server refused (`feedbackFrom`'s overrides), so the server's
 * 422 reads like the form's own checks: a name outside 1 to 60 characters, an address that is not one, a phone of the wrong
 * shape, a country the shop does not sell to, a password of the wrong length. A password the policy refuses (`WEAK_PASSWORD`)
 * keeps the policy's own text. Any other error gives nothing.
 */
export function serverFieldTexts(error: unknown, t: SignUpErrorTexts): Record<string, string> {
  if (!isApiError(error)) return {};
  const out: Record<string, string> = {};
  const codeOf = (field: string) => error.fieldError(field)?.code;
  for (const field of ["firstName", "lastName"]) {
    const code = codeOf(field);
    if (code) out[field] = MISSING.has(code) ? t.required : t.name;
  }
  const email = codeOf("email");
  if (email) out.email = MISSING.has(email) ? t.required : t.email;
  const phone = codeOf("phone");
  if (phone) out.phone = MISSING.has(phone) ? t.required : t.phone;
  if (codeOf("country")) out.country = t.country;
  const password = codeOf("password");
  if (password === "too_small" || password === "too_big") out.password = t.passwordLength;
  else if (password && MISSING.has(password)) out.password = t.required;
  return out;
}

/** What the sign-up did: sent (the page says "check your email"), or not (the feedback to show). */
export type SignUpOutcome =
  | { sent: true; email: string }
  | {
      sent: false;
      feedback: FormFeedback;
      /** True when a Turnstile token was used up (the request went out): the widget must be asked for a new one. */
      tokenSpent: boolean;
    };

/** What `submitSignUp` needs from the page. */
export type SignUpDeps = {
  /** The codes of the countries the menu offers. */
  countries: readonly string[];
  text: SignUpErrorTexts;
  errorText: ErrorText;
  /** Waits for the Turnstile token; null when the check did not finish. */
  token: () => Promise<string | null>;
  /** "Please wait for the security check to finish, then try again." */
  securityCheckWait: string;
  /** Sends the body (`requestSignUp`); throws the ApiError of a refused call. */
  send: (body: SignUpInput, turnstileToken: string) => Promise<void>;
};

/**
 * The whole submit of the sign-up form, apart from the React state: the checks (nothing is sent while one fails), the
 * Turnstile token, the request, and the feedback of a refused call (the server's field errors under their fields, anything else as
 * the form's message with the request id). Never throws.
 */
export async function submitSignUp(values: SignUpValues, deps: SignUpDeps): Promise<SignUpOutcome> {
  const problems = checkSignUp(values, deps.countries, deps.text);
  if (Object.keys(problems).length > 0) {
    return { sent: false, tokenSpent: false, feedback: { fields: problems, message: null, reference: null } };
  }
  const token = await deps.token();
  if (!token) {
    return { sent: false, tokenSpent: false, feedback: { fields: {}, message: deps.securityCheckWait, reference: null } };
  }
  const body = signUpBody(values);
  try {
    await deps.send(body, token);
    return { sent: true, email: body.email };
  } catch (error) {
    return {
      sent: false,
      tokenSpent: true,
      feedback: feedbackFrom(error, deps.errorText, SIGN_UP_FIELDS, serverFieldTexts(error, deps.text)),
    };
  }
}

/** The finish form's field names, in the order they are drawn (the first one with a problem gets the focus). */
export const FINISH_FIELDS = ["firstName", "lastName", "country", "phone", "password"] as const;

/** What a person types on the "finish your account" form: the four details (prefilled) and the password (empty). */
export type FinishValues = PendingDetails & { password: string };

/**
 * The form's starting values from the details the server handed back. The password starts empty. The country is kept only when
 * the menu offers it (the shop's list may have changed since the form was sent): otherwise the box starts on its prompt, so the
 * person chooses one the server will accept instead of the form sending a code it knows is refused.
 * @param countries the codes of the countries the menu offers
 */
export function finishStart(pending: PendingDetails, countries: readonly string[]): FinishValues {
  return { ...pending, country: countries.includes(pending.country) ? pending.country : "", password: "" };
}

/** What is wrong with the finish form, as `{ field: sentence }` (empty when all is well): the four details and the password. */
export function checkFinish(values: FinishValues, countries: readonly string[], t: SignUpErrorTexts): Record<string, string> {
  const problems = checkDetails(values, countries, t);
  const together = checkNameTogether(values, t);
  if (together) problems.lastName = together;
  const password = checkPassword(values.password, t);
  if (password) problems.password = password;
  return problems;
}

/** The body of `POST /store/v1/auth/sign-up/finish`: the text trimmed, the phone as the API reads it, the password as typed. */
export function finishBody(values: FinishValues): SignUpFinishInput {
  return {
    firstName: cleanName(values.firstName),
    lastName: cleanName(values.lastName),
    country: values.country,
    phone: cleanPhone(values.phone),
    password: values.password,
  };
}

/** What the finish did: done (the page goes on), or not (the feedback to show; `alreadySet` when the account has a password). */
export type FinishOutcome = { done: true } | { done: false; alreadySet: boolean; feedback: FormFeedback };

/** What `submitFinish` needs from the page. */
export type FinishDeps = {
  /** The codes of the countries the menu offers. */
  countries: readonly string[];
  text: SignUpErrorTexts;
  errorText: ErrorText;
  /** Sends the body (`finishSignUp`); throws the ApiError of a refused call. */
  send: (body: SignUpFinishInput) => Promise<unknown>;
};

/**
 * The whole submit of the finish form, apart from the React state: the checks (nothing is sent while one fails), the request, and
 * the feedback of a refused call (the server's field errors under their fields, anything else as the form's message with the
 * request id). A 409 means the account already has a password (finished in another tab, or by an earlier visit): `alreadySet`.
 * No Turnstile: the route is for the signed-in account the link opened. Never throws.
 */
export async function submitFinish(values: FinishValues, deps: FinishDeps): Promise<FinishOutcome> {
  const problems = checkFinish(values, deps.countries, deps.text);
  if (Object.keys(problems).length > 0) {
    return { done: false, alreadySet: false, feedback: { fields: problems, message: null, reference: null } };
  }
  try {
    await deps.send(finishBody(values));
    return { done: true };
  } catch (error) {
    return {
      done: false,
      alreadySet: isApiError(error) && error.status === 409,
      feedback: feedbackFrom(error, deps.errorText, FINISH_FIELDS, serverFieldTexts(error, deps.text)),
    };
  }
}
