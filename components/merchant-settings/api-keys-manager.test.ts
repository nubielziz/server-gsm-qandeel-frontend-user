import { describe, expect, it } from "vitest";
import { newKeyBody, parseIps } from "./api-keys-manager";

describe("newKeyBody: the body of POST /client/api-keys", () => {
  it("always carries the one scope a Dhru key needs, with only the name when nothing else is given", () => {
    expect(newKeyBody({ name: "Production server", ips: [], date: "" })).toEqual({ name: "Production server", scopes: ["dhru"] });
  });

  it("adds the address list and the end of the expiry day (UTC) only when they are given", () => {
    expect(newKeyBody({ name: "Office", ips: ["203.0.113.9", "198.51.100.0/24"], date: "2027-01-31" })).toEqual({
      name: "Office",
      scopes: ["dhru"],
      allowedIps: ["203.0.113.9", "198.51.100.0/24"],
      expiresAt: "2027-01-31T23:59:59.999Z",
    });
  });

  it("sends no permission list of the removed API: no read or write scope, no wildcard", () => {
    const { scopes } = newKeyBody({ name: "k", ips: [], date: "" });
    expect(scopes.some((scope) => scope.includes(":"))).toBe(false);
  });
});

describe("parseIps: the allowed addresses of a key", () => {
  it("splits on lines, commas, semicolons and spaces and drops repeats", () => {
    expect(parseIps("203.0.113.9\n198.51.100.0/24, 203.0.113.9; 192.0.2.1  ")).toEqual(["203.0.113.9", "198.51.100.0/24", "192.0.2.1"]);
  });

  it("is empty for an empty box (any address)", () => {
    expect(parseIps("  \n ")).toEqual([]);
  });
});
