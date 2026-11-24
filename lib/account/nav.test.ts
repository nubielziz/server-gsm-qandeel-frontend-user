import { describe, expect, it } from "vitest";
import { capabilitiesOf } from "./capabilities";
import {
  MAX_TABS,
  accountNav,
  accountPageTitles,
  accountSearch,
  accountSubtitle,
  securityPageHref,
  staticAccountNav,
  storeWalletShows,
  type AccountNavEntry,
} from "./nav";
import type { AccountWalletRead } from "./wallet-read";

const retail = capabilitiesOf({ rank: { kind: "retail" }, hasPassword: true });
const merchant = capabilitiesOf({ rank: { kind: "merchant" }, hasPassword: true });

const ids = (list: readonly AccountNavEntry[]) => list.map((entry) => entry.id);

describe("accountNav: the rail and the drawer", () => {
  it("retail rank: Overview, Orders, Notifications, Support while the store wallet is hidden", () => {
    expect(ids(accountNav(retail, false).nav)).toEqual(["overview", "orders", "notifications", "support"]);
  });

  it("retail rank: the Wallet comes in, between Orders and Notifications, only when the store wallet shows", () => {
    expect(ids(accountNav(retail, true).nav)).toEqual(["overview", "orders", "wallet", "notifications", "support"]);
  });

  it("retail rank never gets the invoices, whatever its wallet does", () => {
    for (const shown of [true, false]) {
      expect(ids(accountNav(retail, shown).nav)).not.toContain("invoices");
    }
  });

  it("merchant rank: Overview, Orders, Wallet, Invoices, Notifications, Support (no price list, decision 003)", () => {
    expect(ids(accountNav(merchant, false).nav)).toEqual(["overview", "orders", "wallet", "invoices", "notifications", "support"]);
  });

  it("no rank has a price list: no place leads to the retired /account/services", () => {
    for (const caps of [retail, merchant, capabilitiesOf(null)]) {
      for (const shown of [true, false]) {
        const lists = accountNav(caps, shown);
        const hrefs = [...lists.nav, ...lists.footerNav, ...lists.tabs].map((entry) => entry.href);
        expect(hrefs.filter((href) => href.startsWith("/en/account/services"))).toEqual([]);
      }
    }
  });

  it("the merchant rank's wallet shows whatever the store wallet says", () => {
    expect(ids(accountNav(merchant, false).nav)).toContain("wallet");
    expect(ids(accountNav(merchant, true).nav)).toEqual(ids(accountNav(merchant, false).nav));
  });

  it("a merchant rank adds exactly the invoices to the retail list that shows its wallet", () => {
    const extra = ids(accountNav(merchant, true).nav).filter((id) => !ids(accountNav(retail, true).nav).includes(id));
    expect(extra).toEqual(["invoices"]);
  });

  it("an unknown rank kind, a missing rank and a signed-out visitor get the retail list (fail closed)", () => {
    const unknown = [capabilitiesOf({ rank: { kind: "reseller" } }), capabilitiesOf({}), capabilitiesOf(null)];
    for (const caps of unknown) {
      expect(ids(accountNav(caps, false).nav)).toEqual(["overview", "orders", "notifications", "support"]);
    }
  });

  it("Settings is the one footer item, for every rank", () => {
    expect(ids(accountNav(retail, true).footerNav)).toEqual(["settings"]);
    expect(ids(accountNav(merchant, true).footerNav)).toEqual(["settings"]);
  });

  it("every address is a page of the one account area: none is under the retired merchant pages, none is repeated", () => {
    for (const caps of [retail, merchant]) {
      const lists = accountNav(caps, true);
      const hrefs = [...lists.nav, ...lists.footerNav, ...lists.tabs].map((entry) => entry.href);
      for (const href of hrefs) {
        expect(href === "/en/account" || href.startsWith("/en/account/")).toBe(true);
        expect(href).not.toContain("/merchant");
      }
      const rail = [...lists.nav, ...lists.footerNav].map((entry) => entry.href);
      expect(new Set(rail).size).toBe(rail.length);
    }
  });

  it("the words are the account's, not a kind's: Invoices and no portal name", () => {
    const labels = accountNav(merchant, true).nav.map((entry) => entry.label);
    expect(labels).toEqual(["Overview", "Orders", "Wallet", "Invoices", "Notifications", "Support"]);
    expect(JSON.stringify(accountNav(merchant, true))).not.toMatch(/merchant portal/i);
  });

  it("only the overview is an exact match: every other place owns the pages below it", () => {
    const entries = [...accountNav(merchant, true).nav, ...accountNav(merchant, true).footerNav];
    expect(entries.filter((entry) => entry.match === "exact").map((entry) => entry.id)).toEqual(["overview"]);
  });
});

