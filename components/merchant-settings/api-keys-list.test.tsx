import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { merchantSettings } from "@/lib/i18n/messages/merchant-settings";
import { ApiKeysList, type KeyRow } from "./api-keys-list";

const t = merchantSettings.apiKeys;
const live: KeyRow = {
  id: 1,
  name: "Production server",
  prefix: "gsm_Qx4f",
  allowedIps: ["203.0.113.55"],
  rateLimitPerMin: 60,
  lastUsed: null,
  lastUsedIp: "",
  expires: null,
  created: "Nov 24, 2026",
  revoked: false,
  expired: false,
};
const render = (rows: KeyRow[], external = true) =>
  renderToStaticMarkup(
    <ApiKeysList rows={rows} contact={{ href: external ? "https://wa.me/15550100" : "/en/support", external }} t={t} />,
  );

describe("ApiKeysList: the merchant's keys, read only (decision 005)", () => {
  it("shows a key's details and offers no button to create, edit or revoke one", () => {
    const html = render([live, { ...live, id: 2, name: "Old", revoked: true }]);
    expect(html).toContain("Production server");
    expect(html).toContain("gsm_Qx4f");
    expect(html).toContain("203.0.113.55");
    expect(html).toContain(`>${t.revoked}<`);
    expect(html).not.toContain("<button");
    expect(html).not.toMatch(/New API key|>Edit<|>Revoke</);
  });

  it("points to the team: a WhatsApp chat in a new tab, else the support page", () => {
    expect(render([live])).toContain('href="https://wa.me/15550100"');
    expect(render([live])).toContain(t.opensNewTab);
    const support = render([live], false);
    expect(support).toContain('href="/en/support"');
    expect(support).not.toContain(t.opensNewTab);
  });

  it("says the team creates keys when there is none", () => {
    expect(render([])).toContain(t.emptyText);
  });
});
