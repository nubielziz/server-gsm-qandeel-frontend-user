import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { errorText } from "@/lib/i18n/error-text-core";
import { auth } from "@/lib/i18n/messages/auth";
import { errors } from "@/lib/i18n/messages/errors";
import {
  checkDetails,
  checkFinish,
  checkNameTogether,
  checkPassword,
  checkSignUp,
  cleanName,
  cleanPhone,
  finishBody,
  finishStart,
  isPhone,
  phoneForCountry,
  serverFieldTexts,
  signUpBody,
  submitFinish,
  submitSignUp,
  type FinishDeps,
  type FinishValues,
  type SignUpDeps,
  type SignUpValues,
} from "./sign-up-fields";

const t = auth.signUp.errors;
const countries = ["JO", "US", "GB"];
const good: SignUpValues = {
  firstName: "Sam",
  lastName: "Hamdan",
  email: "sam@example.com",
  phone: "+962 79 123 4567",
  country: "JO",
  password: "Orchard-Lantern-8841",
};

describe("the phone: an optional leading + and 7 to 15 digits, separators removed", () => {
  it("removes spaces, dashes, dots and brackets, and keeps the +", () => {
    expect(cleanPhone(" +962 (79) 123-4567 ")).toBe("+962791234567");
    expect(cleanPhone("079.123.4567")).toBe("0791234567");
  });

  it("turns Arabic-Indic and Persian digits into Latin ones", () => {
    expect(cleanPhone("+\u0669\u0666\u0662\u0667\u0669\u0661\u0662\u0663\u0664\u0665\u0666\u0667")).toBe("+962791234567");
    expect(cleanPhone("\u06f0\u06f7\u06f9\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7")).toBe("0791234567");
  });

  it("drops the invisible direction marks a pasted number carries, which the server would refuse", () => {
    expect(cleanPhone("\u200e+962 79 123 4567\u200f")).toBe("+962791234567");
    expect(cleanPhone("\u202a+962791234567\u202c")).toBe("+962791234567");
    expect(cleanPhone("\u2066079 123 4567\u2069")).toBe("0791234567");
    expect(isPhone("\u200e+962 79 123 4567")).toBe(true);
  });

  it("accepts 7 to 15 digits, with or without the +", () => {
    expect(isPhone("1234567")).toBe(true);
    expect(isPhone("+1234567")).toBe(true);
    expect(isPhone("123456789012345")).toBe(true);
    expect(isPhone("+12 025 550 100")).toBe(true);
  });

  it("refuses fewer than 7 digits, more than 15, letters, a + that is not first and an empty value", () => {
    expect(isPhone("123456")).toBe(false);
    expect(isPhone("1234567890123456")).toBe(false);
    expect(isPhone("+1234567890123456")).toBe(false);
    expect(isPhone("12345ab67")).toBe(false);
    expect(isPhone("123+4567890")).toBe(false);
    expect(isPhone("++1234567")).toBe(false);
    expect(isPhone("")).toBe(false);
    expect(isPhone("   ")).toBe(false);
  });
});

