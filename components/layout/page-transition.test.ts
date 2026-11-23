import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP = path.join(__dirname, "../../app/en");
const STORE = path.join(APP, "(store)");
/** Not shop pages: the quick view dialog (its page under the slot), the design kit and the quick view page (it re-exports the service page). */
const SKIP = [/^@modal\//, /^ui-kit\//, /^quick-view\//];

function pages(dir: string, base = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return pages(path.join(dir, entry.name), rel);
    return entry.name === "page.tsx" ? [rel] : [];
  });
}

/** The page's content is wrapped in <PageTransition> right at its (only) return. */
function expectWrapped(file: string) {
  const source = readFileSync(file, "utf8");
  expect(source).toContain('import { PageTransition } from "@/components/layout/page-transition";');
  expect(source).toMatch(/return \(\n(?:\s*\/\/.*\n)?\s*<PageTransition>/);
}

describe("PageTransition: every shop page plays the page enter on a client navigation", () => {
  const list = pages(STORE).filter((rel) => !SKIP.some((skip) => skip.test(rel)));

  it("finds the shop's pages", () => {
    expect(list).toContain("page.tsx");
    expect(list).toContain("services/page.tsx");
    expect(list.length).toBeGreaterThanOrEqual(11);
  });

  for (const rel of list) {
    it(`${rel} wraps its content in <PageTransition>`, () => expectWrapped(path.join(STORE, rel)));
  }

  it("the quick view page is the service page (wrapped there)", () => {
    expect(readFileSync(path.join(STORE, "quick-view/[slug]/page.tsx"), "utf8")).toMatch(/export default ServicePage;/);
  });
});

// Owner, 2026-11-15: the workspace pages get the same enter/exit as the shop's, with the rail, the header card and the
// tab bar held still (named in globals.css).
describe("PageTransition: every workspace page (customer area, merchant portal) plays it too", () => {
  const areas = [
    { name: "account", dir: path.join(APP, "account"), first: "page.tsx", min: 9 },
    { name: "merchant", dir: path.join(APP, "(portal)/merchant"), first: "page.tsx", min: 20 },
  ];

  for (const area of areas) {
    const list = pages(area.dir);

    it(`finds the ${area.name} pages`, () => {
      expect(list).toContain(area.first);
      expect(list.length).toBeGreaterThanOrEqual(area.min);
    });

    for (const rel of list) {
      it(`${area.name}/${rel} wraps its content in <PageTransition>`, () => expectWrapped(path.join(area.dir, rel)));
    }
  }

  // React's streamed reveal animates a <ViewTransition> that is the first thing in a revealed boundary: a page streamed
  // behind the layout's session boundary would play its enter on the first load. An element in between prevents it.
  for (const layout of ["account/layout.tsx", "(portal)/merchant/layout.tsx"]) {
    it(`${layout}: an element sits between the page boundary and the page`, () => {
      const source = readFileSync(path.join(APP, layout), "utf8");
      expect(source).toMatch(/<Suspense fallback=\{<WorkspaceMainSkeleton \/>\}>\s*<div className="contents">/);
    });
  }
});
