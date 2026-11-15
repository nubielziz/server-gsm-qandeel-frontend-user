import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const STORE = path.join(__dirname, "../../app/[lang]/(store)");
/** Not shop pages: the quick view dialog (its page under the slot), the design kit and the quick view page (it re-exports the service page). */
const SKIP = [/^@modal\//, /^ui-kit\//, /^quick-view\//];

function pages(dir: string, base = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return pages(path.join(dir, entry.name), rel);
    return entry.name === "page.tsx" ? [rel] : [];
  });
}

describe("PageTransition: every shop page plays the page enter on a client navigation", () => {
  const list = pages(STORE).filter((rel) => !SKIP.some((skip) => skip.test(rel)));

  it("finds the shop's pages", () => {
    expect(list).toContain("page.tsx");
    expect(list).toContain("services/page.tsx");
    expect(list.length).toBeGreaterThanOrEqual(12);
  });

  for (const rel of list) {
    it(`${rel} wraps its content in <PageTransition>`, () => {
      const source = readFileSync(path.join(STORE, rel), "utf8");
      expect(source).toContain('import { PageTransition } from "@/components/layout/page-transition";');
      expect(source).toMatch(/return \(\n(?:\s*\/\/.*\n)?\s*<PageTransition>/);
    });
  }

  it("the quick view page is the service page (wrapped there)", () => {
    expect(readFileSync(path.join(STORE, "quick-view/[slug]/page.tsx"), "utf8")).toMatch(/export default ServicePage;/);
  });
});
