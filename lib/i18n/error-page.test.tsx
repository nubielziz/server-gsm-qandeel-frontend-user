import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The error page reads its language from the route: a stand-in that answers what a page under /en or /ar would.
const route = vi.hoisted(() => ({ lang: "en" }));
vi.mock("next/navigation", () => ({ useParams: () => ({ lang: route.lang }) }));

import ErrorPage from "@/app/[lang]/error";
import { LOCALES } from "./config";
import { ErrorTextProvider } from "./error-text";
import { common } from "./messages/common";
import { errors } from "./messages/errors";

const draw = (lang: "en" | "ar", error: unknown) => {
  route.lang = lang;
  return renderToStaticMarkup(
    <ErrorTextProvider messages={errors[lang]}>
      <ErrorPage error={error} reset={() => {}} />
    </ErrorTextProvider>,
  );
};

describe("the error page", () => {
  it.each(LOCALES)("shows its title, message, buttons and brand in %s from the provided texts", (lang) => {
    const t = common[lang];
    const html = draw(lang, new Error("boom"));
    expect(html).toContain(t.states.errorPageTitle);
    expect(html).toContain(t.states.errorPageText);
    expect(html).toContain(t.actions.retry);
    expect(html).toContain(t.actions.goHome);
    expect(html).toContain(`aria-label="${t.brand.logoAlt}"`);
    expect(html).toContain(t.brand.name);
    expect(html).toContain(`href="/${lang}"`);
    // Nothing technical for the visitor.
    expect(html).not.toContain("boom");
  });

  it.each(LOCALES)("shows the digest of a server error as the reference in %s", (lang) => {
    const error = Object.assign(new Error("boom"), { digest: "d1234" });
    expect(draw(lang, error)).toContain(common[lang].states.reference.replace("{id}", "d1234"));
  });

  it("has the same seven texts in both languages", () => {
    expect(Object.keys(errors.ar.page).sort()).toEqual(Object.keys(errors.en.page).sort());
    expect(Object.keys(errors.en.page)).toHaveLength(7);
    for (const lang of LOCALES) for (const text of Object.values(errors[lang].page)) expect(text).not.toBe("");
  });

  it("does not import the `common` namespace (it would put it back into the chunk of most routes)", () => {
    const source = readFileSync(new URL("../../app/[lang]/error.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+["'][^"']*messages\/common["']/);
  });
});
