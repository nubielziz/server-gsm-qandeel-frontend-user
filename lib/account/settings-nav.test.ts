import { describe, expect, it } from "vitest";
import { capabilitiesOf } from "./capabilities";
import { SETTINGS_PATHS, settingsNav, type SettingsSection } from "./settings-nav";

const retail = capabilitiesOf({ rank: { kind: "retail" }, hasPassword: true });
const merchant = capabilitiesOf({ rank: { kind: "merchant" }, hasPassword: true });

const sections = (caps: Parameters<typeof settingsNav>[0]): SettingsSection[] => settingsNav(caps).map((item) => item.section);

describe("settingsNav: the sections of the settings area", () => {
  it("a retail rank has Profile, Security and Privacy, in that order", () => {
    expect(sections(retail)).toEqual(["profile", "security", "privacy"]);
  });

  it("a merchant rank adds Notifications and API keys, and Privacy stays last", () => {
    expect(sections(merchant)).toEqual(["profile", "security", "notifications", "api-keys", "privacy"]);
  });

  it("a rank kind the shop does not know gets the retail list (fail closed)", () => {
    expect(sections(capabilitiesOf({ rank: { kind: "reseller" }, hasPassword: true }))).toEqual([
      "profile",
      "security",
      "privacy",
    ]);
    expect(sections(capabilitiesOf({ rank: null }))).toEqual(["profile", "security", "privacy"]);
  });

  it("a link-only account still has Security, where it is offered a password", () => {
    expect(sections(capabilitiesOf({ rank: { kind: "retail" }, hasPassword: false }))).toContain("security");
  });

  it("a signed-out visitor has no privacy section and no merchant section", () => {
    expect(sections(capabilitiesOf(null))).toEqual(["profile", "security"]);
  });

  it("every address is under the settings area, on the one account area, and none names the old portal", () => {
    for (const item of settingsNav(merchant)) {
      expect(item.href).toBe(SETTINGS_PATHS[item.section]);
      expect(item.href.startsWith("/account/settings")).toBe(true);
      expect(item.href).not.toContain("/merchant");
      expect(item.href).not.toMatch(/^\/en(\/|$)/);
    }
  });

  it("only the profile, the area's own address, is matched exactly; the others also own the pages below them", () => {
    const byId = Object.fromEntries(settingsNav(merchant).map((item) => [item.section, item.match]));
    expect(byId).toEqual({
      profile: "exact",
      security: "prefix",
      notifications: "prefix",
      "api-keys": "prefix",
      privacy: "prefix",
    });
  });

  it("lists no section twice", () => {
    const all = sections(merchant);
    expect(new Set(all).size).toBe(all.length);
  });
});
