#!/usr/bin/env node
// Regenerate the pre-sized screenshots that the static site serves through
// <img srcset>. The manifest is shared with check-image-variants.mjs.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "public", "screenshots");
const manifest = JSON.parse(readFileSync(join(here, "image-variants.json"), "utf8"));

function imageMagick() {
  for (const tool of ["magick", "convert"]) {
    try {
      execFileSync(tool, ["-version"], { stdio: "ignore" });
      return tool;
    } catch {
      // Try the next name.
    }
  }
  throw new Error("ImageMagick is required (magick or convert).");
}

const tool = imageMagick();
for (const entry of manifest.masters) {
  const source = join(root, entry.file);
  const base = entry.file.slice(0, -4);
  for (const width of entry.variants) {
    const quality = width === 1600 || width === 390 || width === 620 ? 82 : 84;
    const output = join(root, `${base}-${width}.jpg`);
    execFileSync(
      tool,
      [
        source,
        "-resize",
        `${width}x`,
        "-strip",
        "-quality",
        String(quality),
        output,
      ],
      { stdio: "inherit" },
    );
    console.log(`  ${output}`);
  }
}
