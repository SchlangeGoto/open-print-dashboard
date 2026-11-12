# Brand assets

The spool mark is the OpenPrintDash logo. `spool.svg` is the canonical
monochrome drawing and inherits `currentColor`; `app-icon*.svg` are the tile
variants used for favicons, PWA icons and the native app.

| File | Use |
| --- | --- |
| `spool.svg` | In-app marks (website nav, dashboard sidebar) |
| `app-icon.svg` | Website favicon, dashboard PWA icon, README icon |
| `app-icon-maskable.svg` | Android/PWA maskable icon (full-bleed) |
| `app-icon-mobile.svg` | iOS/Android app icon (full-bleed) |
| `adaptive-icon.svg` | Android adaptive foreground (transparent) |
| `monochrome-icon.svg` | Android themed icon (transparent, white) |
| `splash-icon.svg` | Expo splash mark (transparent) |

`build-icons.sh` regenerates every raster asset in `site/`, `frontend/`,
`mobile/` and `docs/assets/readme/` from these SVGs. It needs `rsvg-convert`
and ImageMagick (`magick`).

The website mark is emerald `#10b981`. The dashboard mark uses
`currentColor`, so it follows the selected accent at runtime. Static app icons
keep the emerald brand color.
