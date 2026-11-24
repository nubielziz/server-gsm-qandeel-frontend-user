// The home page's pointer to the price list: it shows for a merchant rank only, and a visitor or a retail account costs no request.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { common } from "@/lib/i18n/messages/common";
import { bannerShows, RankBannerView } from "./rank-banner";

const PORTAL_COOKIE = "csrf_token_client=abc";
const SHOP_COOKIE = "csrf_token_store=abc";

const reader = (answer: unknown) => vi.fn(async () => answer as { rank?: { kind?: string } });

describe("bannerShows", () => {
  it("a visitor with no account cookie costs no request and sees no banner", async () => {
    const read = reader({ rank: { kind: "merchant" } });
    expect(await bannerShows("theme=dark; gsm_currency=USD", read)).toBe(false);
    expect(await bannerShows("", read)).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it("a retail account (the shop's cookie) costs no request and sees no banner", async () => {
    const read = reader({ rank: { kind: "merchant" } });
    expect(await bannerShows(SHOP_COOKIE, read)).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it("a merchant rank (the portal's cookie) is confirmed by the account route and sees the banner", async () => {
    const read = reader({ rank: { kind: "merchant" } });
    expect(await bannerShows(PORTAL_COOKIE, read)).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith("/client/auth/me");
  });

  it("the portal's cookie wins when both exist", async () => {
    const read = reader({ rank: { kind: "merchant" } });
    expect(await bannerShows(`${SHOP_COOKIE}; ${PORTAL_COOKIE}`, read)).toBe(true);
    expect(read).toHaveBeenCalledWith("/client/auth/me");
  });

  it("the banner shows only when the answer names the merchant rank", async () => {
    expect(await bannerShows(PORTAL_COOKIE, reader({ rank: { kind: "retail" } }))).toBe(false);
    expect(await bannerShows(PORTAL_COOKIE, reader({ rank: { kind: "wholesale" } }))).toBe(false);
    expect(await bannerShows(PORTAL_COOKIE, reader({}))).toBe(false);
  });

  it("any failure of the read (signed out, a rank refusal, no answer) means no banner and no error", async () => {
    const failing = vi.fn(async (): Promise<{ rank?: { kind?: string } }> => {
      throw new Error("no answer");
    });
    await expect(bannerShows(PORTAL_COOKIE, failing)).resolves.toBe(false);
  });
});

describe("RankBannerView", () => {
  it("says the text and links to the price list of the account area", () => {
    const html = renderToStaticMarkup(
      <RankBannerView text={common.rankBanner.text} cta={common.rankBanner.cta} href="/en/account/services" />,
    );
    expect(html).toContain(common.rankBanner.text);
    expect(html).toContain(common.rankBanner.cta);
    expect(html).toContain('href="/en/account/services"');
    expect(html).not.toContain("portal");
  });
});
