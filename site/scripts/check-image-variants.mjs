#!/usr/bin/env node
// Verify that every srcset candidate used by the site exists and has the
// width its descriptor promises. The expected variants are derived from the
// masters in public/screenshots plus the width policy below, so adding a
// capture does not require editing a second list. Run
// `npm run images:variants` after replacing a master. This reads JPEG SOF
// headers directly so CI does not need ImageMagick.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "screenshots");

// Master width -> generated variant widths.
const VARIANT_WIDTHS = {
  3200: [1600, 2400],
  1170: [390, 585, 780],
  1240: [620, 930],
};

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

function checkFile(name, expectedWidth) {
  const file = join(root, name);
  if (!existsSync(file)) {
    console.error(`missing variant: ${name} (expected ${expectedWidth}px)`);
    failed = true;
    return;
  }
  try {
    const actual = jpegWidth(file);
    if (actual !== expectedWidth) {
      console.error(`${name} is ${actual}px wide, expected ${expectedWidth}px`);
      failed = true;
    }
  } catch (error) {
    console.error(`${name}: ${error.message}`);
    failed = true;
  }
}

const files = readdirSync(root).filter((name) => name.endsWith(".jpg"));

for (const name of files) {
  const variant = name.match(/-(\d+)\.jpg$/);
  if (variant) {
    checkFile(name, Number(variant[1]));
    continue;
  }

  let masterWidth;
  try {
    masterWidth = jpegWidth(join(root, name));
  } catch (error) {
    console.error(`${name}: ${error.message}`);
    failed = true;
    continue;
  }

  const widths = VARIANT_WIDTHS[masterWidth];
  if (!widths) {
    console.error(
      `no variant policy for ${name} (${masterWidth}px); update the generator and check`,
    );
    failed = true;
    continue;
  }

  const base = name.slice(0, -4);
  for (const width of widths) {
    checkFile(`${base}-${width}.jpg`, width);
  }
}

if (failed) {
  process.exit(1);
}