describe("accountNav: the phone tab bar", () => {
  it("retail rank: the same places as its rail, with or without the wallet", () => {
    for (const shown of [true, false]) {
      const lists = accountNav(retail, shown);
      expect(ids(lists.tabs)).toEqual(ids(lists.nav));
    }
  });

  it("merchant rank: the retail rank's tabs with its wallet: Overview, Orders, Wallet, Notifications, Support", () => {
    expect(ids(accountNav(merchant, false).tabs)).toEqual(["overview", "orders", "wallet", "notifications", "support"]);
    expect(ids(accountNav(merchant, false).tabs)).toEqual(ids(accountNav(retail, true).tabs));
  });

  it("never more than five tabs, each a place of the rail with a short label", () => {
    for (const caps of [retail, merchant, capabilitiesOf(null)]) {
      for (const shown of [true, false]) {
        const lists = accountNav(caps, shown);
        expect(lists.tabs.length).toBeLessThanOrEqual(MAX_TABS);
        expect(MAX_TABS).toBe(5);
        for (const tab of lists.tabs) {
          expect(ids(lists.nav)).toContain(tab.id);
          expect(tab.shortLabel).toBeTruthy();
        }
      }
    }
  });

  it("the phone's words are short: the notifications are Alerts", () => {
    expect(accountNav(merchant, true).tabs.find((tab) => tab.id === "notifications")?.shortLabel).toBe("Alerts");
    expect(accountNav(retail, false).tabs.find((tab) => tab.id === "notifications")?.shortLabel).toBe("Alerts");
  });
});

describe("staticAccountNav: what the static shell draws before the session is read", () => {
  it("is the retail list with the wallet's place held, in the place the wallet takes", () => {
    const lists = staticAccountNav();
    expect(ids(lists.nav)).toEqual(["overview", "orders", "wallet", "notifications", "support"]);
    expect(lists.nav.filter((entry) => entry.reserve).map((entry) => entry.id)).toEqual(["wallet"]);
    expect(ids(lists.tabs)).toEqual(ids(lists.nav));
    expect(lists.tabs.filter((entry) => entry.reserve).map((entry) => entry.id)).toEqual(["wallet"]);
    expect(ids(lists.footerNav)).toEqual(["settings"]);
  });

  it("holds the same number of places as a retail rank whose wallet shows, so nothing moves when the session's list swaps in", () => {
    expect(staticAccountNav().nav).toHaveLength(accountNav(retail, true).nav.length);
  });

  it("has no place that only a merchant rank has, and nothing personal", () => {
    expect(ids(staticAccountNav().nav)).not.toContain("invoices");
  });
});

describe("accountPageTitles: the pages the static shell names only in the header", () => {
  const titles = accountPageTitles();

  it("names the invoices and the API keys page (no price list, decision 003)", () => {
    expect(titles).toEqual([
      { href: "/en/account/invoices", label: "Invoices" },
      { href: "/en/account/settings/api-keys", label: "API keys" },
    ]);
  });

  it("covers every place a merchant rank's list has and the static list lacks, so its header is right in the static shell", () => {
    const known = new Set(staticAccountNav().nav.map((entry) => entry.href));
    const missing = accountNav(merchant, true).nav.filter((entry) => !known.has(entry.href));
    expect(missing.length).toBeGreaterThan(0);
    for (const entry of missing) expect(titles.map((item) => item.href)).toContain(entry.href);
  });

  it("repeats no place of the static list", () => {
    const known = staticAccountNav().nav.map((entry) => entry.href);
    for (const item of titles) expect(known).not.toContain(item.href);
  });
});

describe("storeWalletShows: whether a retail rank's wallet is a place of the frame", () => {
  const store = (data: { enabled: boolean; balance: string; frozen?: boolean }): AccountWalletRead =>
    ({ kind: "store", read: { ok: true, data: { frozen: false, ...data } } }) as unknown as AccountWalletRead;

  it("shows while the shop switch is on", () => {
    expect(storeWalletShows(store({ enabled: true, balance: "0.0000" }))).toBe(true);
  });

  it("shows while a balance is left, even with the switch off", () => {
    expect(storeWalletShows(store({ enabled: false, balance: "12.5000" }))).toBe(true);
    expect(storeWalletShows(store({ enabled: false, balance: "-3.0000" }))).toBe(true);
  });

  it("hides when the switch is off and nothing is left", () => {
    expect(storeWalletShows(store({ enabled: false, balance: "0.0000" }))).toBe(false);
  });

  it("hides when nobody is signed in, when the read failed, and for the other kind of wallet", () => {
    expect(storeWalletShows(null)).toBe(false);
    expect(storeWalletShows({ kind: "store", read: { ok: false, error: new Error("down") } })).toBe(false);
    expect(
      storeWalletShows({ kind: "merchant", read: { ok: true, data: { available: "5.0000" } } } as unknown as AccountWalletRead),
    ).toBe(false);
  });
});

describe("accountSearch: where the header search goes", () => {
  it("every account searches the shop's services, where a merchant rank sees its own prices (decision 003)", () => {
    expect(accountSearch().action).toBe("/en/services");
  });

  it("has the words of the form", () => {
    expect(accountSearch()).toMatchObject({
      label: "Search services…",
      placeholder: "Search services…",
      submitLabel: "Search",
    });
  });
});

describe("accountSubtitle: the line under the name", () => {
  it("is the company when there is one, else the name of the rank", () => {
    expect(accountSubtitle({ company: "Zain Mobile Hub", rank: { name: "Gold" } })).toBe("Zain Mobile Hub");
    expect(accountSubtitle({ company: "", rank: { name: "Gold" } })).toBe("Gold");
    expect(accountSubtitle({ company: "   ", rank: { name: " Retail " } })).toBe("Retail");
  });

  it("says Your account when the answer has neither", () => {
    expect(accountSubtitle({})).toBe("Your account");
    expect(accountSubtitle({ company: null, rank: null })).toBe("Your account");
  });
});

describe("securityPageHref: where the password gate sends an account", () => {
  it("is the security page of the account's settings", () => {
    expect(securityPageHref()).toBe("/en/account/settings/security");
  });
});
