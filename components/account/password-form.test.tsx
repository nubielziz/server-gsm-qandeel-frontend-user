import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The form reads the router from next/navigation and posts through the browser client; the test stands in for both.
const post = vi.hoisted(() => vi.fn<(path: string, body?: unknown) => Promise<unknown>>(async () => undefined));
vi.mock("@/lib/api/browser", () => ({ api: { post } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));

import { FAMILY_ROUTES } from "@/lib/account/routes";
import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { account } from "@/lib/i18n/messages/account";
import { errors } from "@/lib/i18n/messages/errors";
import { PasswordForm, postPasswordChange } from "./password-form";

const change = { currentPassword: "Orchard-Lantern-8841", newPassword: "Quartz-Meadow-9082" };

beforeEach(() => {
  post.mockClear();
});

describe("postPasswordChange: the one call the form makes", () => {
  it("posts to the endpoint it is given, with the current and the new password and nothing else", async () => {
    await postPasswordChange("/store/v1/me/password", change);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/store/v1/me/password", change);
  });

  it("a merchant rank's endpoint gets the same body on its own route", async () => {
    await postPasswordChange(FAMILY_ROUTES.client.password, change);
    expect(post).toHaveBeenCalledWith("/client/security/password", {
      currentPassword: change.currentPassword,
      newPassword: change.newPassword,
    });
  });

  it("a retail rank's endpoint is the shop route of the family table", async () => {
    await postPasswordChange(FAMILY_ROUTES.store.password, change);
    expect(post).toHaveBeenCalledWith("/store/v1/me/password", change);
  });

  it("lets the error of a refused change reach the form", async () => {
    post.mockRejectedValueOnce(new Error("refused"));
    await expect(postPasswordChange(FAMILY_ROUTES.store.password, change)).rejects.toThrow("refused");
  });
});

describe("PasswordForm: what the page shows", () => {
  const html = renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <PasswordForm endpoint={FAMILY_ROUTES.client.password} t={account.settings.password} />
    </ErrorTextProvider>,
  );

  it("asks for the current password, the new one and its confirmation, for any rank", () => {
    expect(html).toContain('name="currentPassword"');
    expect(html).toContain('name="newPassword"');
    expect(html).toContain('name="confirmPassword"');
    expect(html).toContain(account.settings.password.submit);
  });

  it("starts without a success message, and does not print the route", () => {
    expect(html).not.toContain(account.settings.password.savedText);
    expect(html).not.toContain("/client/security/password");
  });
});
