import { describe, expect, it } from "vitest";
import { cssTimeMs } from "./bell-ring";

describe("cssTimeMs", () => {
  it("reads milliseconds and seconds (the built CSS writes 600ms as .6s)", () => {
    expect(cssTimeMs("600ms", 1)).toBe(600);
    expect(cssTimeMs(".6s", 1)).toBe(600);
    expect(cssTimeMs("0.6s", 1)).toBe(600);
    expect(cssTimeMs(" 1.2s ", 1)).toBe(1200);
    expect(cssTimeMs("", 600)).toBe(600);
    expect(cssTimeMs("fast", 600)).toBe(600);
  });
});
