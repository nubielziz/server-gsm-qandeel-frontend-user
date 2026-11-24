import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The frame is an async Server Component: its layout rules are checked on the source (the e2e specs measure them).
const source = readFileSync(path.join(__dirname, "workspace-shell.tsx"), "utf8");

describe("WorkspaceShell: the frame (owner, 2026-11-15)", () => {
  it("does not centre the frame: no margin strip at the start edge on a wide screen", () => {
    expect(source).not.toMatch(/mx-auto[^"]*max-w-\[110rem\]/);
    expect(source).toContain('<div className="flex w-full items-start gap-4">');
    // The main column takes the rest, up to a comfortable width that leaves any spare room at the END edge.
    expect(source).toContain('className="flex min-w-0 max-w-[120rem] flex-1 flex-col gap-4"');
  });

  it("keeps the earlier sideways-scroll fix", () => {
    expect(source).toContain('"relative min-h-dvh overflow-x-clip bg-page p-3 sm:p-4"');
  });

  it("names the rail, the header card and the tab bar, so a page transition holds them still", () => {
    expect(source).toMatch(/className="surface-inverse vt-workspace-rail /);
    expect(source).toMatch(/<header className="vt-workspace-header /);
    expect(source).toMatch(/className="ws-tabs vt-workspace-tabs fixed /);
  });

  it("the tab bar shows below lg only, above the safe area, and the frame pads the page clear of it", () => {
    expect(source).toMatch(/className="ws-tabs [^"]*pb-\[env\(safe-area-inset-bottom,0px\)\] lg:hidden"/);
    expect(source).toContain("pb-[calc(var(--ws-tabbar-h)+env(safe-area-inset-bottom,0px)+0.75rem)]");
    expect(source).toContain("lg:pb-4");
  });

  it("the tab bar's landmark is not the rail's name (the e2e specs find the rail by it)", () => {
    expect(source).toContain("label={t.workspace.tabsLabel}");
  });
});

describe("WorkspaceShell: one frame for every account", () => {
  it("gives the heading the nav, the footer and the title-only pages, as paths and words with no icons or badges", () => {
    expect(source).toContain("const all = headingItems(nav, footerNav, titles);");
    expect(source).toContain("<WorkspaceHeading items={all} {...headingProps} />");
  });

  it("swaps the header search for the session's own inside <Suspense>, with the static form as the fallback", () => {
    expect(source).toContain("<Suspense fallback={<SearchInput {...search} />}>");
    expect(source).toContain("<ResolvedSearch resolveSearch={resolveSearch} />");
    // Without `resolveSearch` the form is drawn as given.
    expect(source).toMatch(/\)\s*:\s*\(\s*<SearchInput \{\.\.\.search\} \/>\s*\)\}/);
  });

  it("swaps the nav lists for the session's own inside <Suspense>, with the static lists as the fallback", () => {
    expect(source).toContain("<Suspense fallback={fixed}>");
    expect(source).toContain("<ResolvedNav group={group} variant={variant} resolveNav={resolveNav} />");
  });
});
