import { describe, expect, it } from "vitest";
import { changedProfileFields, type ProfileValues } from "./profile-form";

const initial: ProfileValues = {
  name: "Zain Mobile Hub",
  company: "Zain Mobile Hub",
  phone: "",
  country: "JO",
  address: "",
  taxId: "",
};

describe("changedProfileFields: the body of PATCH /client/profile", () => {
  it("sends nothing when nothing changed", () => {
    expect(changedProfileFields(initial, initial)).toEqual({});
    expect(changedProfileFields({ ...initial }, initial)).toEqual({});
  });

  it("sends only the changed keys", () => {
    expect(changedProfileFields({ ...initial, phone: "+962 79 555 0100" }, initial)).toEqual({ phone: "+962 79 555 0100" });
    expect(changedProfileFields({ ...initial, country: "AE" }, initial)).toEqual({ country: "AE" });
  });

  it("reads a phone box that holds only a calling code as an empty phone", () => {
    expect(changedProfileFields({ ...initial, phone: "+962 " }, initial)).toEqual({});
    expect(changedProfileFields({ ...initial, phone: "+" }, { ...initial, phone: "+962 79 555 0100" })).toEqual({ phone: "" });
  });

  it("sends the new address and tax id, trimmed", () => {
    expect(changedProfileFields({ ...initial, address: "  12 Rainbow St\nAmman \n", taxId: " TX-4455 " }, initial)).toEqual({
      address: "12 Rainbow St\nAmman",
      taxId: "TX-4455",
    });
  });

  it("clears a field with an empty string", () => {
    const saved = { ...initial, address: "12 Rainbow St", taxId: "TX-4455" };
    expect(changedProfileFields({ ...saved, address: "   ", taxId: "" }, saved)).toEqual({ address: "", taxId: "" });
  });

  it("does not treat padding the server stored as a change", () => {
    const saved = { ...initial, address: "12 Rainbow St " };
    expect(changedProfileFields({ ...saved }, saved)).toEqual({});
    expect(changedProfileFields({ ...saved, address: "12 Rainbow St" }, saved)).toEqual({});
  });

  it("sends several changes together", () => {
    expect(changedProfileFields({ ...initial, name: "New Name", address: "Amman", country: "AE" }, initial)).toEqual({
      name: "New Name",
      address: "Amman",
      country: "AE",
    });
  });
});
