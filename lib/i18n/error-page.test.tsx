import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ErrorPage from "@/app/en/error";
import { ErrorTextProvider } from "./error-text";
import { common } from "./messages/common";
import { errors } from "./messages/errors";

const draw = (error: unknown) =>
  renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <ErrorPage error={error} reset={() => {}} />
    </ErrorTextProvider>,
  );

describe("the error page", () => {
  const t = common;

  it("shows its title, message, buttons and brand from the provided texts, and leads home to /en", () => {
    const html = draw(new Error("boom"));
    expect(html).toContain(t.states.errorPageTitle);
    expect(html).toContain(t.states.errorPageText);
    expect(html).toContain(t.actions.retry);
    expect(html).toContain(t.actions.goHome);
    expect(html).toContain(`aria-label="${t.brand.logoAlt}"`);
    expect(html).toContain(t.brand.name);
    expect(html).toContain(`href="/en"`);
    // Nothing technical for the visitor.
    expect(html).not.toContain("boom");
  });

  it("shows the digest of a server error as the reference", () => {
    const error = Object.assign(new Error("boom"), { digest: "d1234" });
    expect(draw(error)).toContain(t.states.reference.replace("{id}", "d1234"));
  });

  it("has seven texts, none empty", () => {
    expect(Object.keys(errors.page)).toHaveLength(7);
    for (const text of Object.values(errors.page)) expect(text).not.toBe("");
  });

  it("does not import the `common` namespace (it would put it back into the chunk of most routes)", () => {
    const source = readFileSync(new URL("../../app/en/error.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+["'][^"']*messages\/common["']/);
  });
});
