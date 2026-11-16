import { describe, expect, it } from "vitest";
import { decodeEntities, highlightParts, parseHighlight } from "./highlight";

describe("parseHighlight: the API's marked title, never injected as HTML", () => {
  it("reads <mark> runs and decodes the escapes", () => {
    expect(parseHighlight("<mark>Samsung</mark> FRP &amp; <mark>KG</mark>")).toEqual([
      { text: "Samsung", mark: true },
      { text: " FRP & ", mark: false },
      { text: "KG", mark: true },
    ]);
    expect(parseHighlight("AT&amp;T &quot;Premier&quot; &#39;x&#39; &#x41;")).toEqual([{ text: `AT&T "Premier" 'x' A`, mark: false }]);
  });

  it("keeps any other tag as text", () => {
    const parts = parseHighlight("&lt;script&gt;alert(1)&lt;/script&gt; <b>bold</b> <mark>x</mark>");
    expect(parts.map((part) => part.text).join("")).toBe("<script>alert(1)</script> <b>bold</b> x");
    expect(parts.filter((part) => part.mark)).toEqual([{ text: "x", mark: true }]);
  });

  it("marks the rest after an unclosed <mark> and drops a stray </mark>", () => {
    expect(parseHighlight("a <mark>b c")).toEqual([
      { text: "a ", mark: false },
      { text: "b c", mark: true },
    ]);
    expect(parseHighlight("a</mark> b")).toEqual([{ text: "a b", mark: false }]);
  });

  it("leaves unknown or invalid references as written", () => {
    expect(decodeEntities("&nbsp; &#0; &#xD800; &bogus;")).toBe("&nbsp; &#0; &#xD800; &bogus;");
  });
});

describe("highlightParts", () => {
  it("uses the highlight when it spells the title", () => {
    expect(highlightParts("AT&T Unlock", "<mark>AT&amp;T</mark> Unlock")).toEqual([
      { text: "AT&T", mark: true },
      { text: " Unlock", mark: false },
    ]);
  });

  it("falls back to the plain title when the highlight says something else", () => {
    expect(highlightParts("Samsung FRP", "<mark>Other</mark> text")).toEqual([{ text: "Samsung FRP", mark: false }]);
    expect(highlightParts("Samsung FRP", "")).toEqual([{ text: "Samsung FRP", mark: false }]);
  });
});