describe("checkDetails: everything is required, and the server's shapes are checked first", () => {
  it("is empty for good details", () => {
    expect(checkDetails(good, countries, t)).toEqual({});
  });

  it("asks for every detail that is empty or only spaces", () => {
    const empty = { firstName: " ", lastName: "", email: "", phone: "  ", country: "" };
    expect(checkDetails(empty, countries, t)).toEqual({
      firstName: t.required,
      lastName: t.required,
      email: t.required,
      phone: t.required,
      country: t.country,
    });
  });

  it("allows a name of 1 to 60 characters once trimmed, and refuses 61", () => {
    expect(checkDetails({ ...good, firstName: "A", lastName: "B".repeat(60) }, countries, t)).toEqual({});
    expect(checkDetails({ ...good, firstName: " " + "A".repeat(60) + " " }, countries, t)).toEqual({});
    expect(checkDetails({ ...good, firstName: "A".repeat(61), lastName: "B".repeat(61) }, countries, t)).toEqual({
      firstName: t.name,
      lastName: t.name,
    });
  });

  it("keeps names in any script (typed text is data)", () => {
    expect(checkDetails({ ...good, firstName: "\u0633\u0627\u0645\u064a", lastName: "\u0627\u0644\u062d\u0645\u062f\u0627\u0646" }, countries, t)).toEqual({});
  });

  it("refuses an address without an @ part, with spaces or with two @", () => {
    for (const email of ["sam", "sam@", "@example.com", "sam @example.com", "a@b@c"]) {
      expect(checkDetails({ ...good, email }, countries, t), email).toEqual({ email: t.email });
    }
    expect(checkDetails({ ...good, email: "  sam@example.com " }, countries, t)).toEqual({});
  });

  it("refuses a phone of the wrong shape with the phone sentence", () => {
    expect(checkDetails({ ...good, phone: "12345" }, countries, t)).toEqual({ phone: t.phone });
    expect(checkDetails({ ...good, phone: "call me" }, countries, t)).toEqual({ phone: t.phone });
  });

  it("asks for the phone when the box holds only the calling code the country field wrote", () => {
    for (const phone of ["+962 ", "+962", "+", "+1 242 "]) {
      expect(checkDetails({ ...good, phone }, countries, t), phone).toEqual({ phone: t.required });
    }
    // One digit of a number makes it a number of the wrong shape, not a missing one.
    expect(checkDetails({ ...good, phone: "+962 7" }, countries, t)).toEqual({ phone: t.phone });
  });

  it("refuses a country the menu does not offer", () => {
    expect(checkDetails({ ...good, country: "FR" }, countries, t)).toEqual({ country: t.country });
    expect(checkDetails({ ...good, country: "jo" }, countries, t)).toEqual({ country: t.country });
  });
});

describe("phoneForCountry: what choosing a country does to the phone box", () => {
  it("writes the country's calling code into a box that holds no number yet", () => {
    expect(phoneForCountry("", "JO")).toBe("+962 ");
    expect(phoneForCountry("  ", "US")).toBe("+1 ");
    expect(phoneForCountry("+", "JO")).toBe("+962 ");
  });

  it("replaces a calling code that no number follows (the person changed their mind about the country)", () => {
    expect(phoneForCountry("+962 ", "GB")).toBe("+44 ");
    expect(phoneForCountry("+1 242 ", "JO")).toBe("+962 ");
  });

  it("never touches a number, whatever its calling code, and says so with null", () => {
    expect(phoneForCountry("+962 79 123 4567", "US")).toBeNull();
    expect(phoneForCountry("0791234567", "JO")).toBeNull();
    expect(phoneForCountry("+962 7", "US")).toBeNull();
  });

  it("gives null when there is nothing to change", () => {
    expect(phoneForCountry("+962 ", "JO")).toBeNull();
    // A country without a calling code writes nothing.
    expect(phoneForCountry("", "AQ")).toBeNull();
  });

  it("gives a value the form reads as a missing number, and cleans to the bare code", () => {
    const value = phoneForCountry("", "JO") ?? "";
    expect(checkDetails({ ...good, phone: value }, countries, t)).toEqual({ phone: t.required });
    expect(cleanPhone(value)).toBe("+962");
  });
});

describe("checkPassword: the rules the page states", () => {
  const pw = (value: string) => checkPassword(value, t);

  it("is required", () => {
    expect(pw("")).toBe(t.required);
  });

  it("wants 10 to 128 characters", () => {
    expect(pw("abcdefghi")).toBe(t.passwordLength);
    expect(pw("abcdefghij")).toBeNull();
    expect(pw("ab".repeat(5) + "cde".repeat(40))).toBe(t.passwordLength);
    expect(pw("abcde".repeat(25) + "abc")).toBeNull(); // 128
    expect(pw("abcde".repeat(25) + "abcd")).toBe(t.passwordLength); // 129
  });

  it("wants at least 5 different characters", () => {
    expect(pw("abababababab")).toBe(t.passwordVariety);
    expect(pw("abcdabcdabcd")).toBe(t.passwordVariety);
    expect(pw("abcdeabcdeabcde")).toBeNull();
  });

  it("does not trim: spaces count", () => {
    expect(pw("         a")).toBe(t.passwordVariety);
    expect(pw("ab cd ef gh")).toBeNull();
  });
});

