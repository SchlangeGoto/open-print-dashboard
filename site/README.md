# openprintdash.app

The marketing site for OpenPrintDashboard. Separate from the self-hosted app so
the Docker image stays small and the site can deploy on its own.

## Development

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Build

```bash
npm run build
```

The static site is written to `out/`. Serve it locally with:

```bash
python3 -m http.server 3200 --directory out
```

## Deploy

Cloudflare Pages or any static host:

- Build command: `npm run build`
- Output directory: `out`
- Environment: `NEXT_PUBLIC_DEMO_URL=https://demo.openprintdash.app`

`www.openprintdash.app` should 301 to `openprintdash.app`.

## Demo deployment

The site links to `demo.openprintdash.app`. That deployment is the app frontend
built with `NEXT_PUBLIC_DEMO_MODE=true`, no backend required:

```bash
cd frontend
NEXT_PUBLIC_DEMO_MODE=true npm run build
npm run start -- --port 3100
```

The demo runs on seeded data and stores edits in the browser only.

## Design

Hallmark custom run. The site uses the dashboard's own tokens: Geist, near-black
surfaces, 10px cards, one emerald accent, and one deep-emerald filament shelf.
The header is a wordmark, four links and a demo action. The footer is a
four-column link mast. There are no eyebrow labels, no fake browser chrome, no
mono meta rows and no glued arrows.

The hero is a 3D stage: the full dashboard capture in front, spools and analytics
screens behind it. Scroll flattens the tilt; a fine pointer adds a small lean.
Sections reveal on scroll, and the native app is shown as a fan of three real
phone captures in the spool section. The six-job section is a scroll-driven
sticky tour: the tab bar and full-width preview stay pinned while scrolling
advances through the six features, at roughly two-thirds of a viewport each; clicking a
tab jumps to one. Once you scroll past it, it collapses to a compact tabbed
viewer so it does not re-trap you on the way back up. The native scanner is last.
Large captures tilt toward a fine pointer, rotating the whole card so the
screenshot is never cropped. The side phones move outward on hover instead of
jumping into the foreground. The page is server-rendered; the tour and motion
are enhancements. The 3D is CSS perspective on real captures, not WebGL or a
fake device render.

The custom stamp and the token block live at the top of `app/globals.css`.

## Screenshots

`public/screenshots/` contains 2× web captures at 3200×2000 (printer card
1240×1000) plus three 3× phone captures (1170×2532) from the Expo app.
`overview.jpg` and `analytics.jpg` come from the `feat/dashboard-polish` branch
with the emerald accent set manually and a temporary Scan Filament sidebar entry;
the other web captures come from the production demo build. Re-shoot only if the
UI changes:

- overview.jpg — polished main dashboard (hero front)
- spools.jpg — hero back layer / spool library
- analytics.jpg — polished analytics page (hero back layer / section)
- printer-detail.jpg — close crop of the X1 Carbon card
- print-jobs.jpg — demo band
- printers.jpg
- filaments.jpg
- app-spools.jpg — phone inventory
- app-spool.jpg — phone spool detail
- app-scan.jpg — phone barcode scanner
- app-scan-crop.jpg — 16:10 scanner crop for the feature showcase

The scanning band shows the finished native app as a three-phone deck: inventory,
spool detail and barcode scanning. The deck fans out on desktop and becomes a
horizontal snap strip on mobile. The phone captures use the same demo data as the
web screenshots.

The screenshots are demo data. Keep the `Demo data` captions.
