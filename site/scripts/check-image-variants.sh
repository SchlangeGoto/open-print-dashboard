#!/usr/bin/env bash
# Verify that every srcset candidate used by the site exists and has the
# width its descriptor promises. Run the generator after replacing a master.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
cd public/screenshots

if command -v magick >/dev/null 2>&1; then
  IDENTIFY=(magick identify)
elif command -v identify >/dev/null 2>&1; then
  IDENTIFY=(identify)
else
  echo "ImageMagick is required (magick identify or identify)." >&2
  exit 1
fi

failed=0

check() {
  local file=$1 expected=$2
  if [[ ! -f "$file" ]]; then
    echo "missing variant: $file" >&2
    failed=1
    return
  fi
  local width
  width=$("${IDENTIFY[@]}" -format '%w' "$file")
  if [[ "$width" != "$expected" ]]; then
    echo "$file is ${width}px wide, expected ${expected}px" >&2
    failed=1
  fi
}

for name in overview printers print-jobs filaments spools analytics; do
  check "${name}-1600.jpg" 1600
  check "${name}-2400.jpg" 2400
done

for name in app-spools app-spool app-scan app-scan-crop; do
  check "${name}-390.jpg" 390
  check "${name}-585.jpg" 585
  check "${name}-780.jpg" 780
done

check printer-detail-620.jpg 620
check printer-detail-930.jpg 930

exit "$failed"
