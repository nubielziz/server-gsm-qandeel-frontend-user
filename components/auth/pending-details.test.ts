import { describe, expect, it } from "vitest";
import { readPendingDetails } from "./pending-details";

describe("readPendingDetails", () => {
  const details = { firstName: "Sam", lastName: "Hamdan", country: "JO", phone: "+962791234567" };

  it("reads the four strings and nothing else (a password key that should never be there is dropped)", () => {
    expect(readPendingDetails(details)).toEqual(details);
    expect(readPendingDetails({ ...details, password: "x", passwordHash: "y" })).toEqual(details);
  });

  it("is null for anything that is not an object of four strings", () => {
    for (const value of [null, undefined, "Sam", 7, [], {}, { ...details, phone: 7 }, { ...details, country: null }]) {
      expect(readPendingDetails(value)).toBeNull();
    }
    expect(readPendingDetails({ lastName: "Hamdan", country: "JO", phone: "+962791234567" })).toBeNull();
  });
});
