// Brand and carrier logos in the browser (the header combobox's service rows). The server checks a logo file on disk
// (components/store/service-art.tsx); the browser cannot, so it looks the name up in lib/logo-sizes.json, the list of
// logo files with their pixel sizes that `npm run logos` writes (docs/LOGOS.md), with the same name rules
// (lib/logo-names.ts). Imported only by the lazy search chunk, so the list never reaches a page's first load.
import logoSizes from "@/lib/logo-sizes.json";
import { logoCandidates, type LogoFolder } from "@/lib/logo-names";

export type ClientLogo = { src: string; width: number; height: number };

const sizes = logoSizes as Record<string, number[] | undefined>;

/** The logo of a brand or carrier (`/images/brands/samsung.png` with its size), or null when there is none. */
export function clientLogo(folder: LogoFolder, name: string): ClientLogo | null {
  if (!name.trim()) return null;
  for (const file of logoCandidates(folder, name)) {
    const size = sizes[file];
    if (size && size.length >= 2) return { src: `/images/${file}`, width: size[0], height: size[1] };
  }
  return null;
}
