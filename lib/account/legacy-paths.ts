// The old portal and ticket addresses and where each one lives now. There is one account area at `/account`; the old
// portal pages and the old ticket list answer a permanent redirect to it, and a stored link (an emailed link, a
// notification, a bookmark) that still names an old address is rewritten with `legacyAccountPath`. The retired price list
// (decision 003) ends at the shop's services; the old order form of one service (`/account/services/<id>`) is not a row
// here: it needs the service's shop page, so its own page redirects (app/en/account/services/[id]/page.tsx).
//
// Pure and import-free on purpose: next.config.ts reads this table too, and a config file cannot use the `@/` alias.
//
// Addresses here carry no language prefix. The redirect rules add it (one rule with it and one without), and a caller of
// `legacyAccountPath` adds it again with `sitePath`.
//
// Order is part of the table. A row with a fixed last segment comes before the row with a parameter in the same place
// (support/new before support/:id); the catch-all comes last. Next.js reads the rows in this order.

/** One redirect: `from` is a Next.js path pattern (`:name` is one segment, `:name*` is any number); `to` may use the names of `from`. */
export type LegacyPath = { readonly from: string; readonly to: string };

export const LEGACY_PATHS: readonly LegacyPath[] = [
  { from: "/merchant", to: "/account" },
  { from: "/merchant/services", to: "/services" },
  { from: "/merchant/services/:id", to: "/account/services/:id" },
  { from: "/merchant/orders", to: "/account/orders" },
  { from: "/merchant/orders/:id", to: "/account/orders/:id" },
  { from: "/merchant/wallet", to: "/account/wallet" },
  { from: "/merchant/wallet/top-up", to: "/account/wallet/add-funds" },
  { from: "/merchant/invoices", to: "/account/invoices" },
  { from: "/merchant/invoices/:id", to: "/account/invoices/:id" },
  { from: "/merchant/api-keys", to: "/account/settings/api-keys" },
  // The retired webhook pages end at the API keys page.
  { from: "/merchant/webhooks/:path*", to: "/account/settings/api-keys" },
  // The retired referrals page ends at the overview.
  { from: "/merchant/referrals", to: "/account" },
  { from: "/merchant/notifications", to: "/account/notifications" },
  { from: "/merchant/support", to: "/account/support" },
  { from: "/merchant/support/new", to: "/account/support/new" },
  { from: "/merchant/support/:id", to: "/account/support/:id" },
  { from: "/merchant/settings", to: "/account/settings" },
  { from: "/merchant/settings/security", to: "/account/settings/security" },
  { from: "/merchant/settings/notifications", to: "/account/settings/notifications" },
  // The retired verification page ends at the settings.
  { from: "/merchant/settings/verification", to: "/account/settings" },
  { from: "/merchant/set-password", to: "/set-password" },
  { from: "/merchant/verify-email", to: "/verify-email" },
  { from: "/merchant/register", to: "/become-a-merchant" },
  // The retired price list: a merchant rank sees its own prices in the shop (decision 003).
  { from: "/account/services", to: "/services" },
  { from: "/account/tickets", to: "/account/support" },
  { from: "/account/tickets/new", to: "/account/support/new" },
  // Anything else under the old portal prefix opens the overview. Keep this row last.
  { from: "/merchant/:path*", to: "/account" },
];

type Part = { kind: "literal"; value: string } | { kind: "param"; name: string } | { kind: "rest" };

type CompiledRow = { parts: Part[]; to: string };

function compile(row: LegacyPath): CompiledRow {
  const parts = row.from
    .split("/")
    .slice(1)
    .map((segment): Part => {
      if (/^:[A-Za-z]+\*$/.test(segment)) return { kind: "rest" };
      if (/^:[A-Za-z]+$/.test(segment)) return { kind: "param", name: segment.slice(1) };
      return { kind: "literal", value: segment };
    });
  return { parts, to: row.to };
}

const COMPILED: readonly CompiledRow[] = LEGACY_PATHS.map(compile);

/** A parameter takes one non-empty segment, and never a dot segment (plain or percent-encoded), so a rewrite cannot climb out of its page. */
function usableParam(segment: string): boolean {
  if (segment === "") return false;
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return false;
  }
  return decoded !== "." && decoded !== ".." && !decoded.includes("/") && !decoded.includes("\\");
}

/** The values of the parameters when the row matches the segments, else null. */
function matchRow(row: CompiledRow, segments: readonly string[]): Record<string, string> | null {
  const values: Record<string, string> = {};
  for (let i = 0; i < row.parts.length; i++) {
    const part = row.parts[i];
    if (part.kind === "rest") return values; // zero or more segments: nothing left to compare
    const segment = segments[i];
    if (segment === undefined) return null;
    if (part.kind === "literal") {
      if (segment !== part.value) return null;
    } else {
      if (!usableParam(segment)) return null;
      values[part.name] = segment;
    }
  }
  return segments.length === row.parts.length ? values : null;
}

/**
 * Maps an old address to its new one, or returns null when the address is not an old one.
 * Takes a path such as "/merchant/orders/42?x=1", with or without the language prefix, and gives "/account/orders/42?x=1"
 * (no language prefix; the query and the fragment are kept). The first row of `LEGACY_PATHS` that matches wins. A
 * parameter that is not one clean segment (empty, a dot segment) does not match its row, so such an address falls to the
 * catch-all and ends at the overview. Anything that is not a plain in-site path (no leading slash, a double slash, a
 * backslash, a control character) gives null.
 */
export function legacyAccountPath(input: string): string | null {
  if (typeof input !== "string" || !input.startsWith("/") || input.startsWith("//")) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(input)) return null;
  const cut = input.search(/[?#]/);
  const pathname = cut < 0 ? input : input.slice(0, cut);
  const tail = cut < 0 ? "" : input.slice(cut);
  const segments = pathname.split("/").slice(1);
  if (segments[segments.length - 1] === "") segments.pop(); // one trailing slash
  if (segments[0] === "en") segments.shift();
  for (const row of COMPILED) {
    const values = matchRow(row, segments);
    if (values) return row.to.replace(/:([A-Za-z]+)/g, (_, name: string) => values[name] ?? "") + tail;
  }
  return null;
}
