import { existsSync, openSync, readSync, closeSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import paymentLogoSizes from "@/lib/payment-logo-sizes.json";

// The list the forms read (lib/payment-logo-sizes.json, written by `npm run logos`) must say what is in
// public/images/payments: the site never reads that folder while rendering, so a file added without running the script
// would not show, and a file removed without running it would be a broken picture.
const dir = join(process.cwd(), "public", "images", "payments");
const listed = paymentLogoSizes as Record<string, number[]>;
const onDisk = existsSync(dir)
  ? readdirSync(dir)
      .filter((name) => name.endsWith(".png"))
      .sort()
  : [];

function pngSize(file: string): number[] {
  const fd = openSync(join(dir, file), "r");
  const header = Buffer.alloc(24);
  readSync(fd, header, 0, 24, 0);
  closeSync(fd);
  return [header.readUInt32BE(16), header.readUInt32BE(20)];
}

describe("lib/payment-logo-sizes.json matches public/images/payments", () => {
  it("lists every logo file of the folder: run `npm run logos` after adding one", () => {
    expect(Object.keys(listed).sort()).toEqual(onDisk.map((name) => `payments/${name}`));
  });

  it("records each file's real size: run `npm run logos` after replacing one", () => {
    for (const name of onDisk) expect(listed[`payments/${name}`], name).toEqual(pngSize(name));
  });
});
