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

The site is self-hosted. It ships as a container image (`site/Dockerfile`) and
runs without a bundled reverse proxy: the container publishes on
`127.0.0.1:8080`, and the proxy already running on the host terminates TLS and
forwards to it.

```bash
export IMAGE_PREFIX=ghcr.io/schlangegoto/open-print-dashboard
export SITE_IMAGE_TAG=0.2.0

docker compose -f compose.public.yml pull
docker compose -f compose.public.yml up -d
```

Copy both blocks from `../deploy/Caddyfile.public` into the host's proxy config.
The demo runs as the `demo` service in the same stack, on `127.0.0.1:3000`.

The full walkthrough — first install, updates, rollback, and automatic deploy on
a tag — is in
[`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md#public-site-and-demo).

The site image bakes `NEXT_PUBLIC_DEMO_URL` at build time (default
`https://demo.openprintdash.app`). If the demo hostname differs, build the image
with the matching `--build-arg NEXT_PUBLIC_DEMO_URL=...`.

For a local check:

```bash
npm run build
python3 -m http.server 3200 --directory out
```

`www.openprintdash.app` should 301 to `openprintdash.app` at the DNS/proxy
layer.

## Demo deployment

The demo is the app frontend built with `NEXT_PUBLIC_DEMO_MODE=true`, no backend
required. `Release Containers` publishes it as
`ghcr.io/schlangegoto/open-print-dashboard/demo`; `compose.public.yml` runs it as
the `demo` service on the same host at `127.0.0.1:3000`, behind the host's
proxy.

The demo runs on seeded data and stores edits in the browser only.

## Hosting beta

`/hosting/` is the managed-hosting beta page. It is deliberately not in the
main navigation: it is linked from the footer, the self-hosted section and the
install page, so self-hosters can ignore it until they need it.

The Beta plan is the only active plan. Standard and Team are placeholders and
the page says so; pricing is not published yet. The interest CTA is a `mailto:`
link (`HOSTING_BETA_MAILTO` in `lib/site.ts`). Update the plan copy, pricing and
contact when the hosted product is defined.

Hosting is framed as a convenience for people who cannot run a server, not the
business model or a feature gate. Self-hosting stays free.

## Support

The site links to GitHub Sponsors from the footer and the open-source section
(`SPONSOR_URL` in `lib/site.ts`). Enable GitHub Sponsors on the account or swap
the constant. Donations are described as support for the demo, domain and
maintenance, not a paywall.

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

The site serves pre-generated `-<width>.jpg` variants from
`public/screenshots` through `srcset`. After replacing a master, regenerate
them (requires ImageMagick):

```bash
npm run images:variants
```

`npm run images:check` verifies every expected variant exists at the width
its descriptor promises. CI runs the check.
