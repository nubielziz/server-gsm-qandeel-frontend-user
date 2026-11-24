// What a page shows for a failed load (components/merchant/page-error.tsx).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}

vi.mock("next/headers", () => ({ cookies: async () => ({ has: () => false }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
  notFound: () => {
    throw new Error("not found");
  },
  useRouter: () => ({ refresh: () => {} }),
}));
vi.mock("@/lib/api/server", () => ({ apiSessionGet: vi.fn() }));

import { ApiError } from "@/lib/api/errors";
import { errors } from "@/lib/i18n/messages/errors";
import { PageError } from "./page-error";

function problem(status: number, code: string, requestId?: string): ApiError {
  return new ApiError({ status, code, requestId });
}

describe("PageError", () => {
  it("shows the text of the error code and the request reference inside the page", () => {
    const html = renderToStaticMarkup(<PageError error={problem(500, "INTERNAL_ERROR", "req-42")} next="/en/account/orders" />);
    expect(html).toContain(errors.codes.INTERNAL_ERROR);
    expect(html).toContain("req-42");
  });

  it("puts the page heading above the notice when it is given one", () => {
    const html = renderToStaticMarkup(
      <PageError error={problem(500, "INTERNAL_ERROR")} next="/en/account/orders" title="Orders" />,
    );
    expect(html).toContain("Orders");
    expect(html).toContain(errors.codes.INTERNAL_ERROR);
  });

  it("redirects a signed-out answer to the sign-in page and a rank refusal to the account home", () => {
    expect(() => renderToStaticMarkup(<PageError error={problem(401, "UNAUTHORIZED")} next="/en/account/orders" />)).toThrow(
      "redirect to /en/sign-in?next=%2Fen%2Faccount%2Forders",
    );
    expect(() =>
      renderToStaticMarkup(<PageError error={problem(403, "RANK_NOT_ALLOWED")} next="/en/account/services" />),
    ).toThrow("redirect to /en/account");
  });

  it("has no waiting-for-approval notice: that answer gets the generic text", () => {
    const html = renderToStaticMarkup(<PageError error={problem(403, "ACCOUNT_PENDING_APPROVAL")} next="/en/account/orders" />);
    expect(html).toContain(errors.codes.fallback);
    expect(html).not.toMatch(/approval/i);
  });
});
