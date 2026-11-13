// Site imagery (banners, hero art, category art, the logo mark) is supplied by the owner as files in public/images/.
// docs/IMAGE-PROMPTS.md lists every expected file with its size and a generation prompt. Until a file exists the
// UI shows a neutral placeholder surface: never draw SVG artwork in its place. Server-only (reads the file system).
import { existsSync } from "node:fs";
import { join } from "node:path";
import logoSizes from "./logo-sizes.json";

const known = new Map<string, boolean>();
// In development the folder is checked on every render, so a file the owner adds shows up without a restart.
const remember = process.env.NODE_ENV === "production";

/** `/images/<file>` when public/images/<file> exists, else null. Checked once per server process in production. */
export function siteImage(file: string): string | null {
  let exists = remember ? known.get(file) : undefined;
  if (exists === undefined) {
    exists = existsSync(join(process.cwd(), "public", "images", file));
    if (remember) known.set(file, exists);
  }
  return exists ? `/images/${file}` : null;
}

/**
 * The pixel size of a logo (`brands/<name>.png`, `carriers/<name>.png`) from lib/logo-sizes.json, which `npm run logos`
 * writes (docs/LOGOS.md); null for a file it does not list yet. No file is read while rendering.
 */
export function logoSize(file: string): { width: number; height: number } | null {
  const size: number[] | undefined = (logoSizes as Record<string, number[]>)[file];
  return size ? { width: size[0], height: size[1] } : null;
}
