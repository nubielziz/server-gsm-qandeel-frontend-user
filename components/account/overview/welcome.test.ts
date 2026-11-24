// The overview's greeting (components/account/overview/welcome.ts).
import { describe, expect, it } from "vitest";
import { welcomeTitle } from "./welcome";

const retail = { rank: { kind: "retail" } };
const merchantRank = { rank: { kind: "merchant" } };

describe("welcomeTitle", () => {
  it("greets an account by name, whatever its rank", () => {
    expect(welcomeTitle({ ...retail, name: "Daniel Whitmore", email: "d@example.test" })).toBe("Welcome back, Daniel Whitmore");
    expect(welcomeTitle({ ...merchantRank, name: "Zain Mobile Hub", email: "ops@example.test" })).toBe(
      "Welcome back, Zain Mobile Hub",
    );
  });

  it("greets a retail account without a name plainly (an account made by the email link has none)", () => {
    expect(welcomeTitle({ ...retail, name: "", email: "d@example.test" })).toBe("Welcome back");
    expect(welcomeTitle({ ...retail, name: "   ", email: "d@example.test" })).toBe("Welcome back");
    expect(welcomeTitle({ ...retail, name: null })).toBe("Welcome back");
  });

  it("greets a merchant rank without a name by its email", () => {
    expect(welcomeTitle({ ...merchantRank, name: "", email: "ops@example.test" })).toBe("Welcome back, ops@example.test");
  });

  it("treats a rank kind it does not know as retail", () => {
    expect(welcomeTitle({ rank: { kind: "partner" }, name: "", email: "p@example.test" })).toBe("Welcome back");
  });
});