describe("checkSignUp and signUpBody", () => {
  it("checks the details and the password together", () => {
    expect(checkSignUp(good, countries, t)).toEqual({});
    expect(checkSignUp({ ...good, firstName: "", password: "short" }, countries, t)).toEqual({
      firstName: t.required,
      password: t.passwordLength,
    });
  });

  it("sends every key: the text trimmed, the phone cleaned, the country as chosen and the password as typed", () => {
    expect(
      signUpBody({
        firstName: " Sam ",
        lastName: " Hamdan",
        email: " sam@example.com ",
        phone: " +962 (79) 123-4567 ",
        country: "JO",
        password: " Orchard Lantern 8841 ",
      }),
    ).toEqual({
      email: "sam@example.com",
      password: " Orchard Lantern 8841 ",
      firstName: "Sam",
      lastName: "Hamdan",
      country: "JO",
      phone: "+962791234567",
    });
    expect(Object.keys(signUpBody(good)).sort()).toEqual(["country", "email", "firstName", "lastName", "password", "phone"]);
  });
});

const problem = (status: number, code: string, fieldErrors: { field: string; code: string; message?: string }[] = [], retryAfter?: number) =>
  new ApiError({
    status,
    code,
    requestId: "req-9",
    retryAfter,
    fieldErrors: fieldErrors.map((e) => ({ message: "", ...e })),
  });

describe("the server's field errors", () => {
  it("name the field and read like the form's own checks", () => {
    const error = problem(422, "VALIDATION_FAILED", [
      { field: "firstName", code: "too_small" },
      { field: "lastName", code: "too_big" },
      { field: "email", code: "invalid_format" },
      { field: "phone", code: "invalid_format" },
      { field: "country", code: "unsupported" },
      { field: "password", code: "too_small" },
    ]);
    expect(serverFieldTexts(error, t)).toEqual({
      firstName: t.name,
      lastName: t.name,
      email: t.email,
      phone: t.phone,
      country: t.country,
      password: t.passwordLength,
    });
  });

  it("say \"required\" for a key that was missing, and leave the password policy's own text alone", () => {
    const error = problem(422, "VALIDATION_FAILED", [
      { field: "phone", code: "invalid_type" },
      { field: "email", code: "required" },
      { field: "password", code: "WEAK_PASSWORD" },
    ]);
    expect(serverFieldTexts(error, t)).toEqual({ phone: t.required, email: t.required });
  });

  it("give nothing for an error that is not an ApiError", () => {
    expect(serverFieldTexts(new Error("x"), t)).toEqual({});
  });
});

describe("submitSignUp: the whole submit of the form", () => {
  const text = errorText(errors);
  function deps(over: Partial<SignUpDeps> = {}): SignUpDeps {
    return {
      countries,
      text: t,
      errorText: text,
      token: async () => "ts-token",
      securityCheckWait: auth.shared.securityCheckWait,
      send: vi.fn(async () => {}),
      ...over,
    };
  }

  it("sends nothing while a check fails, and does not use up the Turnstile token", async () => {
    const send = vi.fn(async () => {});
    const outcome = await submitSignUp({ ...good, phone: "12", password: "" }, deps({ send }));
    expect(send).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      sent: false,
      tokenSpent: false,
      feedback: { fields: { phone: t.phone, password: t.required }, message: null, reference: null },
    });
  });

  it("asks the page to wait when the security check has not finished", async () => {
    const send = vi.fn(async () => {});
    const outcome = await submitSignUp(good, deps({ send, token: async () => null }));
    expect(send).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ sent: false, tokenSpent: false, feedback: { message: auth.shared.securityCheckWait } });
  });

  it("sends the body and the token, and answers with the address the link goes to", async () => {
    const send = vi.fn(async () => {});
    const outcome = await submitSignUp({ ...good, email: " sam@example.com " }, deps({ send }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      {
        email: "sam@example.com",
        password: "Orchard-Lantern-8841",
        firstName: "Sam",
        lastName: "Hamdan",
        country: "JO",
        phone: "+962791234567",
      },
      "ts-token",
    );
    expect(outcome).toEqual({ sent: true, email: "sam@example.com" });
  });

  it("puts the server's field errors under their fields, with the token spent", async () => {
    const send = vi.fn(async () => {
      throw problem(422, "VALIDATION_FAILED", [
        { field: "password", code: "WEAK_PASSWORD", message: "Too weak." },
        { field: "country", code: "unsupported" },
      ]);
    });
    const outcome = await submitSignUp(good, deps({ send }));
    expect(outcome.sent).toBe(false);
    if (outcome.sent) return;
    expect(outcome.tokenSpent).toBe(true);
    expect(outcome.feedback.fields).toEqual({ password: errors.fields.WEAK_PASSWORD, country: t.country });
    expect(outcome.feedback.message).toBeNull();
  });

  it("shows an error on a field the form does not know as the form's message", async () => {
    const send = vi.fn(async () => {
      throw problem(422, "VALIDATION_FAILED", [{ field: "body", code: "unrecognized_keys" }]);
    });
    const outcome = await submitSignUp(good, deps({ send }));
    expect(outcome).toMatchObject({ sent: false, feedback: { fields: {}, message: errors.codes.VALIDATION_FAILED } });
  });

  it("tells a 429 as the form's message with the wait, and a network failure as the connection message", async () => {
    const limited = await submitSignUp(
      good,
      deps({
        send: async () => {
          throw problem(429, "RATE_LIMITED", [], 30);
        },
      }),
    );
    expect(limited).toMatchObject({ sent: false, tokenSpent: true });
    if (!limited.sent) {
      expect(limited.feedback.message).toBe(`${errors.codes.RATE_LIMITED} Try again in 30 s.`);
      expect(limited.feedback.reference).toBe("Reference: req-9");
    }
    const offline = await submitSignUp(
      good,
      deps({
        send: async () => {
          throw new ApiError({ status: 0, code: "NETWORK_ERROR" });
        },
      }),
    );
    expect(offline).toMatchObject({ sent: false, feedback: { message: errors.codes.NETWORK_ERROR } });
  });
});

