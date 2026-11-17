// Writes the pixel size of every logo PNG, so the site draws each logo at its real proportions and knows which logo
// files exist without reading files while it renders (Cache Components treats file reads during a prerender as
// unstable; a Client Component cannot read files at all). Run it after adding or replacing logos: `npm run logos`.
//   lib/logo-sizes.json          public/images/brands and public/images/carriers (docs/LOGOS.md)
//   lib/payment-logo-sizes.json  public/images/payments: the bundled logos of the ready-made payment methods
//                                (lib/payments/logos.ts). Its own file so the forms that show them do not carry the
//                                86 brand logos in their bundle.
// A logo missing from its list still shows, in a 2:1 box (brands, carriers); a payment logo missing from its list is
// not shown at all, the method's icon is shown instead. No dependencies: the size is read from the PNG header.
import { closeSync, openSync, readSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const outputs = [
  { file: "logo-sizes.json", folders: ["brands", "carriers"] },
  { file: "payment-logo-sizes.json", folders: ["payments"] },
];

for (const { file, folders } of outputs) {
  const sizes = {};
  for (const folder of folders) {
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
  const lines = Object.entries(sizes).map(([logo, size]) => `  ${JSON.stringify(logo)}: ${JSON.stringify(size)}`);
  writeFileSync(join(root, "lib", file), lines.length ? `{\n${lines.join(",\n")}\n}\n` : "{}\n");
  console.log(`lib/${file}: ${Object.keys(sizes).length} logos`);
}
