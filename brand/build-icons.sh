#!/usr/bin/env bash
# Regenerate every raster brand asset from the SVGs in this directory.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
brand="$root/brand"
site="$root/site/public"
frontend="$root/frontend/public/icons"
mobile="$root/mobile/assets/images"
readme="$root/docs/assets/readme"

for dir in "$site" "$frontend" "$mobile" "$readme"; do
  mkdir -p "$dir"
done

# Website icon and touch icon
cp "$brand/app-icon.svg" "$site/icon.svg"
rsvg-convert -w 180 -h 180 "$brand/app-icon.svg" -o "$site/apple-icon.png"

# Dashboard PWA icons
cp "$brand/app-icon.svg" "$frontend/icon.svg"
rsvg-convert -w 180 -h 180 "$brand/app-icon.svg" -o "$frontend/icon-180.png"
rsvg-convert -w 192 -h 192 "$brand/app-icon.svg" -o "$frontend/icon-192.png"
rsvg-convert -w 512 -h 512 "$brand/app-icon.svg" -o "$frontend/icon-512.png"
rsvg-convert -w 512 -h 512 "$brand/app-icon-maskable.svg" -o "$frontend/icon-maskable-512.png"

# Browser favicons
for size in 16 32 48; do
  rsvg-convert -w "$size" -h "$size" "$brand/app-icon.svg" -o "/tmp/opd-favicon-$size.png"
done
magick "/tmp/opd-favicon-16.png" "/tmp/opd-favicon-32.png" "/tmp/opd-favicon-48.png" "$site/favicon.ico"
magick "/tmp/opd-favicon-16.png" "/tmp/opd-favicon-32.png" "/tmp/opd-favicon-48.png" "$root/frontend/app/favicon.ico"
rm -f /tmp/opd-favicon-{16,32,48}.png

# Native app icons
rsvg-convert -w 1024 -h 1024 "$brand/app-icon-mobile.svg" -o "$mobile/icon.png"
rsvg-convert -w 1024 -h 1024 "$brand/adaptive-icon.svg" -o "$mobile/adaptive-icon.png"
rsvg-convert -w 1024 -h 1024 "$brand/monochrome-icon.svg" -o "$mobile/android-icon-monochrome.png"
rsvg-convert -w 1024 -h 1024 "$brand/splash-icon.svg" -o "$mobile/splash-icon.png"
rsvg-convert -w 64 -h 64 "$brand/app-icon.svg" -o "$mobile/favicon.png"

# README header icon
rsvg-convert -w 192 -h 192 "$brand/app-icon.svg" -o "$readme/icon.png"

echo "Brand assets rebuilt from $brand"