describe("names: invisible direction marks and the joined length", () => {
  it("cleanName trims and drops the direction marks, and keeps every script", () => {
    expect(cleanName(" \u200fSam\u200e ")).toBe("Sam");
    expect(cleanName("\u202bSam\u202c Ali")).toBe("Sam Ali");
    expect(cleanName("\u0633\u0627\u0645\u064a")).toBe("\u0633\u0627\u0645\u064a");
  });

  it("counts a name in code points, as the server does, not in UTF-16 units", () => {
    // 60 astral characters are 120 UTF-16 units but 60 characters: allowed.
    const sixty = "\u{1F600}".repeat(60);
    expect(checkDetails({ ...good, firstName: sixty }, countries, t)).toEqual({});
    expect(checkDetails({ ...good, firstName: sixty + "x" }, countries, t)).toEqual({ firstName: t.name });
  });

  it("a name made only of direction marks counts as empty", () => {
    expect(checkDetails({ ...good, firstName: "\u200e\u200f" }, countries, t)).toEqual({ firstName: t.required });
  });

  it("refuses the last name when first, a space and last together are longer than 120 characters (two names of 60)", () => {
    const both = { firstName: "A".repeat(60), lastName: "B".repeat(60) };
    expect(checkNameTogether(both, t)).toBe(t.nameTogether);
    expect(checkSignUp({ ...good, ...both }, countries, t)).toEqual({ lastName: t.nameTogether });
    expect(checkNameTogether({ firstName: "A".repeat(60), lastName: "B".repeat(59) }, t)).toBeNull();
    expect(checkSignUp({ ...good, firstName: "A".repeat(60), lastName: "B".repeat(59) }, countries, t)).toEqual({});
  });

  it("does not say it when a name is missing or too long on its own (that sentence is the one to show)", () => {
    expect(checkNameTogether({ firstName: "", lastName: "B".repeat(60) }, t)).toBeNull();
    expect(checkNameTogether({ firstName: "A".repeat(61), lastName: "B".repeat(60) }, t)).toBeNull();
    expect(checkSignUp({ ...good, firstName: "A".repeat(61), lastName: "B".repeat(60) }, countries, t)).toEqual({ firstName: t.name });
  });

  it("sends the names without the marks", () => {
    expect(signUpBody({ ...good, firstName: "\u200fSam\u200e", lastName: " Hamdan\u200f" })).toMatchObject({
      firstName: "Sam",
      lastName: "Hamdan",
    });
  });
});

