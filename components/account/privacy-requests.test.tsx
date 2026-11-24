import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The component posts through the browser client; the test stands in for it and reads what was sent.
const post = vi.hoisted(() =>
  vi.fn<(path: string, body?: unknown) => Promise<unknown>>(async () => ({
    id: 1,
    kind: "export",
    status: "open",
    requestedAt: "",
    dueAt: "",
  })),
);
vi.mock("@/lib/api/browser", () => ({ api: { post } }));

import { ErrorTextProvider } from "@/lib/i18n/error-text";
import { account } from "@/lib/i18n/messages/account";
import { common } from "@/lib/i18n/messages/common";
import { errors } from "@/lib/i18n/messages/errors";
import { dataRequestRoute, PrivacyRequests, sendDataRequest } from "./privacy-requests";

const t = account.settings.privacy;
const SUPPORT = "/en/account/support/new";

const render = (canErase: boolean) =>
  renderToStaticMarkup(
    <ErrorTextProvider messages={errors}>
      <PrivacyRequests t={t} requestStatus={common.status.request} canErase={canErase} supportHref={SUPPORT} />
    </ErrorTextProvider>,
  );

beforeEach(() => {
  post.mockClear();
});

describe("dataRequestRoute: which request an account may send", () => {
  it("a copy of the data is open to every account, whatever its rank", () => {
    expect(dataRequestRoute("export", true)).toBe("/store/v1/me/data-export");
    expect(dataRequestRoute("export", false)).toBe("/store/v1/me/data-export");
  });

  it("erasure is open to the retail rank only: for a merchant rank there is no route at all", () => {
    expect(dataRequestRoute("erasure", true)).toBe("/store/v1/me/data-delete");
    expect(dataRequestRoute("erasure", false)).toBeNull();
  });
});

describe("sendDataRequest", () => {
  it("a merchant rank's export is posted, its erasure is never sent", async () => {
    await sendDataRequest("export", false);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/store/v1/me/data-export");

    post.mockClear();
    expect(await sendDataRequest("erasure", false)).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("a retail rank's erasure is posted to the deletion route", async () => {
    await sendDataRequest("erasure", true);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/store/v1/me/data-delete");
  });
});

describe("PrivacyRequests: what each rank sees", () => {
  it("a retail rank has both buttons and no sentence about a merchant rank", () => {
    const html = render(true);
    expect(html).toContain(t.export.action);
    expect(html).toContain(t.erase.action);
    expect(html).toContain(t.erase.text);
    expect(html).not.toContain(t.erase.merchantRank);
  });

  it("a merchant rank has the export button and, in place of the erasure button, the sentence and a way to ask the team", () => {
    const html = render(false);
    expect(html).toContain(t.export.action);
    expect(html).toContain(t.erase.merchantRank);
    expect(html).toContain(`href="${SUPPORT}"`);
    expect(html).not.toContain(t.erase.action);
    expect(html).not.toContain(t.erase.text);
  });

  it("the sentence says what the API says when it refuses an erasure", () => {
    expect(t.erase.merchantRank).toBe(
      "This account has a merchant rank. Ask us to move it to the retail rank first; then you can ask for erasure.",
    );
  });

  it("a merchant rank has no confirmation dialog for erasure at all, and a retail rank's is only drawn, closed, for its button", () => {
    const merchant = render(false);
    expect(merchant).not.toContain(t.erase.confirmTitle);
    expect(merchant).not.toContain(t.erase.confirm);
    expect(render(true)).toContain(t.erase.confirmTitle);
  });
});
