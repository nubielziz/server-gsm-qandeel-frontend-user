// The root layout's theme set-up (lib/theme/theme.ts): the guard script comes first in the body, and the browser's own colours
// follow both themes. The layout imports next/font, so its source is checked (the e2e specs look at the real page).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const layout = readFileSync(path.join(__dirname, "layout.tsx"), "utf8");
const notFound = readFileSync(path.join(__dirname, "..", "global-not-found.tsx"), "utf8");

describe("app/en/layout.tsx: the theme", () => {
  it("runs the theme guard as the first thing in <body>, before the personal prices' guard", () => {
    const body = layout.slice(layout.indexOf("<body className"));
    const theme = body.indexOf("<script dangerouslySetInnerHTML={{ __html: THEME_GUARD }} />");
    const prices = body.indexOf("<script dangerouslySetInnerHTML={{ __html: OWN_PRICES_GUARD }} />");
    expect(theme).toBeGreaterThan(0);
    expect(prices).toBeGreaterThan(theme);
    // Nothing but comments between the opening tag and the theme guard.
    const between = body.slice(body.indexOf(">") + 1, theme).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").trim();
    expect(between).toBe("");
  });

  it("keeps suppressHydrationWarning on <html> and <body>: the guards set attributes before React starts", () => {
    expect(layout).toMatch(/<html [^>]*suppressHydrationWarning>/);
    expect(layout).toMatch(/<body [^>]*suppressHydrationWarning>/);
  });

  it("gives the browser's bars one colour per system theme, and says both themes are drawn", () => {
    expect(layout).toContain('{ media: "(prefers-color-scheme: light)", color: "#f4f4f5" }');
    expect(layout).toContain('{ media: "(prefers-color-scheme: dark)", color: "#0a0a0b" }');
    expect(layout).toContain('colorScheme: "light dark"');
  });
});

describe("app/global-not-found.tsx: its own document", () => {
  it("runs the same guard, and keeps suppressHydrationWarning on <html> and <body>", () => {
    expect(notFound).toContain('import { THEME_GUARD } from "@/lib/theme/theme";');
    expect(notFound).toContain("<script dangerouslySetInnerHTML={{ __html: THEME_GUARD }} />");
    expect(notFound).toMatch(/<html [^>]*suppressHydrationWarning>/);
    expect(notFound).toMatch(/<body [^>]*suppressHydrationWarning>/);
  });
});
