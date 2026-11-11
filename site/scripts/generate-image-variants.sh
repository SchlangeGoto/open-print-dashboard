#!/usr/bin/env bash
# Regenerate the pre-sized screenshots that the static site serves through
# <img srcset>. The unsuffixed files are the high-DPI masters; run this after
# replacing any of them so the -<width> variants never go stale.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
cd public/screenshots

if command -v magick >/dev/null 2>&1; then
  IM=(magick)
elif command -v convert >/dev/null 2>&1; then
  IM=(convert)
else
  echo "ImageMagick is required (magick or convert)." >&2
  exit 1
fi

resize() {
  local src=$1 width=$2 quality=$3
  local out="${src%.jpg}-${width}.jpg"
  "${IM[@]}" "$src" -resize "${width}x" -strip -quality "$quality" "$out"
  echo "  $out"
}

# Wide dashboard captures: 3200x2000 masters.
for name in overview printers print-jobs filaments spools analytics; do
  resize "${name}.jpg" 1600 82
  resize "${name}.jpg" 2400 84
done

# Phone screenshots: 1170x2532 masters.
for name in app-spools app-spool app-scan app-scan-crop; do
  resize "${name}.jpg" 390 82
  resize "${name}.jpg" 585 84
  resize "${name}.jpg" 780 84
done

# Printer detail: 1240x1000 master.
resize printer-detail.jpg 620 82
resize printer-detail.jpg 930 84
