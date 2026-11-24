import { describe, expect, it } from "vitest";
import { changedStoreProfile, type StoreProfileValues } from "./profile-form";

const saved: StoreProfileValues = { name: "Amal Haddad", phone: "+962 79 000 0000", country: "JO" };

describe("changedStoreProfile: the body of PATCH /store/v1/me", () => {
  it("sends nothing when nothing changed, and padding the API trims is not a change", () => {
    expect(changedStoreProfile(saved, saved)).toEqual({});
    expect(changedStoreProfile({ ...saved, name: "  Amal Haddad ", phone: " +962 79 000 0000 " }, saved)).toEqual({});
  });

  it("sends only the changed keys, trimmed", () => {
    expect(changedStoreProfile({ ...saved, name: "  Amal Said ", phone: "+962 79 111 2222" }, saved)).toEqual({
      name: "Amal Said",
      phone: "+962 79 111 2222",
    });
    expect(changedStoreProfile({ ...saved, country: "GB" }, saved)).toEqual({ country: "GB" });
  });

  it("clears the phone with an empty string", () => {
    expect(changedStoreProfile({ ...saved, phone: "   " }, saved)).toEqual({ phone: "" });
  });

  it("never sends an empty country: a saved country can be changed, not removed", () => {
    expect(changedStoreProfile({ ...saved, country: "" }, saved)).toEqual({});
  });

  it("a first country is sent when the account had none", () => {
    expect(changedStoreProfile({ ...saved, country: "DE" }, { ...saved, country: "" })).toEqual({ country: "DE" });
  });
});
