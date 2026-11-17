import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { store } from "@/lib/i18n/messages/store";
import { MAX_LISTED_CODES, ResultCodes, splitCodes, type ResultCodesLabels } from "./result-codes";

const codes = (n: number, prefix = "E2E-1794703208"): string[] => Array.from({ length: n }, (_, i) => `${prefix}-${String(i).padStart(4, "0")}`);

describe("splitCodes: when a result is a list of codes", () => {
  it("ten codes, one per line, are ten codes in order", () => {
    const list = codes(10);
    expect(splitCodes(list.join("\n"))).toEqual(list);
  });

  it("one code is not a list: it stays in the single block", () => {
    expect(splitCodes("ABCDEF123456")).toBeNull();
    expect(splitCodes("ABCDEF123456\n")).toBeNull();
    expect(splitCodes("\n\nABCDEF123456\n\n")).toBeNull();
  });

  it("two codes are already a list", () => {
    expect(splitCodes("ABCDEF123456\nGHIJKL789012")).toEqual(["ABCDEF123456", "GHIJKL789012"]);
  });

  it("a staff reply with spaces stays one block, whatever its line count", () => {
    expect(splitCodes("Not on the GSMA blacklist")).toBeNull();
    expect(splitCodes("Your device is unlocked.\nRestart the phone and insert a new SIM.")).toBeNull();
    // One code among words ruins the list: the lines must all be codes.
    expect(splitCodes("UNLOCKED-0001\nplease restart the phone")).toBeNull();
    expect(splitCodes("ABCDEF123456\nGHIJ KL789012")).toBeNull();
    expect(splitCodes("ABCDEF123456\nGHIJKL\t789012")).toBeNull();
  });

  it("Windows and old Mac line ends give the same codes as Unix ones", () => {
    const list = codes(4);
    expect(splitCodes(list.join("\r\n"))).toEqual(list);
    expect(splitCodes(list.join("\r"))).toEqual(list);
    expect(splitCodes(`${list.join("\r\n")}\r\n`)).toEqual(list);
  });

  it("blank lines and spaces around a line are dropped", () => {
    expect(splitCodes("\n  ABCDEF123456  \n\n\tGHIJKL789012\n\n")).toEqual(["ABCDEF123456", "GHIJKL789012"]);
  });

  it("every line is 6 to 128 characters", () => {
    expect(splitCodes("ABCDE\nGHIJKL789012")).toBeNull(); // 5
    expect(splitCodes("ABCDEF\nGHIJKL")).toEqual(["ABCDEF", "GHIJKL"]); // 6
    const longest = "A".repeat(128);
    expect(splitCodes(`${longest}\nGHIJKL`)).toEqual([longest, "GHIJKL"]);
    expect(splitCodes(`${longest}A\nGHIJKL`)).toBeNull(); // 129
  });

  it("a very large order is not a list: hundreds of buttons would only slow the page", () => {
    expect(splitCodes(codes(MAX_LISTED_CODES).join("\n"))).toHaveLength(MAX_LISTED_CODES);
    expect(splitCodes(codes(MAX_LISTED_CODES + 1).join("\n"))).toBeNull();
    expect(splitCodes(codes(5).join("\n"), 4)).toBeNull();
  });
});

describe("ResultCodes: the markup of the tracking result", () => {
  const labels: ResultCodesLabels = {
    title: store.track.codesTitle,
    copyAll: store.track.copyAll,
    copyCode: store.track.copyCode,
    copy: "Copy",
    copied: "Copied",
  };
  const render = (code: string) => renderToStaticMarkup(createElement(ResultCodes, { code, labels }));
  const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;

  it("five codes: a heading, a list of five, a Copy button each and Copy all", () => {
    const html = render(codes(5).join("\n"));
    expect(html).toContain("Your codes");
    expect(count(html, /<li\b/g)).toBe(5);
    for (let n = 1; n <= 5; n += 1) expect(html).toContain(`aria-label="Copy code ${n}"`);
    expect(html).toContain("Copy all");
    expect(html).not.toContain("<pre");
    for (const code of codes(5)) expect(html).toContain(code);
  });

  it("every code is isolated left-to-right (a code is a Latin value, whatever text sits around it)", () => {
    const html = render(codes(3).join("\n"));
    expect(count(html, /<bdi dir="ltr"/g)).toBe(3);
  });

  it("a staff reply and a single code keep the one block with one Copy button", () => {
    for (const text of ["Not on the GSMA blacklist", "ABCDEF123456", "Line one has words\nLine two too"]) {
      const html = render(text);
      expect(html).toContain("<pre");
      expect(count(html, /<li\b/g)).toBe(0);
      expect(count(html, /<button\b/g)).toBe(1);
      expect(html).not.toContain("Your codes");
    }
  });

  it("the single block wraps a long unbroken token anywhere (break-words would stretch the page on a phone)", () => {
    const html = render(`See https://example.com/${"x".repeat(110)}`);
    expect(html).toMatch(/<pre\b[^>]*class="[^"]*\bwrap-anywhere\b/);
    expect(html).not.toContain("break-words");
  });

  it("the text of a codes result is put in the page as text, never as markup", () => {
    const html = render("<b>ABCDEF123456</b>\n<i>GHIJKL789012</i>");
    // Tags are not codes ("<b>ABCDEF123456</b>" has no space, so it is a line): they must come out escaped.
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;ABCDEF123456&lt;/b&gt;");
  });
});
