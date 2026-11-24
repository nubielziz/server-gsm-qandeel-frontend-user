// Guards the one account model (shop decision 002): there is one account area, one session, one readable CSRF cookie family.
// Two rules for the site's own code (app, components, lib and the proxy), tests aside:
//   1. A CSRF cookie is named only in lib/api/account-cookie.ts. Everything else asks that file (hasAccountCookie, accountCsrfFrom,
//      accountFamilyFromCookies), so a cookie that is renamed or added changes one place.
//   2. No file links to the retired `/merchant` pages. The old addresses live in lib/account/legacy-paths.ts, which next.config.ts and
//      `legacyAccountPath` read; any other code links to `/account`. Comments may still name an old address to explain a rewrite.
// The tests of those files name the old words on purpose (they test the redirects and the cookie reader), so they are not read.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The folders and files whose code is read, relative to the project root. */
const SCANNED = ["app", "components", "lib", "proxy.ts"];

/** The one file that may name a CSRF cookie. */
const COOKIE_FILE = "lib/api/account-cookie.ts";

/** The one file that may name the old portal addresses in code. */
const LEGACY_FILE = "lib/account/legacy-paths.ts";

/** The generated API types name routes, never pages; they are not read. */
const GENERATED = new Set(["lib/api/schema.gen.ts"]);

const COOKIE_NAME = /csrf_token_(?:store|client)/;

/** A quoted or template string that starts with an old portal address, with or without the language prefix. */
const MERCHANT_LINK = /(["'`])\/(?:en\/)?merchant(?=[/?#"'`])/;

/**
 * The code of a source text with every comment turned into spaces (line breaks kept, so line numbers stay). Strings and template
 * literals are kept as they are, and a `//` inside one is not a comment. A small scanner, not a parser: a string stops at the end of
 * its line (so a stray quote in text cannot swallow the file), and a template literal ends at its closing backtick.
 */
function withoutComments(source: string): string {
  let out = "";
  let i = 0;
  // A template literal can nest another through `${ … }`: the stack holds the brace depth of each open expression.
  const expressions: number[] = [];
  let mode: "code" | "line" | "block" | "single" | "double" | "template" = "code";
  const blank = (ch: string) => (ch === "\n" ? "\n" : " ");
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (mode === "line") {
      if (ch === "\n") mode = "code";
      out += blank(ch);
      i += 1;
    } else if (mode === "block") {
      if (ch === "*" && next === "/") {
        out += "  ";
        i += 2;
        mode = "code";
      } else {
        out += blank(ch);
        i += 1;
      }
    } else if (mode === "single" || mode === "double") {
      out += ch;
      i += 1;
      if (ch === "\\" && next !== undefined && next !== "\n") {
        out += next;
        i += 1;
      } else if (ch === "\n" || ch === (mode === "single" ? "'" : '"')) {
        mode = "code";
      }
    } else if (mode === "template") {
      out += ch;
      i += 1;
      if (ch === "\\" && next !== undefined) {
        out += next;
        i += 1;
      } else if (ch === "`") {
        mode = "code";
      } else if (ch === "$" && next === "{") {
        out += next;
        i += 1;
        expressions.push(0);
        mode = "code";
      }
    } else if (ch === "/" && next === "/") {
      mode = "line";
      out += "  ";
      i += 2;
    } else if (ch === "/" && next === "*") {
      mode = "block";
      out += "  ";
      i += 2;
    } else {
      if (ch === "'") mode = "single";
      else if (ch === '"') mode = "double";
      else if (ch === "`") mode = "template";
      else if (ch === "{" && expressions.length > 0) expressions[expressions.length - 1] += 1;
      else if (ch === "}" && expressions.length > 0) {
        if (expressions[expressions.length - 1] === 0) {
          expressions.pop();
          mode = "template";
        } else {
          expressions[expressions.length - 1] -= 1;
        }
      }
      out += ch;
      i += 1;
    }
  }
  return out;
}

/** The 1-based line numbers of the lines of `code` that match `pattern`. */
function linesMatching(code: string, pattern: RegExp): number[] {
  return code
    .split("\n")
    .map((line, index) => (pattern.test(line) ? index + 1 : 0))
    .filter((line) => line > 0);
}

/** The lines of a source text that name a CSRF cookie in code or in a comment (a comment is not exempt: the name lives in one file). */
function cookieNameLines(source: string): number[] {
  return linesMatching(source, COOKIE_NAME);
}

/** The lines of a source text that link to an old portal address in code (comments are left out). */
function merchantLinkLines(source: string): number[] {
  return linesMatching(withoutComments(source), MERCHANT_LINK);
}

/** Every source file under a folder, or the file itself, as paths relative to the project root with forward slashes. */
function sourceFiles(entry: string): string[] {
  const full = join(ROOT, entry);
  if (!statSync(full).isDirectory()) return [entry];
  const found: string[] = [];
  for (const child of readdirSync(full, { withFileTypes: true })) {
    if (child.name === "node_modules" || child.name.startsWith(".")) continue;
    const path = `${entry}/${child.name}`;
    if (child.isDirectory()) found.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(child.name) && !/\.test\.(ts|tsx)$/.test(child.name) && !GENERATED.has(path)) found.push(path);
  }
  return found;
}

