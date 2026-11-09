// Site imagery (banners, hero art, category art, the logo mark) is supplied by the owner as files in public/images/.
// docs/IMAGE-PROMPTS.md lists every expected file with its size and a generation prompt. Until a file exists the
// UI shows a neutral placeholder surface: never draw SVG artwork in its place. Server-only (reads the file system).
import { existsSync } from "node:fs";
import { join } from "node:path";

const known = new Map<string, boolean>();

/** `/images/<file>` when public/images/<file> exists, else null. Checked once per server process. */
export function siteImage(file: string): string | null {
  let exists = known.get(file);
  if (exists === undefined) {
    exists = existsSync(join(process.cwd(), "public", "images", file));
    known.set(file, exists);
  }
  return exists ? `/images/${file}` : null;
}
