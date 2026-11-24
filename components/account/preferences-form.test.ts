import { describe, expect, it } from "vitest";
import { changedPreferences } from "./preferences-form";

const saved = { currency: "USD", marketingOptIn: false };

describe("changedPreferences: the body of PATCH /store/v1/me for the preferences", () => {
  it("sends nothing when nothing changed", () => {
    expect(changedPreferences(saved, saved)).toEqual({});
  });

  it("sends only the key that changed", () => {
    expect(changedPreferences({ ...saved, currency: "EUR" }, saved)).toEqual({ currency: "EUR" });
    expect(changedPreferences({ ...saved, marketingOptIn: true }, saved)).toEqual({ marketingOptIn: true });
  });

  it("sends both when both changed, and a switch turned back off is sent as false", () => {
    expect(changedPreferences({ currency: "EUR", marketingOptIn: true }, saved)).toEqual({
      currency: "EUR",
      marketingOptIn: true,
    });
    expect(changedPreferences({ currency: "USD", marketingOptIn: false }, { currency: "USD", marketingOptIn: true })).toEqual({
      marketingOptIn: false,
    });
  });
});