const FILES = SCANNED.flatMap(sourceFiles);
const read = (file: string) => readFileSync(join(ROOT, file.split("/").join(sep)), "utf8");

describe("the one account guard reads the real tree", () => {
  it("finds the site's code (the guard is not vacuous)", () => {
    expect(FILES.length).toBeGreaterThan(200);
    expect(FILES).toContain("proxy.ts");
    expect(FILES).toContain(COOKIE_FILE);
    expect(FILES).toContain(LEGACY_FILE);
    expect(FILES.some((file) => file.startsWith("app/en/account/"))).toBe(true);
    // Tests and the generated types are not read.
    expect(FILES.filter((file) => /\.test\.tsx?$/.test(file) || GENERATED.has(file))).toEqual([]);
  });

  it("sees the cookie names where they live and the old addresses where they live", () => {
    expect(cookieNameLines(read(COOKIE_FILE)).length).toBeGreaterThan(0);
    expect(merchantLinkLines(read(LEGACY_FILE)).length).toBeGreaterThan(20);
  });
});

describe("a CSRF cookie is named in one file", () => {
  it("names csrf_token_store and csrf_token_client only in lib/api/account-cookie.ts", () => {
    const found = FILES.filter((file) => file !== COOKIE_FILE).flatMap((file) =>
      cookieNameLines(read(file)).map((line) => `${file}:${line}`),
    );
    expect(found).toEqual([]);
  });
});

describe("nothing links to the retired merchant pages", () => {
  it("names /merchant or /en/merchant in code only in lib/account/legacy-paths.ts", () => {
    const found = FILES.filter((file) => file !== LEGACY_FILE).flatMap((file) =>
      merchantLinkLines(read(file)).map((line) => `${file}:${line}`),
    );
    expect(found).toEqual([]);
  });
});

describe("withoutComments", () => {
  it("blanks line and block comments and keeps the line breaks", () => {
    const code = withoutComments("a(); // note\n/* one\ntwo */ b();\n");
    expect(code.split("\n")).toHaveLength(4);
    expect(code).toContain("a();");
    expect(code).toContain("b();");
    expect(code).not.toContain("note");
    expect(code).not.toContain("two");
  });

  it("keeps a // that sits inside a string or a template literal", () => {
    expect(withoutComments('const u = "https://example.test/x"; // gone')).toContain("https://example.test/x");
    expect(withoutComments("const u = `https://example.test/${a}/x`; // gone")).toContain("https://example.test/");
    expect(withoutComments("const u = '//keep'; // gone")).not.toContain("gone");
  });

  it("reads a template literal inside a template expression", () => {
    const code = withoutComments("const a = `x ${b ? `/merchant` : ''} y`; // gone");
    expect(code).toContain("/merchant");
    expect(code).not.toContain("gone");
  });

  it("does not let a stray quote in a line swallow the next lines", () => {
    const code = withoutComments("const text = 'it\nconst b = 1; // gone\nconst c = 2;");
    expect(code).toContain("const c = 2;");
    expect(code).not.toContain("gone");
  });

  it("skips an escaped quote", () => {
    expect(withoutComments('const a = "say \\" // still a string"; // gone')).toContain("still a string");
  });
});

describe("merchantLinkLines", () => {
  it("flags a link in a string, a template, a call and an attribute", () => {
    expect(merchantLinkLines('const a = "/merchant";')).toEqual([1]);
    expect(merchantLinkLines("const a = '/en/merchant/orders';")).toEqual([1]);
    expect(merchantLinkLines("x\nconst a = `/merchant/orders/${id}`;")).toEqual([2]);
    expect(merchantLinkLines('sitePath("/merchant/wallet")')).toEqual([1]);
    expect(merchantLinkLines('<Link href="/en/merchant?x=1" />')).toEqual([1]);
    expect(merchantLinkLines('go("/merchant#top")')).toEqual([1]);
  });

  it("leaves comments, import paths, other names and the account addresses alone", () => {
    expect(merchantLinkLines("// the old /merchant pages\nconst a = 1;")).toEqual([]);
    expect(merchantLinkLines("/** `/en/merchant/orders/7` is written as its new page */\nconst a = 1;")).toEqual([]);
    expect(merchantLinkLines('import { x } from "@/lib/merchant/load";')).toEqual([]);
    expect(merchantLinkLines('import { x } from "../merchant/load";')).toEqual([]);
    expect(merchantLinkLines('const a = "/merchants";')).toEqual([]);
    expect(merchantLinkLines('const a = "/merchant-notes";')).toEqual([]);
    expect(merchantLinkLines('const a = "/en/account/merchant";')).toEqual([]);
    expect(merchantLinkLines('const a = "/en/account/orders";')).toEqual([]);
    expect(merchantLinkLines('const a = "/*/merchant";')).toEqual([]);
  });
});

describe("cookieNameLines", () => {
  it("flags either name, in code or in a comment", () => {
    expect(cookieNameLines('const a = "csrf_token_store";')).toEqual([1]);
    expect(cookieNameLines("x\n// csrf_token_client is the portal name")).toEqual([2]);
  });

  it("leaves the generic words alone", () => {
    expect(cookieNameLines("const csrfToken = 1; // the CSRF token\nconst b = 'csrf_token';")).toEqual([]);
  });
});
