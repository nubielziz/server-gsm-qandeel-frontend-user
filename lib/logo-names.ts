// Pure rules of service art: how a brand or carrier name finds its logo file (`brands/<slug>.png`, `carriers/<slug>.png`,
// docs/LOGOS.md) and which picture paths of the API are trusted. Safe anywhere: the server
// (components/store/service-art.tsx, which also checks that the file exists) and the lazy search chunk
// (lib/search/logo-client.ts, which checks lib/logo-sizes.json) share them, so a name finds the same logo on a card and
// in the search box.

export type LogoFolder = "brands" | "carriers";

/** A name as a logo file name: "AT&T" → `at-t`, "T-Mobile" → `t-mobile`, "Bell Canada" → `bell-canada`. */
export function logoSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Other spellings of a logo's name (after `logoSlug`) as catalogs write them. */
export const LOGO_ALIASES: Readonly<Record<string, string>> = {
  att: "at-t",
  "at-and-t": "at-t",
  tmobile: "t-mobile",
  "deutsche-telekom": "telekom",
  "3": "three",
  mobinil: "orange",
  "e-and": "etisalat",
  metropcs: "metro",
  iphone: "apple",
  ipad: "apple",
  mi: "xiaomi",
  redmi: "xiaomi",
  psn: "playstation",
};

/**
 * The file names a name may use, best first: the whole name, then its first words ("Cricket Wireless" → `cricket-wireless`,
 * `cricket`), each followed by its alias when it has one. The caller keeps the first file that exists.
 */
export function logoCandidates(folder: LogoFolder, name: string): string[] {
  const parts = logoSlug(name).split("-").filter(Boolean);
  const files: string[] = [];
  for (let n = parts.length; n >= 1; n--) {
    const slug = parts.slice(0, n).join("-");
    if (slug.length > 40) continue;
    for (const candidate of [slug, LOGO_ALIASES[slug]]) {
      if (candidate) files.push(`${folder}/${candidate}.png`);
    }
  }
  return files;
}

/** What the API's `imageUrl` may look like: `/store/v1/media/<name>`, one path segment, no query. */
const PICTURE_PATH = /^\/store\/v1\/media\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * The path of a service picture, or null when the service has none (or the value is not a media path of this site:
 * the optimizer only accepts `/store/v1/media/**`, and nothing else from the API is trusted as an image source).
 */
export function servicePicture(imageUrl: string | null | undefined): string | null {
  return imageUrl && PICTURE_PATH.test(imageUrl) ? imageUrl : null;
}
