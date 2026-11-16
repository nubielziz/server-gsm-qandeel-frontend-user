import { describe, expect, it } from "vitest";
import logoSizes from "@/lib/logo-sizes.json";
import { logoCandidates } from "@/lib/logo-names";
import { clientLogo } from "./logo-client";

describe("clientLogo: logos in the search box", () => {
  it("finds a listed logo with its recorded size", () => {
    const [width, height] = (logoSizes as Record<string, number[]>)["brands/samsung.png"];
    expect(clientLogo("brands", "Samsung")).toEqual({ src: "/images/brands/samsung.png", width, height });
  });

  it("uses the same name rules as the cards: aliases and first words", () => {
    expect(clientLogo("carriers", "AT&T")?.src).toBe("/images/carriers/at-t.png");
    expect(clientLogo("carriers", "att")?.src).toBe("/images/carriers/at-t.png");
    expect(clientLogo("carriers", "Vodafone UK")?.src).toBe("/images/carriers/vodafone.png");
  });

  it("has no logo for an unknown or empty name", () => {
    expect(clientLogo("brands", "No Such Brand Ever")).toBeNull();
    expect(clientLogo("brands", "  ")).toBeNull();
  });
});

describe("logoCandidates", () => {
  it("tries the whole name, then its first words, each with its alias", () => {
    expect(logoCandidates("carriers", "T Mobile USA")).toEqual(["carriers/t-mobile-usa.png", "carriers/t-mobile.png", "carriers/t.png"]);
    expect(logoCandidates("carriers", "at&t")).toEqual(["carriers/at-t.png", "carriers/at.png"]);
    expect(logoCandidates("brands", "iPhone")).toEqual(["brands/iphone.png", "brands/apple.png"]);
  });
});
