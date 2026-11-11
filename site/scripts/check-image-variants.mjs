#!/usr/bin/env node
// Verify that every srcset candidate used by the site exists and has the
// width its descriptor promises. This reads the JPEG SOF header directly so
// CI does not need ImageMagick. Run `npm run images:variants` after replacing
// a master.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "screenshots");

const expected = [];
for (const name of [
  "overview",
  "printers",
  "print-jobs",
  "filaments",
  "spools",
  "analytics",
]) {
  expected.push([`${name}-1600.jpg`, 1600], [`${name}-2400.jpg`, 2400]);
}
for (const name of ["app-spools", "app-spool", "app-scan", "app-scan-crop"]) {
  expected.push(
    [`${name}-390.jpg`, 390],
    [`${name}-585.jpg`, 585],
    [`${name}-780.jpg`, 780],
  );
}
expected.push(["printer-detail-620.jpg", 620], ["printer-detail-930.jpg", 930]);

function jpegWidth(file) {
  const buffer = readFileSync(file);
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error("not a JPEG");
  }
  let offset = 2;
  while (offset < buffer.length - 1) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isStartOfFrame) {
      return buffer.readUInt16BE(offset + 7);
    }
    offset += 2 + length;
  }
  throw new Error("no JPEG start-of-frame marker");
}

let failed = false;
for (const [name, width] of expected) {
  const file = join(root, name);
  if (!existsSync(file)) {
    console.error(`missing variant: ${name}`);
    failed = true;
    continue;
  }
  try {
    const actual = jpegWidth(file);
    if (actual !== width) {
      console.error(`${name} is ${actual}px wide, expected ${width}px`);
      failed = true;
    }
  } catch (error) {
    console.error(`${name}: ${error.message}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
