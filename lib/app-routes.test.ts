// Guards the production topology (docs/DEPLOY.md): on the shop host Caddy sends `/client/*` and `/store/v1/*` to the API
// before a request can reach the site, and next.config.ts rewrites the same two prefixes to the API in dev and under
// `next start`. A page of the site at one of those paths could never be served, so no folder of `app/` may define one.
// Plan A14 / F02: the first URL segment of the site is never `client` or `store`, and no folder directly under
// `app/en` (route groups, parallel slots and intercepting prefixes looked through) is named `client` or `store`.
import { readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const APP_DIR = fileURLToPath(new URL("../app", import.meta.url));

/** First-level URL segments the API owns on the shop host. */
const RESERVED = new Set(["client", "store"]);

/**
 * The URL segment a folder adds, or null when it adds none.
 * - `(group)`, `@slot` and `_private` add no segment;
 * - an intercepting folder `(.)x`, `(..)x`, `(...)x` or `(..)(..)x` adds `x`;
 * - everything else (`orders`, `en`, `[slug]`, `[...slug]`) adds its own name.
 */
function urlSegmentOf(folder: string): string | null {
  const intercepted = /^(?:\(\.{1,3}\))+(.+)$/.exec(folder);
  if (intercepted) return intercepted[1];
  if (/^\(.+\)$/.test(folder) || folder.startsWith("@") || folder.startsWith("_")) return null;
  return folder;
}

/** Every directory under `root`, as a path relative to it split into folder names. */
function folderPaths(root: string, parts: string[] = []): string[][] {
  const found: string[][] = [];
  for (const entry of readdirSync(join(root, ...parts), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const here = [...parts, entry.name];
    found.push(here, ...folderPaths(root, here));
  }
  return found;
}

/**
 * The folders that would put a site page under a prefix the API owns. A folder counts when its own URL path is exactly
 * `/client`, `/store`, `/en/client` or `/en/store` (a deeper page lives inside one of those folders, which is
 * reported itself).
 */
function reservedFolders(folders: string[][]): string[] {
  return folders
    .filter((path) => {
      const segment = urlSegmentOf(path[path.length - 1]);
      if (segment === null || !RESERVED.has(segment)) return false;
      const parents = path
        .slice(0, -1)
        .map(urlSegmentOf)
        .filter((s): s is string => s !== null);
      return parents.length === 0 || (parents.length === 1 && parents[0] === "en");
    })
    .map((path) => path.join("/"));
}

const folder = (path: string) => path.split("/");

describe("the site defines no page under the API's prefixes", () => {
  it("has no folder in app/ at /client, /store, /en/client or /en/store", () => {
    expect(reservedFolders(folderPaths(APP_DIR))).toEqual([]);
  });

  it("walks the real app folder (the guard is not vacuous)", () => {
    const folders = folderPaths(APP_DIR).map((path) => path.join(sep));
    expect(folders).toContain("en");
    // `(store)` is a route group: looked through, never a `/store` segment.
    expect(folders).toContain(join("en", "(store)"));
    expect(folders).toContain(join("en", "(portal)", "merchant"));
  });
});

describe("reservedFolders", () => {
  it("flags a first-level client or store folder", () => {
    expect(reservedFolders([folder("client"), folder("client/v2"), folder("store"), folder("store/v1")])).toEqual([
      "client",
      "store",
    ]);
  });

  it("looks through route groups and parallel slots", () => {
    expect(reservedFolders([folder("(shop)"), folder("(shop)/client"), folder("@modal"), folder("@modal/store")])).toEqual([
      "(shop)/client",
      "@modal/store",
    ]);
  });

  it("flags a folder directly under en, also behind route groups", () => {
    expect(
      reservedFolders([
        folder("en/client"),
        folder("en/store"),
        folder("en/(store)/store"),
        folder("en/(portal)/(deep)/client"),
        folder("en/(store)/@modal/(.)store"),
      ]),
    ).toEqual([
      "en/client",
      "en/store",
      "en/(store)/store",
      "en/(portal)/(deep)/client",
      "en/(store)/@modal/(.)store",
    ]);
  });

  it("accepts the real shape of the site", () => {
    expect(
      reservedFolders([
        folder("en"),
        folder("en/(store)"),
        folder("en/(store)/services"),
        folder("en/(store)/@modal/(.)quick-view"),
        folder("en/(portal)/merchant"),
        folder("en/account/orders"),
      ]),
    ).toEqual([]);
  });

  it("accepts look-alike names, private folders and deeper folders", () => {
    expect(
      reservedFolders([
        folder("clients"),
        folder("stores"),
        folder("_client"),
        folder("en/_store"),
        folder("en/merchant/store"),
        folder("en/(portal)/merchant/client"),
        folder("[client]"),
      ]),
    ).toEqual([]);
  });
});
