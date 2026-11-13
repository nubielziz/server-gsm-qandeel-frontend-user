// Writes lib/logo-sizes.json: the pixel size of every logo PNG in public/images/brands and public/images/carriers, so
// the site draws each logo at its real proportions without reading files while it renders (Cache Components treats
// file reads during a prerender as unstable). Run it after adding or replacing logos: `npm run logos`. A logo missing
// from the list still shows, in a 2:1 box. No dependencies: the size is read from the PNG header.
import { closeSync, openSync, readSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const sizes = {};
for (const folder of ["brands", "carriers"]) {
  const dir = join(root, "public", "images", folder);
  let names = [];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith(".png")).sort();
  } catch {
    continue;
  }
  for (const name of names) {
    const fd = openSync(join(dir, name), "r");
    const header = Buffer.alloc(24);
    readSync(fd, header, 0, 24, 0);
    closeSync(fd);
    // PNG signature, then the IHDR chunk: width and height as big-endian 32-bit integers at bytes 16 and 20.
    if (header.readUInt32BE(0) !== 0x89504e47 || header.toString("ascii", 12, 16) !== "IHDR") {
      console.warn(`skipped ${folder}/${name}: not a PNG`);
      continue;
    }
    sizes[`${folder}/${name}`] = [header.readUInt32BE(16), header.readUInt32BE(20)];
  }
}
// One logo per line: `"brands/apple.png": [84, 96],`
const lines = Object.entries(sizes).map(([file, size]) => `  ${JSON.stringify(file)}: ${JSON.stringify(size)}`);
writeFileSync(join(root, "lib", "logo-sizes.json"), `{\n${lines.join(",\n")}\n}\n`);
console.log(`lib/logo-sizes.json: ${Object.keys(sizes).length} logos`);
