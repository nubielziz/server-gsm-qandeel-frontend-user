import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(nav.query) }));

import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { auth } from "@/lib/i18n/messages/auth";
import { errors } from "@/lib/i18n/messages/errors";
import { SetPasswordForm } from "./set-password-form";

const draw = () =>
  renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <SetPasswordForm t={{ fields: auth.fields, shared: auth.shared, setPassword: auth.setPassword }} />
    </ErrorTextProvider>,
  );

beforeEach(() => {
  nav.query = "";
});

describe("the password link page", () => {
  it("explains a missing link and offers a new one at the one forgot page, with no account type", () => {
    const html = draw();
    expect(html).toContain("This page needs the link from your email");
    expect(html).toContain('href="/en/forgot-password"');
    expect(html).not.toMatch(/[?&]as=/);
  });

  it("with a token shows the two password fields and the submit (the same page for every account)", () => {
    nav.query = "token=abc";
    const html = draw();
    expect(html).toContain('name="password"');
    expect(html).toContain('name="confirmPassword"');
    expect(html).toContain("Save password");
  });
});