describe("the finish form: the details the server kept, and a password", () => {
  const pending = { firstName: "Sam", lastName: "Hamdan", country: "JO", phone: "+962791234567" };
  const finishGood: FinishValues = { ...pending, password: "Orchard-Lantern-8841" };

  it("starts from the details with an empty password", () => {
    expect(finishStart(pending, countries)).toEqual({ ...pending, password: "" });
  });

  it("starts the country on its prompt when the menu no longer offers it, so the person picks one the server accepts", () => {
    expect(finishStart({ ...pending, country: "FR" }, countries)).toEqual({ ...pending, country: "", password: "" });
  });

  it("has no email to check: only the four details and the password", () => {
    expect(checkFinish(finishGood, countries, t)).toEqual({});
    expect(checkFinish({ ...finishGood, firstName: "", lastName: " ", phone: "12", country: "", password: "" }, countries, t)).toEqual({
      firstName: t.required,
      lastName: t.required,
      phone: t.phone,
      country: t.country,
      password: t.required,
    });
    expect(checkFinish({ ...finishGood, password: "short" }, countries, t)).toEqual({ password: t.passwordLength });
    expect(checkFinish({ ...finishGood, password: "abababababab" }, countries, t)).toEqual({ password: t.passwordVariety });
    expect(checkFinish({ ...finishGood, firstName: "A".repeat(60), lastName: "B".repeat(60) }, countries, t)).toEqual({
      lastName: t.nameTogether,
    });
  });

  it("sends exactly the four details and the password: trimmed, the phone with Latin digits, the password as typed, no email", () => {
    const body = finishBody({
      firstName: " Sam ",
      lastName: "\u200fHamdan",
      country: "JO",
      phone: " +\u0669\u0666\u0662 (79) \u0661\u0662\u0663-\u0664\u0665\u0666\u0667 ",
      password: " Orchard Lantern 8841 ",
    });
    expect(body).toEqual({
      firstName: "Sam",
      lastName: "Hamdan",
      country: "JO",
      phone: "+962791234567",
      password: " Orchard Lantern 8841 ",
    });
    expect(Object.keys(body).sort()).toEqual(["country", "firstName", "lastName", "password", "phone"]);
  });
});

describe("submitFinish: the whole submit of the finish form", () => {
  const text = errorText(errors);
  const finishGood: FinishValues = {
    firstName: "Sam",
    lastName: "Hamdan",
    country: "JO",
    phone: "+962 79 123 4567",
    password: "Orchard-Lantern-8841",
  };
  function deps(over: Partial<FinishDeps> = {}): FinishDeps {
    return { countries, text: t, errorText: text, send: vi.fn(async () => {}), ...over };
  }

  it("sends nothing while a check fails", async () => {
    const send = vi.fn(async () => {});
    const outcome = await submitFinish({ ...finishGood, phone: "12", password: "" }, deps({ send }));
    expect(send).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      done: false,
      alreadySet: false,
      feedback: { fields: { phone: t.phone, password: t.required }, message: null, reference: null },
    });
  });

  it("sends the body once, with no Turnstile token, and is done", async () => {
    const send = vi.fn(async () => {});
    const outcome = await submitFinish(finishGood, deps({ send }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      firstName: "Sam",
      lastName: "Hamdan",
      country: "JO",
      phone: "+962791234567",
      password: "Orchard-Lantern-8841",
    });
    expect(outcome).toEqual({ done: true });
  });

  it("puts the server's field errors under their fields", async () => {
    const send = vi.fn(async () => {
      throw problem(422, "VALIDATION_FAILED", [
        { field: "password", code: "WEAK_PASSWORD", message: "Too weak." },
        { field: "country", code: "unsupported" },
        { field: "phone", code: "invalid_format" },
      ]);
    });
    const outcome = await submitFinish(finishGood, deps({ send }));
    expect(outcome.done).toBe(false);
    if (outcome.done) return;
    expect(outcome.alreadySet).toBe(false);
    expect(outcome.feedback.fields).toEqual({ password: errors.fields.WEAK_PASSWORD, country: t.country, phone: t.phone });
    expect(outcome.feedback.message).toBeNull();
  });

  it("says the account already has a password for a 409, and keeps the form's message", async () => {
    const outcome = await submitFinish(
      finishGood,
      deps({
        send: async () => {
          throw problem(409, "CONFLICT");
        },
      }),
    );
    expect(outcome).toMatchObject({ done: false, alreadySet: true });
  });

  it("tells a 401 (the session ended), a 429 and a network failure as the form's message, never as a field", async () => {
    for (const [status, code] of [
      [401, "UNAUTHENTICATED"],
      [429, "RATE_LIMITED"],
      [0, "NETWORK_ERROR"],
    ] as const) {
      const outcome = await submitFinish(
        finishGood,
        deps({
          send: async () => {
            throw problem(status, code);
          },
        }),
      );
      expect(outcome).toMatchObject({ done: false, alreadySet: false });
      if (!outcome.done) {
        expect(outcome.feedback.fields).toEqual({});
        expect(outcome.feedback.message).not.toBeNull();
      }
    }
  });
});
