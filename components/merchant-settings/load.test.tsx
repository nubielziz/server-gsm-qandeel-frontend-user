// The load helpers of the settings pages (components/merchant-settings/load.tsx).
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
import { LoadError, settle } from "./load";

function problem(status: number, code: string, requestId?: string): ApiError {
  return new ApiError({ status, code, requestId });
}

describe("settle", () => {
  it("returns the data of a read that worked", async () => {
    expect(await settle(async () => ({ keys: [] }))).toEqual({ ok: true, data: { keys: [] } });
  });

  it("returns an API error for the page to show", async () => {
    const error = problem(500, "INTERNAL_ERROR");
    expect(await settle(async () => Promise.reject(error))).toEqual({ ok: false, error });
  });

  it("sends a signed-out answer to the sign-in page, with the place to come back to when it is given", async () => {
    await expect(settle(async () => Promise.reject(problem(401, "UNAUTHORIZED")), "/en/account/settings")).rejects.toThrow(
      "redirect to /en/sign-in?next=%2Fen%2Faccount%2Fsettings",
    );
    await expect(settle(async () => Promise.reject(problem(403, "ACCOUNT_SUSPENDED")))).rejects.toThrow(
      "redirect to /en/sign-in",
    );
  });

  it("sends a rank refusal to the account home, not to the sign-in page", async () => {
    await expect(
      settle(async () => Promise.reject(problem(403, "RANK_NOT_ALLOWED")), "/en/account/settings/api-keys"),
    ).rejects.toThrow("redirect to /en/account");
  });

  it("rethrows what is not an API error", async () => {
    const bug = new Error("bug");
    await expect(settle(async () => Promise.reject(bug))).rejects.toBe(bug);
  });
});

describe("LoadError", () => {
  it("shows the text of the code and the request reference", () => {
    const html = renderToStaticMarkup(<LoadError error={problem(500, "INTERNAL_ERROR", "req-7")} />);
    expect(html).toContain(errors.codes.INTERNAL_ERROR);
    expect(html).toContain("req-7");
  });

  it("shows the generic text for a code without a text, and no approval notice", () => {
    const html = renderToStaticMarkup(<LoadError error={problem(403, "ACCOUNT_PENDING_APPROVAL")} />);
    expect(html).toContain(errors.codes.fallback);
    expect(html).not.toMatch(/approval/i);
  });
});
