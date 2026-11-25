// The theme switch (components/layout/theme-toggle.tsx): the server HTML, the pressed state, and a click that flips <html data-theme>.
// The tests run in Node: `useSyncExternalStore` is replaced by a plain read of the client snapshot (so the component can be
// called as a function and its element inspected), and the page, the storage and the system preference are small stand-ins.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const useSyncExternalStore = vi.hoisted(() => vi.fn((_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot()));
vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), useSyncExternalStore }));

import { common } from "@/lib/i18n/messages/common";
import { readTheme, subscribeTheme, THEME_KEY } from "@/lib/theme/theme";
import { ThemeToggle } from "./theme-toggle";

/** A page whose <html> shows `theme`, with a storage and a system preference; installed as the globals of the test. */
function page(theme: "light" | "dark", systemDark = false) {
  const data = new Map<string, string>();
  const dataset: Record<string, string> = { theme };
  vi.stubGlobal("requestAnimationFrame", () => undefined);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    },
    matchMedia: () => ({ matches: systemDark }),
  });
  vi.stubGlobal("document", { documentElement: { dataset, classList: { add: () => undefined, remove: () => undefined } } });
  return { data, dataset };
}

afterEach(() => {
  vi.unstubAllGlobals();
  useSyncExternalStore.mockClear();
});

/** The button element the component returns, with its props. */
const button = (element: ReactElement) => element as ReactElement<Record<string, unknown> & { children: ReactElement[] }>;

describe("ThemeToggle", () => {
  const label = common.theme.dark;

  it("draws a button named by its label with both icons, one shown by the dark: variant", () => {
    const html = renderToStaticMarkup(<ThemeToggle label={label} />);
    expect(label).toBe("Dark theme");
    expect(html).toContain('aria-label="Dark theme"');
    expect(html).toContain('title="Dark theme"');
    // The moon is shown in the light theme (hidden under dark:), the sun the other way round.
    expect(html).toMatch(/<svg[^>]*class="[^"]*\blucide-moon\b[^"]*\bdark:hidden\b/);
    expect(html).toMatch(/<svg[^>]*class="[^"]*\blucide-sun\b[^"]*\bhidden\b[^"]*\bdark:block\b/);
    // Decorative: the name comes from the label.
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(2);
  });

  it("is a 44 px touch target that never submits a form", () => {
    const html = renderToStaticMarkup(<ThemeToggle label={label} />);
    expect(html).toContain('type="button"');
    expect(html).toMatch(/class="[^"]*\bsize-11\b/);
    expect(renderToStaticMarkup(<ThemeToggle label={label} size="lg" />)).toMatch(/class="[^"]*\bsize-12\b/);
  });

  it("asks for the server snapshot \"light\", so the first client render matches the server HTML", () => {
    renderToStaticMarkup(<ThemeToggle label={label} />);
    const [subscribe, getSnapshot, getServerSnapshot] = useSyncExternalStore.mock.calls[0] as unknown as [unknown, unknown, () => string];
    expect(subscribe).toBe(subscribeTheme);
    expect(getSnapshot).toBe(readTheme);
    expect(getServerSnapshot()).toBe("light");
  });

  it("is not pressed in the light theme and pressed in the dark theme", () => {
    page("light");
    expect(renderToStaticMarkup(<ThemeToggle label={label} />)).toContain('aria-pressed="false"');
    expect(button(ThemeToggle({ label })).props["aria-pressed"]).toBe(false);

    page("dark");
    expect(renderToStaticMarkup(<ThemeToggle label={label} />)).toContain('aria-pressed="true"');
    expect(button(ThemeToggle({ label })).props["aria-pressed"]).toBe(true);
  });

  it("a click flips data-theme, both ways, and the button follows", () => {
    const { dataset, data } = page("light");
    const click = () => (button(ThemeToggle({ label })).props.onClick as () => void)();
    click();
    expect(dataset.theme).toBe("dark");
    expect(data.get(THEME_KEY)).toBe("dark");
    expect(button(ThemeToggle({ label })).props["aria-pressed"]).toBe(true);
    click();
    expect(dataset.theme).toBe("light");
    expect(data.has(THEME_KEY)).toBe(false); // light is the system's: the site follows the system again
    expect(button(ThemeToggle({ label })).props["aria-pressed"]).toBe(false);
  });

  it("on a dark system the first click stores light, the second goes back to following the system", () => {
    const { dataset, data } = page("dark", true);
    const click = () => (button(ThemeToggle({ label })).props.onClick as () => void)();
    click();
    expect(dataset.theme).toBe("light");
    expect(data.get(THEME_KEY)).toBe("light");
    click();
    expect(dataset.theme).toBe("dark");
    expect(data.has(THEME_KEY)).toBe(false);
  });

  it("the looks: ghost by default, quiet for a corner, the rail's link colours on a dark surface", () => {
    const ghost = renderToStaticMarkup(<ThemeToggle label={label} />);
    expect(ghost).toMatch(/class="[^"]*\btext-ink\b/);
    const quiet = renderToStaticMarkup(<ThemeToggle label={label} tone="quiet" />);
    expect(quiet).toMatch(/class="[^"]*\btext-ink-subtle\b/);
    const inverse = renderToStaticMarkup(<ThemeToggle label={label} tone="inverse" className="mt-2" />);
    expect(inverse).toContain("text-on-inverse-muted!");
    expect(inverse).toContain("hover:bg-inverse-raised!");
    expect(inverse).toMatch(/class="[^"]*\bmt-2\b/);
  });
});

describe("where the toggle is placed", () => {
  const read = (file: string) => readFileSync(path.join(__dirname, file), "utf8");
  const named = '<ThemeToggle label={t.theme.dark}';

  it("the store header: beside the currency picker on the desktop bar, and in the drawer's bottom row on phones", () => {
    const source = read("store-header.tsx");
    expect(source).toMatch(/switchers=\{\s*<>\s*<CurrencySwitcherSlot \/>\s*<ThemeToggle label=\{t\.theme\.dark\} \/>\s*<\/>\s*\}/);
    expect(source).toMatch(/<div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">\s*<CurrencySwitcherSlot \/>\s*<ThemeToggle label=\{t\.theme\.dark\} \/>/);
    // The compact bar has no room: the frame itself draws no toggle.
    expect(read("store-header-frame.tsx")).not.toContain("ThemeToggle");
  });

  it("the workspace: on the rail in its link colours, and in the phone drawer's bottom row", () => {
    const source = read("workspace-shell.tsx");
    expect(source).toMatch(/<ThemeToggle\s+label=\{t\.theme\.dark\}\s+tone="inverse"/);
    expect(source).toMatch(/<div className="grid gap-4 border-t border-line pt-4">[\s\S]*<ThemeToggle label=\{t\.theme\.dark\} \/>/);
    expect(source.match(/<ThemeToggle/g)).toHaveLength(2);
  });

  it("the sign-in pages and the checkout: a quiet button in the top corner", () => {
    expect(read("auth-shell.tsx")).toContain(named + ' tone="quiet" />');
    // The checkout header's row is full on a phone (it must not scroll sideways at 360 px): the switch is there from `sm` up.
    expect(read("checkout-header.tsx")).toContain(named + ' tone="quiet" className="max-sm:hidden" />');
  });
});
