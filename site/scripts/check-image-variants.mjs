#!/usr/bin/env node
// Verify every master and srcset candidate named in the shared manifest
// exists at the expected width. This reads JPEG SOF headers directly so CI
// does not need ImageMagick. Run `npm run images:variants` after replacing a
// master.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "public", "screenshots");
const manifest = JSON.parse(readFileSync(join(here, "image-variants.json"), "utf8"));

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
    console.error(`missing image: ${name} (expected ${expectedWidth}px)`);
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

const manifestFiles = new Set(manifest.masters.map((entry) => entry.file));

for (const entry of manifest.masters) {
  checkFile(entry.file, entry.width);
  const base = entry.file.slice(0, -4);
  for (const width of entry.variants) {
    checkFile(`${base}-${width}.jpg`, width);
  }
}

// Every screenshot referenced by the site must have a manifest entry, so a
// new capture cannot silently ship without generated variants.
const sourceRoots = [join(here, "..", "app"), join(here, "..", "components")];
const referenced = new Set();

function collectReferences(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) {
      collectReferences(path);
      continue;
    }
    if (!item.name.endsWith(".tsx")) {
      continue;
    }
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/\/screenshots\/([A-Za-z0-9._-]+\.jpg)/g)) {
      referenced.add(match[1]);
    }
  }
}

for (const dir of sourceRoots) {
  collectReferences(dir);
}
for (const name of referenced) {
  if (!manifestFiles.has(name)) {
    console.error(`screenshot not listed in scripts/image-variants.json: ${name}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
