# Website research: openprintdash.app

**Status:** research complete · **Date:** 8 November 2026 · **Scope:** competitor and reference websites for the OpenPrintDashboard marketing site.

**Method:** live review of 29 sites at 1440×900 (plus mobile spot checks at 390×844), extraction of hero copy, navigation, section order and CTAs, and a manual design critique. GitHub star counts and license data were pulled from the GitHub API on the same day. Screenshots in [`screenshots/`](./screenshots) are third-party sites kept as internal design reference only — do not publish them.

**Contents:** [Executive summary](#1-executive-summary) · [Product truth](#2-the-product-truth) · [The sample](#3-the-sample) · [Deep dives](#4-deep-dives) · [Pattern library](#5-pattern-library) · [What works / what doesn't](#6-what-works--what-doesnt) · [Recommendations](#7-recommendations-for-openprintdashapp) · [30/60/90 plan](#8-306090-day-plan) · [Open decisions](#9-open-decisions) · [Reference index](#10-reference-index)

---

## 1. Executive summary

1. **The category has a winning formula, and it is remarkably consistent:** dark or high-contrast hero, one-sentence value proposition, a real product screenshot, a live demo, an install path, a GitHub star count, and docs on a separate subdomain.
2. **Bambuddy is the direct benchmark, not a side reference.** It is AGPL-3.0, has ~3.3k stars, launched in November 2025, targets the same Bambu Lab audience, and already has a mature site with a demo, comparison page, press coverage, user reviews, hardware (`SpoolBuddy`), an appliance store, and a business tier. It is the site to study hardest — and the product not to fight head-on.
3. **The open gap is focus.** Bambuddy positions around the *whole print farm*. OctoPrint is generic and dated. Spoolman only manages filament. Nobody owns the **single-printer / small-setup, design-led, filament-and-cost** position. That is OpenPrintDashboard's natural territory.
4. **The strongest visual references are Immich, Karakeep, Linkwarden, Actual Budget, Frigate and Bambuddy.** The strongest structural references are Bambuddy, Karakeep and Printago. The best cautionary tales are OctoPrint, PhotoPrism, Manyfold and 3DPrinterOS.
5. **A live demo is table stakes.** Bambuddy, Immich, Karakeep, Linkwarden, Actual, Frigate, Home Assistant and Manyfold all offer one. OpenPrintDashboard already has a demo mode with seeded data; it is currently gated to `next dev`, so a small production-demo flag is needed before deploying `demo.openprintdash.app`. That deployment is the cheapest high-impact conversion asset available.
6. **The old “No cloud required” promise is being retired.** Cloud stays, and MQTT may go. The site should sell the self-hosted app and data ownership, and be explicit about what is cloud-backed — not fight a protocol war. A paid hosted tier is planned for people who cannot self-host; a quiet `/hosting/` beta interest page is live, but pricing waits.
7. **The brand is now pinned to emerald.** The app default, the site accent and the reticle icon are `oklch(0.596 0.145 163.225)`, with the icon and PWA assets regenerated. Blue remains available in the dashboard accent selector. The site uses one deep-emerald filament shelf as its signature; the rest stays near-black and neutral. The native app is shown as a companion in a phone deck, but its visual language still does not drive the site.
8. **The old PWA screenshots are gone.** Fresh 2× desktop captures come from the production demo build, and the polished dashboard and analytics captures come from `feat/dashboard-polish` (emerald set manually, temporary Scan Filament sidebar entry). Three phone captures come from the finished native app. The scanning section now shows the app itself — inventory, spool detail and barcode scanning — instead of describing an unfinished UI.
9. **The best sites sell one concrete outcome, not a feature list.** “Run the whole farm from your own hardware”, “Self-hosted photo and video management solution”, “The Bookmark Everything App”, “Know what is on the shelf, to the gram.” The feature list comes after the promise.
10. **Install pages beat install snippets in the hero.** Mature OSS sites keep the homepage clean, put a single “Install” CTA in the nav, and give the exact commands on a dedicated page. Karakeep is the exception with a one-line command in its self-host section.
11. **Pricing is a SaaS signal, and a hosted tier is coming later.** OSS-first projects use Sponsor/Donate/Buy a key/Cloud, not a pricing table. At v0.1, a pricing page would confuse the audience. A quiet `/hosting/` beta interest page is live; pricing and `/cloud` wait until the hosted version is real.
12. **A privacy-respecting site is itself a trust signal.** Most competitors show a cookie banner; Plausible and Bambuddy do better. With cookieless analytics (or none), OpenPrintDashboard can honestly say “no cookies, no trackers” — and mean it.

---

## 2. The product truth

### 2.1 What OpenPrintDashboard is

A self-hosted dashboard for Bambu Lab 3D printers. It connects to Bambu Lab printers (today via LAN/MQTT and Bambu Cloud; the connection layer may change), stores data in PostgreSQL, and ships as a Docker Compose stack (Next.js frontend, FastAPI backend, PostgreSQL, Mailpit for local email). License: AGPL-3.0.

The app has six core surfaces:

| Surface | What it does |
|---|---|
| **Printers** | Live status: nozzle/bed temperature, progress, layers, time remaining, fan, speed, online/offline, reconnect |
| **Print Jobs** | History with title, duration, weight, status (finished/canceled/running), cover images, success rate |
| **Filaments** | Catalogue by brand, material, color, temps, AMS index, stock, average price/kg |
| **Spools** | Individual spools with remaining weight, active/inactive, price/kg, NFC tag, auto-deduction after prints |
| **Scan Filament** | Barcode scan page and catalog match; the native iOS/Android app is the primary scanner |
| **Analytics** | Usage, cost, success rate, material breakdown, per-printer scoping |

### 2.2 Who it is for

- Bambu Lab owners with one printer, or a small number of printers, who want more than Bambu Handy but do not need a print farm.
- Makers who care about filament stock and the real material cost of each print, not just live temperatures.
- Self-hosted / homelab users who already run Docker, Home Assistant, Immich, Paperless or similar.
- People who want their data on their own hardware, even when Bambu Cloud is part of the printer connection.

### 2.3 Current state audit

| Item | State | Consequence for the site |
|---|---|---|
| GitHub repo | Public, 2 stars, no releases, AGPL-3.0 | Launch-stage proof, not “trusted by thousands” |
| Domain | `openprintdash.app` did not resolve from the review environment (DNS check failed) | Verify registration/DNS, then set up TLS, redirects and email |
| Marketing site | **Built** in `site/` (Next.js static export, Hallmark custom) | Deploy to `openprintdash.app` |
| Demo | **Production flag implemented** (`NEXT_PUBLIC_DEMO_MODE=true`); runs without a backend | Deploy at `demo.openprintdash.app` |
| Docs | `README.md`, `docs/SETUP.md`, `docs/API.md` | Link for v1; docs subdomain later |
| Screenshots | **Fresh 2× desktop captures** at 3200×2000; `overview`/`analytics` from `feat/dashboard-polish`, the rest from the production demo build; printer card at 1240×1000; three 3× phone captures (1170×2532) from the Expo app; mobile PWA shots removed | Re-shoot only if the UI changes |
| Logo | Reticle icon, now emerald on near-black; no wordmark | Site uses the emerald reticle lockup; a real wordmark is still a P1 |
| Accent | **Emerald** `oklch(0.596 0.145 163.225)` in the app default, icon and site | Blue stays available in the dashboard selector; the site uses emerald only |
| Claim | README: “No cloud required” was removed; tagline is now “On your own hardware” | Keep the “what runs where” copy |
| Name | OpenPrintDashboard / Open Print Dashboard / Open Print / OpenPrintDash | **Site uses OpenPrintDash**, full name in footer/metadata |
| Analytics/telemetry | None found in the codebase | “No telemetry” is a defensible claim |

### 2.4 Product decisions that shape the copy (locked 8 Nov 2026)

These decisions supersede the earlier “no cloud” recommendation:

1. **Bambu Cloud stays.** It is part of the product and the onboarding. The site must not promise “no cloud” or treat cloud as a flaw. Sell the self-hosted app and local data ownership; be explicit about what is cloud-backed.
2. **MQTT may be removed.** The connection layer is not a durable marketing promise. Do not build the hero, trust row or “local-first” section around LAN/MQTT. Say “connects to Bambu Lab printers” and link to a compatibility page for the current connection modes.
3. **A paid hosted version is planned.** The launch site is self-hosted-first. A quiet `/hosting/` beta interest page exists; pricing, full plan details and `OpenPrintDash Cloud` wait until the beta is real.
4. **The design must fit the dashboard.** Same tokens, Geist, radii, card language and dark mode. The marketing site gets bigger type, more whitespace and real screenshots — not the dashboard’s controls.
5. **A separate `site/` app is approved.** Keep it out of the self-hosted frontend image.
6. **A production demo flag is approved and implemented.** `NEXT_PUBLIC_DEMO_MODE=true` now enables the in-browser demo in a production build, so the public demo can run without a backend.
7. **The accent is emerald.** The default dashboard accent, the site accent and the reticle icon use `oklch(0.596 0.145 163.225)`. The site uses one full-bleed deep-emerald filament shelf as its signature; the rest stays near-black and neutral.
8. **Scanning is a native app feature.** The website shows the finished native iOS/Android companion app in a three-phone deck: inventory, spool detail and barcode scanning. It does not use the old PWA phone screenshots. The native UI is a product surface, not the site’s design direction.

**Copy consequence:** remove “No cloud required” from the README. The durable promise is **“your own hardware, your own data, cloud when it helps”** — not “cloud-free”. The site should have a short, honest “What runs where” section instead of an anti-cloud section.

### 2.6 Build status (8–9 Nov 2026)

- `site/` exists as a separate Next.js 16 static app, deployed independently of the Docker image.
- Pages: `/`, `/install/`, `/hosting/`, `/privacy/`, `404`, `sitemap.xml`, `robots.txt`.
- Hallmark custom run: dashboard tokens, Geist, emerald accent, one full-bleed deep-emerald filament shelf, no eyebrow labels, no fake browser chrome, no mono meta rows, no glued arrows. `sloplint`: 0 FAIL, 0 WARN, 1 answered.
- Fresh 2× captures (3200×2000; printer card 1240×1000) are in `site/public/screenshots/`; `overview`/`analytics` come from `feat/dashboard-polish` with emerald set manually and a temporary Scan Filament sidebar entry, the rest from the production demo build. Three 3× phone captures (1170×2532) come from the Expo app; the old mobile PWA shots are removed.
- The hero is a 3D dashboard deck: the full dashboard in front, spools and analytics behind. Scroll flattens the tilt, a fine pointer adds a small lean, and sections reveal on scroll. Reduced motion and JS-off keep everything flat and visible.
- Large screenshot cards tilt toward a fine pointer; the whole card rotates, so the capture is not cropped.
- The six-job section is a scroll-driven sticky tour: the tab bar and full-width preview stay pinned while scrolling advances through the six features at roughly two thirds of a viewport each; clicking a tab scrolls to it. Once passed, it collapses to a compact tabbed viewer so it does not re-trap you on the way back up. The native scanner is last.
- `/hosting/` is a quiet managed-hosting beta page: three plan slots, the Beta plan active, Standard and Team marked as placeholders, and a mailto interest CTA. It is linked from the footer, the self-hosted section and the install aside, not the main navigation.
- The scanning band shows the native app as a fan of three phone captures — inventory, spool detail and barcode scanning — with the same demo data as the web screenshots. The deck becomes a horizontal snap strip on mobile.
- The production demo flag is implemented in `frontend/lib/demo.ts`; `development.md` and `frontend/.env.example` document it.
- The README claim is now “On your own hardware.”
- The site is not deployed yet; `demo.openprintdash.app` and `openprintdash.app` DNS/TLS are the next P0.

### 2.5 Positioning white space

```
                        FLEET / PRODUCTION
                               ▲
  3DPrinterOS · SimplyPrint     │      Bambuddy
  Printago (cloud, farm)        │      (self-hosted farm)
                               │
   CLOUD ◄─────────────────────┼─────────────────────► SELF-HOSTED
                               │
  Obico Cloud · OctoEverywhere  │      OctoPrint
  Bambu Handy                   │      Mainsail / Fluidd
                               │      Spoolman / FilaMan
                               │      ★ OpenPrintDashboard
                               ▼
                        SINGLE PRINTER / MAKER
```

The empty quadrant is **self-hosted + single printer/small setup + design-led + filament/cost-aware**. Bambuddy is moving up and right (farm, appliance, business). OctoPrint is broad and old. Spoolman is filament-only. OpenPrintDashboard should plant its flag there and say so.

**Positioning statement:**

> For Bambu Lab owners who want to understand their printer and their filament, OpenPrintDashboard is a self-hosted dashboard that shows live status, spool stock and the real material cost of every print in one calm interface — on hardware you own. Unlike farm tools, it is designed around the printer and the material going through it, not around the farm.

**Competitive focus map:**

| Product | Core focus | What it is not |
|---|---|---|
| **OpenPrintDashboard** | Printer visibility (one or a few) + filament/spool inventory + material cost per print | A farm manager, a slicer, a cloud service |
| **Bambuddy** | Farm command center: archive, queue, automation, hardware, business | A minimalist single-printer dashboard |
| **OctoPrint** | Generic printer control + a plugin ecosystem | Bambu-native, design-led, inventory-first |
| **Spoolman** | Filament/spool inventory and integrations | A printer dashboard |
| **FilaMan** | Filament inventory + FilamentDB + ESP32 scale | A live printer dashboard |
| **SimplyPrint / Printago** | Cloud fleet management, queueing, commerce | Self-hosted, local-first |
| **Obico / OctoEverywhere** | Remote access + AI failure detection | Inventory, cost tracking, local dashboards |

---

## 3. The sample

### 3.1 What was reviewed

- **Direct 3D printing:** Bambuddy, OctoPrint, Obico, SimplyPrint, Printago, OctoEverywhere, 3DPrinterOS, Spoolman, FilaMan, Manyfold, Mainsail, Fluidd, Klipper, 3DPrintForge.
- **Self-hosted OSS leaders:** Immich, Home Assistant, Actual Budget, Frigate, Jellyfin, Karakeep, Linkwarden, Umami, Plausible, PhotoPrism, Homarr, Mealie, Paperless-ngx.
- **Craft/brand references:** n8n, Bambu Lab.

### 3.2 Landscape table — direct 3D printing

| Site | What it is | Model | Traction | Why it matters |
|---|---|---|---|---|
| [bambuddy.cool](https://bambuddy.cool/) | Self-hosted Bambu command center / farm manager | AGPL + appliance + hardware + business | ~3.3k★ | The benchmark: demo, press, reviews, compare, hardware, commerce |
| [octoprint.org](https://octoprint.org/) | The original web interface for 3D printers | AGPL + donations | ~9.2k★ | Huge legacy, dated site; cautionary tale |
| [obico.io](https://obico.io/) | AI failure detection + remote access | Open source + cloud | — | Clear cloud vs self-host choice; pain-led headline |
| [simplyprint.io](https://www.simplyprint.io/) | Cloud fleet management and slicing | SaaS | — | Trust stats, language switcher, feature tabs |
| [printago.io](https://printago.io/) | Print farm software | SaaS | — | Best feature-page and customer-story structure |
| [octoeverywhere.com](https://octoeverywhere.com/) | Remote access + AI detection | Free + supporter tiers | — | “Free. Unlimited. Secure.” + scale stats |
| [3dprinteros.com](https://www.3dprinteros.com/) | Enterprise 3D printer OS | Enterprise SaaS | — | What enterprise clutter looks like |
| [spoolman](https://github.com/Donkie/Spoolman/wiki) | Filament/spool inventory | MIT, docs/wiki only | ~3k★ | Proves a focused tool can win without a marketing site |
| [filaman.app](https://www.filaman.app/) | Filament management + FilamentDB + ESP32 scale | MIT + hardware | ~95★ (new org) | Direct spool competitor; community database angle |
| [manyfold.app](https://manyfold.app/) | 3D model library | AGPL, docs-only | ~1.9k★ | Public demo server, but docs theme as front door |
| [mainsail.xyz](https://www.mainsail.xyz/) | Klipper web interface | GPL, docs-only | ~2.2k★ | Screenshot gallery + install docs |
| [fluidd.xyz](https://fluidd.xyz/) | Klipper web interface | GPL, docs-only | ~1.8k★ | Lightweight, docs-first |
| [klipper3d.org](https://www.klipper3d.org/) | 3D printer firmware | GPL, docs-only | ~12k★ | Pure documentation |

### 3.3 Landscape table — self-hosted OSS leaders

| Site | What it is | Model | Traction | Why it matters |
|---|---|---|---|---|
| [immich.app](https://immich.app/) | Self-hosted photo/video management | AGPL + product key + merch | ~118.6k★ | The gold standard for a focused OSS product site |
| [home-assistant.io](https://www.home-assistant.io/) | Home automation platform | Apache-2.0 + hardware + foundation | ~92k★ | Community momentum, release notes, integrations |
| [actualbudget.org](https://actualbudget.org/) | Local-first budgeting | MIT + hosted setup | ~30k★ | Local-first messaging; hosted + manual paths |
| [frigate.video](https://frigate.video/) | Local AI NVR | MIT + Frigate+ models | ~37.3k★ | One killer screenshot + paid add-on |
| [jellyfin.org](https://jellyfin.org/) | Free media system | GPL-2.0 | ~59.1k★ | Honest “we don’t run servers” note; demo |
| [karakeep.app](https://karakeep.app/) | AI bookmark manager | AGPL + cloud | ~30.4k★ | Best modern OSS hero formula |
| [linkwarden.app](https://linkwarden.app/) | Bookmark preservation | AGPL + cloud | ~20.3k★ | Premium dark SaaS look; tabbed screenshots |
| [umami.is](https://umami.is/) | Web/product analytics | MIT + cloud | ~40k★ | Star count in nav; feature narrative |
| [plausible.io](https://plausible.io/) | Privacy analytics | AGPL + SaaS | ~29.8k★ | “Alternative to X” positioning |
| [photoprism.app](https://www.photoprism.app/) | AI photo management | Open source + pro | ~40.4k★ | Strong product, dated website |
| [homarr.dev](https://homarr.dev/) | Server dashboard | Apache-2.0, docs+marketing | ~5.3k★ | Dashboard product shows its dashboard instantly |
| [mealie.io](https://mealie.io/) | Recipe manager | AGPL, docs-only | ~13.8k★ | Docs-as-homepage done well |
| [paperless-ngx](https://docs.paperless-ngx.com/) | Document management | GPL, docs-first | ~47.9k★ | Cloudflare challenge at review time; no separate marketing site found |

### 3.4 Landscape table — commercial / brand references

| Site | What it is | Model | Why it matters |
|---|---|---|---|
| [n8n.io](https://n8n.io/) | Workflow automation | Commercial source-available | Interactive hero, dot grid, strong type; no screenshot |
| [bambulab.com](https://bambulab.com/) | 3D printer hardware | E-commerce | Full-bleed product photography, 3–6 word copy |
| [octoeverywhere.com](https://octoeverywhere.com/) | 3D printing cloud | Free + tiers | Scale stats, platform compatibility, pricing |
| [simplyprint.io](https://www.simplyprint.io/) | 3D printing SaaS | SaaS | Trustpilot, 125k users, 17 languages |
| [printago.io](https://printago.io/) | Print farm SaaS | SaaS | Customer stories with hard numbers |
| [3dprinteros.com](https://www.3dprinteros.com/) | Enterprise 3D printing OS | Enterprise | Industries, logos, demo-first sales |

### 3.5 The five site archetypes

| Archetype | Examples | Best for | Risk |
|---|---|---|---|
| **A. Product landing page** | Bambuddy, Immich, Karakeep, Linkwarden, Actual, Frigate, Umami | A product with a clear “why” and a demo | Needs real screenshots and a promise |
| **B. Docs-as-homepage** | Spoolman, Mainsail, Fluidd, Klipper, Mealie, Manyfold | Developer tools with existing demand | No emotional hook; weak for newcomers |
| **C. Community portal** | Home Assistant, Jellyfin, OctoPrint | Projects with an existing community | Overwhelming; release notes before product |
| **D. Enterprise SaaS** | 3DPrinterOS, SimplyPrint, Printago | Sales-led products | Heavy nav, stock imagery, demo gates |
| **E. Hybrid OSS + cloud/commerce** | Bambuddy, Obico, Karakeep, Linkwarden, Umami, Frigate, Plausible | Sustainable OSS | Two products, two messages; needs discipline |

**OpenPrintDashboard should launch as A, then evolve to E.** Do not start as B (nobody knows the product yet), C (no community yet), or D (no sales team).

---

## 4. Deep dives

### 4.1 Bambuddy — the benchmark

![Bambuddy hero](./screenshots/bambuddy-hero.jpeg)

**URL:** https://bambuddy.cool/ · **License:** AGPL-3.0 · **Stars:** ~3.3k · **Created:** Nov 2025

**Hero:** eyebrow `SELF-HOSTED · BAMBU LAB` → H1 “Run the whole farm from your own hardware.” → one-sentence subhead → “Open the live demo” (orange) + “Install it yourself” (outline) → mono trust row `DOCKER · PI 5 · NAS · MINI-PC · SQLITE OR POSTGRESQL · NO ACCOUNT REQUIRED` → dashboard screenshot below the fold.

**Design:** near-black olive (#0F1110), orange accent, Archivo display + Inter body + JetBrains Mono labels. Huge section headings (~64 px), real screenshots at full width, alternating text/screenshot layouts. Status colors (green/amber/red) inside the product screenshots carry the visual energy.

**Structure (7 content sections + evidence):**
1. Hero
2. “The Loop” — archive → queue → measure, three steps
3. “Local by construction” — MQTT/FTPS, no vendor relay, no telemetry
4. “Know what is on the shelf, to the gram” — spool inventory
5. SpoolBuddy — RFID hardware for any brand
6. “Every current Bambu Lab machine” — X1/P1/P2/A1/H2
7. “Built for farms that actually run” — teams, classrooms, billing
8. Demo CTA — “Try it against the demo before you install anything.”
9. Press coverage / user reviews / corporate sponsors
10. Footer: Product / Evidence / Community / Business / Legal

**Navigation:** Features, Compare, Install, Docs, More (SpoolBuddy, Forum, Discord, Press, Reviews, Sponsor), Appliance, Business, GitHub, Live demo. 13 destinations, progressively disclosed.

**What works:**

- The promise is unambiguous and owned: self-hosted, no cloud, your hardware.
- Demo before install removes all risk. The copy is excellent: “The live demo runs the real application against simulated printers. Nothing to sign up for, nothing to uninstall afterwards.”
- Mono spec rows (`DOCKER · PI 5 · NAS`) answer the technical buyer’s first questions without a paragraph.
- Evidence is layered correctly: press → reviews → sponsors → business. It never precedes the product.
- Commerce (appliance, SpoolBuddy, business) is present but does not hijack the OSS story.
- Real UI screenshots, with realistic data, do all the persuading.
- Footer is a complete second navigation, not a link dump.

**What doesn’t:**

- The site is dense and relentlessly dark. Long stretches of low-contrast gray body text on near-black are tiring.
- “Farm” is the first word and the dominant frame. A single-printer owner may conclude it is not for them.
- 13 nav destinations is a lot; the “More” menu hides important evidence (press, reviews).
- Anchor scrolling puts section headings under the sticky header (visible in the material section capture).
- The page assumes the reader already knows what a “virtual printer”, “3MF archive” or “AMS” is.
- No pricing clarity for the appliance/business routes on the homepage; they are separate funnels.

**Secondary pages worth studying:**

- **Install** (`/installation.html`): H1 “One command. That's your part.” → one-line installer (`curl … | bash` style) → tabs for Docker / native Linux-macOS / Windows installer → system requirements → “Enable Developer Mode” guide → troubleshooting → video walkthrough → business CTA. This is the best install page in the sample: it reduces fear, gives one copy-paste action, and covers every platform.
- **Compare** (`/comparison.html`): “How Bambuddy compares.” Feature matrix against Bambu Handy, Bambu Farm Manager, SimplyPrint, Printago, Watchtower 3D and OctoPrint. It explicitly says “Where a rival does something better, the table says so.” That honesty is a trust device.
- **SpoolBuddy** (`/spoolbuddy.html`): a dedicated hardware product page with its own story, not a feature bullet.
- **Evidence pages:** `/press.html`, `/reviews.html`, `/sponsors.html`, `/business.html`, plus the appliance store at `get.bambuddy.cool`.

**Takeaway:** Copy the demo-first conversion, the mono trust row, the 3-step loop, the evidence footer and the “real app, simulated printers” honesty. Copy the install page's “one command” framing and the compare page's willingness to admit where rivals win. Do not copy the all-dark density or the farm-first framing.

---

### 4.2 Immich — the gold standard

![Immich hero](./screenshots/immich-hero.jpeg)

**URL:** https://immich.app/ · **License:** AGPL-3.0 · **Stars:** ~118.6k

**Hero:** centered logo + “Powered by FUTO” → H1 “Self-hosted photo and video management solution” with “photo and video” in indigo → one-paragraph subhead → “Download” (indigo) + “Open Demo” (black) → “Join our Discord” → a very large app screenshot with a soft gradient glow behind it.

**Structure:** hero → feature blocks (Mobile App, Sharing, Facial Recognition) → Support Immich (product key + merch) → Contribute → footer.

**What works:**

- The category is stated in the first line. No cleverness, no ambiguity.
- The screenshot is the hero. It is real, large, and immediately explains the product.
- Two CTAs cover both intents: “Download” for owners, “Open Demo” for evaluators.
- The accent is used on exactly two words and the primary button; everything else is black/white.
- Monetization is soft: “Buy Immich” in nav, “Support Immich” near the end. No pricing table.
- Docs are clearly separate (`docs.immich.app`), GitHub is in the nav, Discord is a first-class community link.
- Dark mode is fully supported and looks deliberate.

**What doesn’t:**

- The hero is tall; on mobile the headline runs to five lines and the screenshot is far below the fold.
- “Buy Immich” in the nav is the most prominent button on mobile — commerce before product.
- The feature section is fairly generic; the product screenshots do most of the work.
- The page is long and repeats the same rhythm; it could end sooner.

**Takeaway:** This is the closest template to what OpenPrintDashboard needs: one clear category, one huge real screenshot, two CTAs, soft support ask, separate docs. Steal the restraint.

---

### 4.3 Karakeep — the modern OSS formula

![Karakeep hero](./screenshots/karakeep-hero.jpeg)

**URL:** https://karakeep.app/ · **License:** AGPL-3.0 · **Stars:** ~30.4k

**Hero:** “★ 30k+ stars on GitHub” pill → H1 “The Bookmark **Everything** App” with a yellow highlighter behind “Everything” → one-paragraph subhead → a huge browser-framed app screenshot → platform icons (iOS, Android, Chrome, Firefox, Safari).

**Structure:** hero → use cases (bookmarking, search, AI) → “Works with your AI assistant” (MCP/CLI) → “Open Source & Self-Hostable” with `docker compose up -d` → final “Start bookmarking everything” (cloud signup + demo).

**What works:**

- The star count is social proof and a community signal in one small pill.
- The highlighter is a memorable, cheap brand device. It makes a generic phrase feel owned.
- The screenshot is the product; no abstract illustration.
- The dual path (cloud or self-host) is explicit and repeated at the end.
- The self-host section shows the actual command, not a vague “install” button.
- Copy is short, confident and a little funny (“Built for the data hoarders out there!”).

**What doesn’t:**

- Cloud signup is the dominant CTA; self-hosting is secondary despite the OSS identity.
- The page is long and the AI/MCP section dates quickly.
- The highlighter device only works once; using it on every section would be noise.
- The “30k+ stars” pill is powerful at 30k; at 2 stars it would backfire.

**Takeaway:** The best current example of an OSS product site with personality. Use a single distinctive visual device (ours: viewfinder corners), a real screenshot, a star pill only once the number is meaningful, and a self-host section with a real command.

---

### 4.4 Linkwarden — premium dark SaaS

![Linkwarden hero](./screenshots/linkwarden-hero.jpeg)

**URL:** https://linkwarden.app/ · **License:** AGPL-3.0 · **Stars:** ~20.3k

**Hero:** dark background → “🎉 Announcing Linkwarden for iOS & Android” pill → H1 “Bookmarks, **Evolved**” (purple) → short subhead → “Start Free Trial” (purple) + “Launch Demo” → tab row (Home / Reader View / Link Info / Preservation / Team) → app screenshot that changes with the tab.

**What works:**

- The tabbed screenshot shows product breadth without a long page. Each tab is a different surface.
- The dark/purple palette feels premium and matches the product.
- The star count sits quietly in the nav, next to Login — proof without shouting.
- The mobile apps are announced as a pill, then supported by an Apps page.
- The hero is compact; the product appears above the fold on desktop.

**What doesn’t:**

- The purple-on-black palette is low contrast in places; long reading is hard.
- “Start Free Trial” is the primary CTA for an AGPL project; self-hosters may feel like a secondary audience.
- Tabs hide content; a visitor who does not click sees only one surface.
- The page leans SaaS; pricing is prominent.

**Takeaway:** A tabbed product viewer is a strong pattern for showing six app surfaces without six sections. Use it if the screenshots are strong enough; keep the primary CTA aligned with the OSS audience (“Live demo” before “Cloud”).

---

### 4.5 Actual Budget — local-first clarity

![Actual Budget hero](./screenshots/actualbudget-hero.jpeg)

**URL:** https://actualbudget.org/ · **License:** MIT · **Stars:** ~30k

**Hero:** centered H1 “Your Finances — made simple” → two short paragraphs → “Set up on PikaPods in 2 minutes*” (violet) + “Set up manually” (outline) → app screenshot with a “Try the demo” overlay.

**Structure:** hero → “Be involved in your financial decisions” → “Meticulously designed for speed” → “Unabashedly local-first software” → “Powerful budgeting made simple” → fastest transactions → reports → feature list.

**What works:**

- “Local-first” is explained as a benefit, not a buzzword: works offline, syncs in the background, end-to-end encryption.
- Two setup paths: hosted (PikaPods) and manual (self-host). This respects both audiences.
- The demo is embedded in the screenshot — one click, no navigation.
- The copy is calm and specific; no exclamation marks.
- The page is built with Docusaurus and still feels like a product site, proving you do not need a heavy stack.

**What doesn’t:**

- The centered hero is generic; the screenshot starts below the fold.
- The PikaPods CTA is an affiliate/hosted path and visually dominates the self-host path.
- The product is more distinctive than the site; the site could show the envelope budgeting method earlier.
- The docs and marketing live on the same Docusaurus site, which blurs the boundary.

**Takeaway:** The best example of explaining local-first without overclaiming. Steal the “two setup paths” and the embedded demo overlay.

---

### 4.6 Frigate — one screenshot, one paid add-on

![Frigate hero](./screenshots/frigate-hero.jpeg)

**URL:** https://frigate.video/ · **License:** MIT · **Stars:** ~37.3k

**Hero:** split layout, dark band → H1 “Monitor your security cameras with locally processed AI” → two short paragraphs → “Learn about Frigate+” (white button) → a real camera-wall screenshot on the right.

**What works:**

- The screenshot proves the product in one glance: multiple cameras, detections, timestamps.
- The hero is split, not centered; it feels like a tool, not a landing page template.
- The copy is technical and specific: “real-time AI object detection”, “all processing is performed locally on your own hardware”.
- Frigate+ is a paid add-on (custom models) that does not gate the core — a clean OSS business model.
- Testimonials are used later, not in the hero.

**What doesn’t:**

- The paid add-on is the primary hero CTA; a first-time visitor may think the product is paid.
- The page is short on “how it works”; docs carry too much of the explanation.
- The screenshot is dense and small; on mobile it becomes unreadable.

**Takeaway:** If you have one killer screen, make it half the hero. A paid add-on can coexist with OSS if the core promise stays free.

---

### 4.7 Printago — the SaaS structure to borrow

![Printago hero](./screenshots/printago-hero.jpeg)

**URL:** https://printago.io/ · **Model:** SaaS

**Hero:** split → H1 “3D Print Farm Software for Production at Scale.” → long, specific subhead → “Start Free - No Credit Card Required!” → dark dashboard screenshot → blue gradient lower half → customer logo strip → stats (1.40M printer hours, 275K prints, 7.4K printers, 62.4K orders).

**Structure:** hero → “Designed to Give You Time Back” (3 value props) → customer stories with hard numbers → a feature section for every capability (20+ pages) → FAQ → final CTA.

**What works:**

- Every feature has its own page and URL. This is an SEO machine and a sales enablement library.
- Customer stories use numbers: “8+ hrs/day → 1 hr/day”, “+56% sales”. Specificity beats adjectives.
- The stats row is instant credibility for a commercial buyer.
- FAQ answers the real objections (mixed brands, free tier, what makes it different).
- The nav mega-menu is organized by job, not by internal org chart.

**What doesn’t:**

- The page is long and dense; it is built for a buyer with a budget, not a maker.
- The blue gradient is generic and weakens the dark product screenshot.
- 20+ feature pages create a maintenance burden and dilute focus.
- “Start Free” competes with “Talk to Sales” and “Self-Hosted”; the path is not obvious.

**Takeaway:** At v1, write one strong homepage, not 20 feature pages. But plan the feature-page architecture now: each of the six app surfaces can become a `/features/*` page later.

---

### 4.8 SimplyPrint — classic SaaS, with useful trust devices

![SimplyPrint hero](./screenshots/simplyprint-hero.jpeg)

**URL:** https://www.simplyprint.io/ · **Model:** SaaS

**Hero:** blue gradient → centered H1 “Run every 3D printer from one place” → specific subhead → “Start free” + “See it in action” → tab row (Monitor, Manage a fleet, Slice, Queue, Filament) → browser-framed screenshot → Trustpilot 4.7 → stats (150+ brands, 790+ models, 125k users, founded 2020).

**What works:**

- The stats answer the “is this real?” question immediately.
- The feature tabs let a visitor self-select: monitoring, fleet, slicing, queue, filament.
- The language switcher (17 languages) signals global ambition and serves the EU market.
- “Free · no credit card · works with your existing printers · no Raspberry Pi required” is a superb objection-handling microcopy row.
- Trustpilot is a third-party proof point, not a self-reported claim.

**What doesn’t:**

- The cookie banner covers the product screenshot at 1440×900 — a self-inflicted conversion wound.
- 103 images on one page; the page is heavy.
- The blue gradient + centered layout is indistinguishable from hundreds of SaaS sites.
- The tabs hide most of the product; only one surface is visible at a time.

**Takeaway:** Steal the objection-handling microcopy and the stats row. Avoid the cookie banner, the gradient, and the image weight.

---

### 4.9 Obico — clear pain, two paths

![Obico hero](./screenshots/obico-hero.jpeg)

**URL:** https://obico.io/ · **Model:** Open source + cloud

**Hero:** light lavender → H1 “Your 3D Printer is Dumb. Make it Smart!” → community-built open-source subhead → “Get Started With Obico Cloud” (navy pill) → “Learn about other ways to get started” → composite app/phone illustration with print status, failure detection and remaining time.

**What works:**

- The headline names a real pain in five words. It is memorable, even if slightly insulting.
- The cloud vs self-host decision is explicit, with a comparison page.
- The illustration shows the product in context (phone + webcam + status), not abstract shapes.
- Platform compatibility (OctoPrint, Klipper, Duet3D) is a whole section — critical for this audience.
- The app and hardware (“products that ship with Obico”) extend the ecosystem.

**What doesn’t:**

- The hero is busy: promo pill, two CTAs, illustration, and a second promo banner at the bottom.
- The logo is centered in the nav with links on both sides; it breaks scanning conventions.
- “Dumb” may alienate the exact people who love their printers.
- The self-host path is visually secondary despite being the OSS heart.

**Takeaway:** A pain-led headline works, but the page needs one path, not five. If you offer cloud + self-host, make the choice a clean two-card section, not a nav dropdown.

---

### 4.10 OctoEverywhere — free + scale + tiers

![OctoEverywhere hero](./screenshots/octoeverywhere-hero.jpeg)

**URL:** https://octoeverywhere.com/ · **Model:** Free + supporter tiers

**Hero:** dark purple gradient → “The 3D Printing Community's #1 Cloud Service” pill → H1 “Level Up Your 3D Printer” → feature list subhead → “Free. Unlimited. Secure.” → “Set Up Now In Under 30 Seconds” → “Works Effortlessly With Any 3D Printer” → platform logos → stats (200k members, 100m prints/year, 1m AI images/day, 300k notifications/day).

**What works:**

- “Free. Unlimited. Secure.” is a three-beat promise that answers the three biggest objections.
- The stats are absurdly strong and placed right below the CTA.
- Platform logos (OctoPrint, Klipper, Mainsail, Fluidd, Bambu Lab, Elegoo) do the compatibility work instantly.
- The supporter model is explained as “100% community funded”, not as a paywall.
- The setup time promise (“under 30 seconds”) reduces friction.

**What doesn’t:**

- No product screenshot above the fold; the page sells a feeling, not the UI.
- The purple gradient + glow is a generic “AI startup” look.
- So many claims that the reader may stop believing them.
- Pricing is complex (standard/elite, per-printer add-ons) and lives on a separate page.

**Takeaway:** Three-beat promises and scale stats are powerful. But a dashboard product must show the dashboard. Do not let the gradient do the work.

---

### 4.11 OctoPrint — the cautionary tale

![OctoPrint hero](./screenshots/octoprint-hero.jpeg)

**URL:** https://octoprint.org/ · **License:** AGPL-3.0 · **Stars:** ~9.2k

**Above the fold, in order:** donation banner (red border) → Ukraine banner → dark nav → green hero with mascot and “The snappy web interface for your 3D printer.” → three value props with icons → sponsor/ads → cookie bar.

**What works:**

- The mascot and green give the project a memorable identity.
- The copy is plain and confident: “The snappy web interface for your 3D printer.”
- The three value props (remote control, plugins, open source) are exactly what the audience cares about.
- The plugin ecosystem and docs are real moats.

**What doesn’t:**

- Four competing asks before and around the product: donation banner, Ukraine banner, cookie bar, Carbon ads.
- No product screenshot. The mascot is charming but does not show what the software does.
- The design is 2014-era: Arvo + Open Sans, flat green, centered text, small type.
- The donation ask is louder than the product; it makes the project feel needy.
- Mobile experience is an afterthought.

**Takeaway:** This is the clearest proof that a great product can be held back by its website. Product first, housekeeping last. A mascot is not a substitute for a screenshot.

---

### 4.12 PhotoPrism — strong product, dated front door

![PhotoPrism hero](./screenshots/photoprism-hero.jpeg)

**URL:** https://www.photoprism.app/ · **Stars:** ~40.4k

**Hero:** full-width purple slab → “Hello.” → one long sentence describing the product → six blue icons with feature blurbs → phone mockup below.

**What works:**

- The feature set is clear and specific (RAW, duplicates, maps, Live Photos, faces, classification).
- The demo and “Get Started” CTAs are present.
- The team/partner pages signal maturity.

**What doesn’t:**

- “Hello.” wastes the most valuable line on the page.
- The purple slab + icon grid feels like a 2016 template.
- No product screenshot above the fold; icons explain categories, not the experience.
- The brand is inconsistent (purple hero, blue icons, phone screenshot).
- The site does not reflect the quality of the product.

**Takeaway:** A beautiful product with a dated site creates a trust gap. The fix is not a new color; it is a real screenshot and a clear promise.

---

### 4.13 The docs-only cluster

**Spoolman** ([GitHub wiki](https://github.com/Donkie/Spoolman/wiki)) — ~3k stars, MIT. No marketing site. The README is the landing page: feature list, screenshots, install, integrations. It works because the product is focused and the audience is technical. It is also a missed opportunity: a single-page site with a demo would widen the funnel.

**Mainsail** ([mainsail.xyz](https://www.mainsail.xyz/)) — ~2.2k stars, GPL. VitePress docs with a screenshot gallery, key features, vendor partners, sponsors. Dark, functional, fast. The “Welcome” page is documentation, not a pitch.

**Fluidd** ([fluidd.xyz](https://fluidd.xyz/)) — ~1.8k stars, GPL. VitePress docs, light theme, mobile/desktop screenshots, GitHub star widget. Same pattern.

**Klipper** ([klipper3d.org](https://www.klipper3d.org/)) — ~12k stars, GPL. Pure MkDocs. No marketing, no screenshots, no demo. The community finds it through GitHub and word of mouth.

**Mealie** ([mealie.io](https://mealie.io/)) — ~13.8k stars, AGPL. Docs homepage with an app screenshot, install options, feature demos. Orange brand, version + star widget, “Looking for a hosted solution?” banner. Good docs, weak story.

**Manyfold** ([manyfold.app](https://manyfold.app/)) — ~1.9k stars, AGPL. “Just the Docs” theme with a neon hero image, a public demo server and a “Host your own” CTA. At 1440 px the page has a horizontal scrollbar — a layout bug on the front door.

**Lesson:** Docs-only is acceptable when the product is already known and the audience is developers. It is a bad fit for a new product that needs to explain *why*. OpenPrintDashboard should have docs, but the front door should be a product page.

---

### 4.14 Quick notes on the rest

**Home Assistant** ([home-assistant.io](https://www.home-assistant.io/)) — the community portal benchmark. Cyan hero, “Awaken your home”, Get started + live demos + 1600+ integrations, phone frame. Below the hero: release notes, blog, community, hardware store, foundation. It feels alive because it shows momentum. Weakness: a newcomer sees release notes before a clear product explanation.

**Jellyfin** ([jellyfin.org](https://jellyfin.org/)) — dark gradient hero, “The Free Software Media System”, See it in Action + Download Now, and the honest note “We do not run servers for users.” Clients, docs, forum, contributions. The hero lacks a product screenshot; the illustration feels dated.

**Umami** ([umami.is](https://umami.is/)) — clean centered SaaS, eyebrow “OPEN-SOURCE WEB AND PRODUCT ANALYTICS”, H1 “The complete picture of your website”, dashboard screenshot, 39K stars in nav, pricing. The feature narrative is organized by job (acquisition, behavior, conversion, retention). Generic but effective.

**Plausible** ([plausible.io](https://plausible.io/)) — the clearest “alternative to X” headline in the sample: “Easy to use and privacy-friendly Google Analytics alternative.” Live demo, dashboard screenshot, pricing, comparison pages. Use this formula for SEO landing pages, not for the main hero.

**Homarr** ([homarr.dev](https://homarr.dev/)) — bold red hero, “A simple, yet powerful dashboard for your server”, product mockup collage, Install / Try Demo / Launch. It shows the dashboard instantly and has a strong color identity. The mockup is stylized, not a real screenshot; the three CTAs are slightly ambiguous.

**n8n** ([n8n.io](https://n8n.io/)) — dot-grid hero, huge type, an interactive prompt box instead of a screenshot, “Top 50 GitHub project with 209.7k stars”, G2 rating, 250k community. Distinctive and confident, but it works because n8n is already a known brand. Do not copy the no-screenshot hero at v0.1.

**Bambu Lab** ([bambulab.com](https://bambulab.com/)) — full-bleed product photography, 3–6 word copy (“Tool Changer. Game Changer.”, “Big job. Light work.”), a single “Learn more”, green store CTA. The hardware is the hero. Lesson: if you have a product render, let it fill the frame; if you don’t, use the UI.

---

## 5. Pattern library

### 5.1 Navigation

**What the best sites do:**

- 5–7 top-level items. Extra links go into “More” or the footer.
- The primary CTA is a filled button on the right: “Live demo”, “Download”, “Get started”.
- GitHub is an icon + star count, not a text link buried in the footer.
- Docs is an external-style link (arrow icon) because it lives on a subdomain.
- The logo links home; the nav is sticky but compact (64–72 px).
- Mobile: logo left, primary CTA + hamburger right; the menu contains the same items, not a reduced set.

**Reference navs:**

| Site | Items | Primary CTA |
|---|---|---|
| Bambuddy | Features, Compare, Install, Docs, More, Appliance, Business | Live demo |
| Immich | Blog, Roadmap, Merch, Docs, GitHub | Buy Immich |
| Karakeep | Pricing, Docs, GitHub, Login | Get Started |
| Linkwarden | Features, Apps, Pricing, Blog, Docs, Star 20k+ | Get Started |
| Printago | Features, Solutions, Self-Hosted, Downloads, Add-Ons, Pricing, Resources | Start for Free |
| Home Assistant | Documentation, Our hardware, Integrations, Blog, Need help? | Get started |

**For OpenPrintDashboard:** Logo · Features · Install · Docs · Changelog · GitHub · **Live demo**. Five text items maximum. “Compare” can wait until there is a comparison page worth reading.

### 5.2 Hero formulas

Four formulas that keep appearing:

1. **Outcome + ownership** — “Run the whole farm from your own hardware.” (Bambuddy)
2. **Category statement** — “Self-hosted photo and video management solution.” (Immich)
3. **Named replacement** — “Easy to use and privacy-friendly Google Analytics alternative.” (Plausible)
4. **Product as character** — “The Bookmark Everything App.” (Karakeep)

Each is followed by a one-sentence subhead that adds the mechanism (how) and the proof (what you get). The best subheads are 15–30 words, not 60.

**Hero checklist:**

- Eyebrow: category + audience, in mono uppercase (`SELF-HOSTED · BAMBU LAB`).
- H1: 3–8 words, one idea, no feature list.
- Subhead: one sentence, 15–30 words, includes the mechanism.
- Two CTAs: primary = demo/download; secondary = install/docs.
- Micro-trust line: 3–5 short facts in body type, as a sentence (“Runs in Docker. Works with X1, P1 and A1. AGPL-3.0.”).
- Product visual within the first viewport on desktop.

### 5.3 The screenshot rule

Every strong site in the sample shows a real product screenshot in or immediately below the hero. The exceptions (n8n, Home Assistant, Bambu Lab) have either a brand strong enough to carry it or a physical product to photograph. OpenPrintDashboard has neither yet — so the screenshot is non-negotiable.

**What makes a screenshot work:**

- Real UI, real data, realistic numbers. No dummy “Lorem ipsum” or fake charts.
- One clear focal point per screen; crop out sidebars if they add noise.
- Consistent theme and accent across all shots.
- 16:10 or 16:9, at least 2× density, no browser dev tools, no toasts, no scrollbars.
- A frame that matches the site: browser window for desktop, phone for mobile, subtle border/shadow.
- A short caption that states the benefit, not the filename.

**What fails:**

- Stylized mockups that don’t match the real app (Homarr).
- Stock photos of screens (3DPrinterOS).
- Icon grids pretending to be product shots (PhotoPrism).
- Mobile screenshots used as desktop heroes (current OpenPrintDashboard assets).
- Screenshots with a dev overlay (the current `scan-create.png` / `scan-known.png`).

### 5.4 Section order

The strongest one-page structures follow this order:

1. Hero + product screenshot
2. Trust row / compatibility / stats
3. Three-step “how it works” or feature overview
4. 2–4 feature deep-dives with screenshots
5. Self-hosted / data ownership / cloud clarity
6. Install or download
7. Demo CTA
8. FAQ / objections
9. Community / open source / support
10. Footer

Bambuddy inserts evidence (press, reviews, sponsors) between 8 and 9. Immich inserts monetization (product key, merch) between 8 and 9. Karakeep inserts a final cloud/self-host CTA. The order is consistent; the differences are which proof and which business model.

### 5.5 Proof

| Proof type | Works when | Fails when | Examples |
|---|---|---|---|
| GitHub stars | Above ~1k, shown as a small pill | At 2 stars; it highlights obscurity | Karakeep 30k, Linkwarden 20k, Umami 39K |
| Press logos | Real, relevant, linked | Generic “as seen in” with no links | Bambuddy (XDA, How-To Geek, MakeUseOf, Fabbaloo) |
| User reviews | Named, specific, verifiable | Anonymous quotes with no product detail | Bambuddy reviews page |
| Scale stats | Specific and recent | Round numbers with no source | OctoEverywhere 200k members; Printago 1.4M hours |
| Trustpilot/G2 | Third-party, linked | Self-reported rating graphics | SimplyPrint 4.7 Trustpilot |
| Sponsors | Real companies, with permission | Logo soup of companies that gave $0 | Bambuddy corporate sponsors |
| Release cadence | Visible changelog/version | “Coming soon” with no dates | Home Assistant release notes |
| License | Clear, linked, plain-language | Hidden in the footer only | AGPL badge + explanation |

**At 2 stars:** do not show a star count. Use “v0.1 · early access”, a live demo, a public roadmap, a changelog, and a “built in the open” section. Ask for feedback, not for trust.

### 5.6 Demo and install

**Demo patterns:**

- Dedicated subdomain: `demo.bambuddy.cool`, `try.manyfold.app`, `demo.immich.app`.
- No signup; simulated or seeded data; a clear “this is a demo” banner.
- Time-limited (Bambuddy 30 minutes) or reset-on-reload (static demo mode).
- Linked from the hero and from a dedicated section near the end.
- Copy that reduces risk: “Nothing to sign up for, nothing to uninstall afterwards.”

**Install patterns:**

- Homepage CTA → dedicated install page; not a 20-line command in the hero.
- Prerequisites first: Docker, Compose, a Bambu Lab account, and the printer's IP/access code (current setup).
- Copy-paste block with a copy button; one command per step.
- A “what you need” checklist and a “finding your printer credentials” table.
- A troubleshooting section and a link to docs/Discord.
- A “manual / development” path for non-Docker users.
- **A one-line installer** (Bambuddy's strongest install pattern): `curl -fsSL …/install.sh | bash` that checks Docker, downloads the compose file, generates `SECRET_KEY`, starts the stack and prints the URL. OpenPrintDashboard currently needs clone + `cp .env.example .env` + edit `SECRET_KEY` + compose. A small `install.sh` would let the site say “one command” honestly — and remove the most common setup failure.

**For OpenPrintDashboard:** the production demo flag is now implemented (`NEXT_PUBLIC_DEMO_MODE=true`), so the existing seeded demo can be deployed at `demo.openprintdash.app` without a backend. Add a small “Demo data — resets on reload” banner. This is the single highest-ROI website asset.

### 5.7 Pricing and sustainability

| Model | Examples | Signal | Fit for OPD |
|---|---|---|---|
| Donations | OctoPrint, Spoolman | Community-funded; can feel needy | Good at launch |
| Sponsors | Bambuddy, Mainsail, Fluidd | Business backing; credible | Later |
| Product key / merch | Immich | Soft monetization; doesn’t gate core | Good later |
| Hosted tier | Karakeep, Linkwarden, Umami, Plausible, Obico | SaaS; clear value | **Planned — phase 2** |
| Paid add-on / models | Frigate+ | Add-on, core stays free | Possible later |
| Appliance / hardware | Bambuddy, FilaMan | Premium, tangible | Possible later |
| Business tier | Bambuddy | Support, permissions, billing | Not yet |

**Recommendation:** no pricing page yet. A quiet `/hosting/` beta interest page is live; GitHub Sponsors is linked from the footer and open-source section. Hosting is a convenience for people who cannot self-host, not the business model. When the hosted tier is real, add `/cloud` with pricing. The self-hosted edition stays free and AGPL.

### 5.8 Footer

The best footers are a second navigation and a trust statement:

- **Product:** Features, Install, Docs, Changelog, Roadmap, Demo.
- **Community:** GitHub, Issues, Discussions/Discord, Contributing, Sponsors.
- **Legal:** License (AGPL-3.0), Privacy, Imprint, “Not affiliated with Bambu Lab.”
- **Status:** build status, version, “no cookies/no trackers” note.
- **Contact:** a real email address, not a form.

Bambuddy’s footer adds Evidence (press, reviews, releases) and Business. That is the right model once those pages exist.

### 5.9 Visual devices worth stealing

- **Mono eyebrow labels** with wide tracking (`SELF-HOSTED · BAMBU LAB`).
- **One accent color** reserved for CTAs, key numbers and status dots.
- **Oversized display type** with tight leading and negative tracking.
- **A single distinctive motif** repeated across the page (Karakeep’s highlighter, Bambuddy’s brackets/mono labels). For OpenPrintDashboard: viewfinder corners from the icon + a fine technical grid.
- **Browser/phone frames** with a 1px border and soft shadow.
- **Alternating light/dark section rhythm** to keep a long page readable (Karakeep, Frigate).
- **Data callouts** in mono: “47%”, “83 min”, “128 g”, “$2.14”.
- **Tabbed product viewer** for showing multiple screens without a long page (Linkwarden).
- **Stats row** with 4 numbers and short labels (Printago, SimplyPrint).
- **Star pill** in the nav, only when the number is meaningful (Karakeep, Linkwarden, Umami).
- **No-cookie note** in the footer as a trust signal.

### 5.10 Motion, performance, accessibility

- Motion: 150–250 ms ease-out; hover lift on cards; no parallax; respect `prefers-reduced-motion`.
- Performance: the audience is self-hosters; a heavy marketing site is a bad joke. Target < 500 KB initial payload, LCP < 1.5 s, CLS < 0.05, < 150 KB JS.
- Images: AVIF/WebP with `srcset`, explicit width/height, lazy-load below the fold, preload the hero.
- Video: poster + click-to-play, or a muted 10–20 s loop under 5 MB. Never autoplay with sound.
- Accessibility: 4.5:1 contrast, visible focus, semantic landmarks, alt text that describes the UI, keyboard-operable tabs/menus.
- Cookies: use cookieless analytics (Umami/Plausible) or none. No banner. Disclose in `/privacy`.

### 5.11 Dark vs light

| Choice | Examples | Effect |
|---|---|---|
| All dark | Bambuddy, Linkwarden, OctoEverywhere, Mainsail | Premium/technical; risks fatigue and low contrast |
| All light | Immich, Karakeep, Actual, Umami, Plausible | Clear, readable, screenshot pops; can feel generic |
| Alternating | Frigate, Karakeep, Bambuddy (sections) | Best of both; keeps a long page alive |
| Bold color block | Homarr (red), Home Assistant (cyan), PhotoPrism (purple) | Strong identity; can overwhelm |

**Recommendation:** dark hero + alternating light/dark sections. It matches the app’s dark UI, differentiates from Immich/Karakeep’s all-light pages, and avoids Bambuddy’s all-dark fatigue.

---

## 6. What works / what doesn’t

### 6.1 Synthesis

| What works | Evidence | Application to OpenPrintDashboard |
|---|---|---|
| One concrete promise in the H1 | Bambuddy, Immich, Karakeep, Plausible | “Every print. Every spool. One dashboard you own.” |
| A real product screenshot in the hero | Immich, Karakeep, Linkwarden, Frigate, Printago | Reshoot the dashboard + scan flow; use them above the fold |
| A live demo, no signup | Bambuddy, Immich, Karakeep, Actual, Frigate | Deploy the existing demo mode at `demo.openprintdash.app` |
| A 3-step “how it works” | Bambuddy, SimplyPrint, Actual | “Connect → Print → Track”: LAN connect, live print, auto-deduct filament |
| Mono spec rows / technical facts | Bambuddy, OctoEverywhere | `DOCKER · LAN MODE · AGPL-3.0 · NO TELEMETRY` |
| Proof layered after the product | Bambuddy, Printago, Immich | At launch: demo + changelog + roadmap; later: press/reviews |
| A dedicated install page | Immich, Karakeep, Actual, Bambuddy | `/install` with copy-paste blocks and prerequisites |
| Alternating section rhythm | Frigate, Karakeep | Dark hero → light features → dark privacy → light install |
| A single accent + one motif | Immich (indigo), Karakeep (yellow), Bambuddy (orange) | Teal + viewfinder corners; no gradient text |
| A footer that is a second nav | Bambuddy, Immich | Product / Community / Legal / Status |

| What doesn’t | Evidence | Application |
|---|---|---|
| Four competing bars above the product | OctoPrint (donation, Ukraine, nav, cookie, ads) | One banner max; no ads; cookie-free |
| No product screenshot | OctoPrint, PhotoPrism, n8n | Screenshot is mandatory at v0.1 |
| Docs theme as the front door | Manyfold, Mealie, Mainsail, Fluidd | Separate marketing site and docs |
| Stock photo of a screen | 3DPrinterOS | Use real UI, not a photo of a monitor |
| Icon grid instead of product | PhotoPrism | Show the interface, not six icons |
| 13+ nav items | Bambuddy, 3DPrinterOS | Max 7 top-level items |
| Cookie banner over the hero | SimplyPrint, 3DPrinterOS | No cookies, no banner |
| Generic blue gradient | SimplyPrint, OctoEverywhere | A deliberate palette, not a gradient default |
| “Farm” framing for a single-printer product | Bambuddy | Own the single-printer/small-setup niche |
| Fake/borrowed proof | Various | At 2 stars, say “v0.1” and show the demo |

### 6.2 Anti-patterns to avoid

1. **The “everything” hero.** A headline that tries to cover monitoring, history, filament, costs and privacy in one sentence becomes unreadable.
2. **The feature-list homepage.** A grid of 18 features with equal weight is a spec sheet, not a story.
3. **The invisible product.** A page that never shows the UI, only illustrations and icons.
4. **The premature pricing page.** A pricing table for a free, self-hosted, 2-star project confuses the audience.
5. **The fake enterprise.** Stock photos, “trusted by” logos that are actually partners, and a “Book a demo” gate.
6. **The docs front door.** A VitePress sidebar as the homepage; fine for existing users, fatal for newcomers.
7. **The dark-on-dark text.** Gray #777 on #0F0F0F for body copy; looks moody, reads badly.
8. **The cookie tax.** A consent modal covering the product screenshot on first load.
9. **The hidden install.** A “Get started” button that leads to a 40-page docs index with no “quick start”.
10. **The overclaim.** “No cloud” when setup requires a cloud login; “works with every printer” when it works with one brand.

---

## 7. Recommendations for openprintdash.app

### 7.1 Positioning and messaging

**Positioning statement:**

> OpenPrintDashboard is the self-hosted dashboard for Bambu Lab owners who want to see everything their printer is doing — and everything it is consuming. Live status, filament stock, print history and the real material cost of every print, in one calm interface on your own hardware.

**Recommended H1:**

> **Every print. Every spool. One dashboard you own.**

Why: it covers the two data domains (print history + filament), the benefit (one place), and the emotional hook (ownership) in nine words. It avoids the cloud argument entirely — the site can explain cloud truthfully further down.

**The feature to over-explain: scan with the native app.** Bambuddy's flagship spool-onboarding answer is dedicated RFID hardware (`SpoolBuddy`); OpenPrintDashboard's is the native iOS/Android scanner people already carry. The site shows the three steps and the catalog match with real native screens. The app is a distribution and retention surface, not a design direction for the site.

**Alternative H1s (for A/B or later):**

- “The dashboard your Bambu Lab deserves.” — emotional, shorter, but less concrete.
- “Know what your printer is doing — and what it’s costing you.” — strongest cost angle.
- “A calmer command center for your Bambu Lab.” — tone-led, weaker for SEO.
- “Your printer. Your filament. Your data.” — ownership-led, a bit generic.

**Subhead:**

> Live status, a filament library that knows what’s left, and the real material cost of every print — self-hosted in one Docker container, with your data on your hardware.

**CTAs:**

- Primary: **Open the live demo →**
- Secondary: **Install it yourself**
- Microcopy under secondary: `One command · Docker · AGPL-3.0` (once the installer exists) or `Docker Compose · ~5 minutes · AGPL-3.0`

**Trust row:**

Runs in Docker. Works with Bambu Lab X1, P1 and A1. AGPL-3.0.

Do not include a star count until it is meaningful. Add `v0.1 · early access` as a separate pill if you want to be explicit.

**Tone of voice:**

- Calm, precise, technical, confident. Short sentences. Specific numbers.
- No “revolutionary”, “game-changing”, “seamless”, “next-generation”.
- Explain jargon once (AMS, cloud sync, Docker) or link to the docs.
- Admit limits. “Works with X1, P1 and A1 today; check the compatibility page for the current list” is stronger than a vague “works with Bambu Lab”.

### 7.2 Sitemap

**v1 (launch):**

```
/                     one-page marketing site
/install              prerequisites + Docker + manual + troubleshooting
/features             overview (optional at launch; can anchor to home)
/changelog            release notes (MDX)
/roadmap              public roadmap
/about                story, principles, license, funding
/privacy              no cookies, what is stored, analytics
/press                press kit, logos, screenshots, contact
/docs                 link/short intro to GitHub docs (or docs subdomain)
```

**v1.1 (first 90 days):**

```
/features/printers
/features/print-jobs
/features/filaments
/features/spools
/features/scan
/features/analytics
/compare/bambu-handy
/compare/bambuddy
/compare/octoprint
/compare/spoolman
/integrations/spoolman
/integrations/home-assistant
/blog/...
/hosting             managed-hosting beta interest, three plan slots
/cloud               later: hosted-tier landing / pricing (only when real)
```

**Subdomains:**

- `demo.openprintdash.app` — the real frontend in demo mode, seeded data, no backend.
- `docs.openprintdash.app` — later; Fumadocs/MkDocs with search, version, “Edit this page”.
- `status.openprintdash.app` — later; only if there is a hosted service.

**Do not build yet:** pricing, signup/billing, account area, dashboard on the marketing domain, a forum, a merchandise store. `/hosting/` holds beta interest only; add `/cloud` and pricing only when the hosted tier is real enough to sell.

### 7.3 Homepage wireframe

| # | Section | Content | Asset |
|---|---|---|---|
| 1 | **Nav** | Logo/wordmark · Features · Install · Docs · Changelog · GitHub · **Live demo** | SVG logo, star count (later) |
| 2 | **Hero (dark)** | H1; subhead; 2 CTAs; trust line | 3D dashboard deck: full dashboard front, spools and analytics behind; no phone mockup |
| 3 | **Compatibility strip** | “Works with X1, P1, A1” + “Bambu Cloud sync” + “Docker” + “AGPL-3.0” | Text only, no printer logos |
| 4 | **Six jobs** | 6 tabs: Printers, Print Jobs, Filaments, Spools, Analytics, Native scanner | Scroll-driven sticky tab/preview tour, scanner last |
| 5 | **Feature: live status** | “See the print, not just the percentage.” Nozzle/bed, layers, time, fan, speed, reconnect | Large printer card capture |
| 6 | **Feature: filament & spools** | “Know what is left before you print.” Color swatches, remaining bars, price/kg, auto-deduction | Spool inventory screenshot + three-phone native app deck |
| 7 | **Feature: history & cost** | “Every print, with the receipt.” Success rate, material used, material cost per print, 30-day trend | Analytics screenshot + 3 data callouts |
| 8 | **Self-hosted by design (dark)** | App and data run on your server; encrypted credentials; no telemetry; Bambu Cloud powers account/history where enabled | Icons + short copy |
| 9 | **Install (light)** | 3 steps, copy-paste code, prerequisites, link to `/install` | Code block with copy button |
| 10 | **Demo band** | “Poke around the real thing.” + CTA | Small screenshot/loop |
| 11 | **FAQ** | 6 questions: cloud account, internet, printers, cost accuracy, security, updates | Text |
| 12 | **Open source** | GitHub, AGPL-3.0, roadmap, contributing, sponsor | GitHub mark, license badge |
| 13 | **Footer** | Product / Community / Legal / Status + “Not affiliated with Bambu Lab” + “No cookies” | — |

**FAQ answers to write carefully:**

1. **Do I need a Bambu Lab account?** — “Yes, Bambu Cloud is part of the connection and history sync today. The dashboard and your data still run on your own server.”
2. **Does it work without internet?** — “Not fully today: Bambu Cloud features need internet. Your self-hosted data stays on your server either way. Check the docs for the current connection modes.”
3. **Which printers?** — “X1, P1 and A1 series are tested today. Check the compatibility page for the current, verified list.”
4. **How accurate is the cost?** — “Based on spool price/kg and the slicer-reported weight. It is a material-cost estimate, not a utility bill; energy and machine time are not included.”
5. **Where are my credentials stored?** — “Encrypted at rest with a key derived from your `SECRET_KEY`; never sent anywhere except Bambu Cloud when you use cloud features.”
6. **How do updates work?** — “`git pull` + `docker compose up -d --build`; your data lives in a Docker volume.”

### 7.4 Design direction

**Recommended: match the dashboard, then add marketing hierarchy.**

You are right: the site should feel like the same product. The dashboard already has a coherent system — near-black neutral surfaces, 10 px card radii, Geist, Lucide icons, one configurable accent (default emerald), and dense data UI. Reuse that language, but do not turn the marketing page into a fake dashboard.

**What “fit” means in practice:**

- **Tokens:** reuse the dashboard's CSS variables (background, card, border, muted, brand). The site should look like it was built by the same hand.
- **Type:** Geist for display and body, Geist Mono for code only. No new typeface for v1. Character comes from scale and spacing.
- **Accent:** emerald, `oklch(0.596 0.145 163.225)`, with dark ink on emerald fills. The site uses it for primary actions, icons and small highlights, plus one full-bleed deep-emerald filament shelf. On light surfaces, links and focus rings use a deep emerald (`oklch(0.41 0.1 163)`).
- **Motif:** a 3D deck of real dashboard screens; no fake browser chrome, no faint decorative grids, no mono eyebrows. The emerald shelf is the other ownable marketing moment.
- **Imagery:** 2× real web dashboard captures, dark, with seeded data, plus three 3× phone captures from the finished native app with the same data. The native app appears as a fanned phone deck on the emerald shelf.
- **Layout:** marketing hierarchy, not app chrome. One-column narrative, 2-column feature splits, 96–160 px section padding, max-width 1360 px. No sidebar, no dashboard cards repeated as page sections.
- **Motion:** the hero deck flattens on scroll and leans a few degrees to a fine pointer; the six-job tour pins a full-width preview and advances at roughly two-thirds of a viewport per feature, collapsing to a compact viewer once passed; large screenshot cards tilt toward a fine pointer without cropping; the phone deck moves its side phones outward on hover; sections reveal once when they enter. No autoplay, no looping marquee, no parallax soup. Reduced motion disables the deck, tour transitions and tilt.
- **Rhythm:** dark hero with the 3D deck → dark feature index → dark live-status split → **emerald filament shelf** → dark analytics → dark self-hosted spec → light install → dark demo → dark FAQ/open source. The emerald shelf is the relief and the signature.
- **Data:** use the dashboard’s own numbers as design elements: `47%`, `83 min`, `128 g`, `€1.03`. It makes the site feel like the product.

**Design tokens (aligned with the app):**

```css
--bg:            #0A0A0A;   /* app dark background */
--surface:       #171717;   /* app card */
--surface-2:     #1F1F1F;
--border:        rgba(255, 255, 255, 0.10);
--text:          #FAFAFA;
--muted:         #A1A1A1;
--accent:        #10B981;   /* emerald, approx. oklch(0.596 0.145 163.225) */
--accent-strong: #10B981;
--accent-ink:    #0A0A0A;
--accent-deep:   #4D7C0F;   /* links and focus on light */
--success:       #4ADE80;
--warning:       #FBBF24;
--danger:        #F87171;
--light-bg:      #FAFAFA;
--light-text:    #0A0A0A;
--light-muted:   #5B5B5B;
--radius:        10px;      /* app --radius */
--max-width:     1360px;
```

Type scale: `clamp(2.75rem, 5vw + 1rem, 4.75rem)` H1, `clamp(2rem, 2.5vw + 1rem, 3.5rem)` H2, 20 px lead, 16 px body. Headline line-height 0.95–1.02, tracking -0.03em to -0.04em.

**What not to do:** don’t clone the dashboard shell (sidebar, header, cards) on the marketing page; don’t use a generic blue gradient; don’t run emerald and teal as competing primaries; don’t let the native UI drive the site’s design. The site should feel like the product’s *brand*, not its *interface*.

**If you want more character later:** add one display face (e.g. Archivo) after the brand is stable. At v0.1, coherence beats novelty.

### 7.5 Brand fixes (do before design)

| Decision | Recommendation | Why |
|---|---|---|
| **Name** | Public brand: **OpenPrintDash**. Full name in metadata/footer: **OpenPrintDashboard**. | Matches the domain, short enough for a nav, avoids the four-name drift. |
| **Accent** | **Emerald** `oklch(0.596 0.145 163.225)` in the dashboard default, icon and site; deep emerald on light surfaces. Blue stays available in the dashboard selector. | One primary color; emerald is the owner’s favorite and still reads as a workshop instrument, not a neon gimmick. |
| **Logo** | Keep the reticle as the “scan” mark; add a wordmark lockup. If budget allows, evolve the mark to a printer-gantry + status-dot symbol. | The current icon reads as a camera/scan target, not a 3D printer dashboard. |
| **Voice** | Calm, precise, technical, honest. | The audience is technical and allergic to hype. |
| **Disclaimer** | “Not affiliated with Bambu Lab. Bambu Lab is a trademark of its respective owner.” | Required for trust and legal hygiene. |
| **License** | AGPL-3.0, explained in one plain-language sentence with a link. | Self-hosters care; the license is a feature, not a footnote. |

### 7.6 Asset shot list

**Fresh captures (9 Nov 2026, production demo build, emerald accent, no dev toast):**

Desktop at 3200×2000 (2×) in dark mode, seeded data: `/dashboard` (hero front), `/dashboard/spools` and `/dashboard/analytics` (hero back layers), `/dashboard/printers`, `/dashboard/prints`, `/dashboard/filaments`, plus a 1240×1000 crop of the X1 Carbon card. The old mobile PWA screenshots were removed from the site.

**Final desktop shot list (2×, 2560×1600 or 2880×1800):**

1. `/dashboard/printers` — multi-printer overview with live status
2. `/dashboard/printers` crop — one printer card with temperatures and progress
3. `/dashboard/prints` — print history with covers and status
4. `/dashboard/filaments` — filament library with color swatches
5. `/dashboard/spools` — spool inventory with remaining bars
6. `/dashboard/analytics` — success rate, material usage, cost per print
7. `/dashboard` — overview with current prints and printer cards
8. `/dashboard/settings` — optional; only if it looks good

**Native app screenshots:** captured from the Expo app with demo data — inventory, spool detail and barcode scanning. The old PWA shots and the earlier unfinished UI are not used.

**Detail crops:**

- Printer card (nozzle/bed current + target, progress, loaded spool)
- Temperature card (nozzle/bed current + target)
- AMS slots with color and remaining %
- Cost per print chart
- Spool progress bar + price/kg
- Success-rate ring or stat

**Video:**

- 15–25 s, 1440p or 1080p, no audio, no cursor jitter.
- Web-dashboard sequence: dashboard live → progress changes → spool stock → analytics.
- Add a native scan sequence only when the native design is ready.
- Deliver as MP4 (H.264) + WebM, poster image, < 5 MB.

**Brand:**

- Logo SVG (light/dark), favicon 32/180/512, maskable icon; emerald reticle on near-black.
- OG image 1200×630: dark background, wordmark, H1, dashboard crop, emerald accent.
- Press kit: logo pack, 6 screenshots, fact sheet (what it is, license, stack, links), founder bio, contact.

### 7.7 Technical implementation

**Recommendation: a separate `site/` app in the same repository.**

Why not a route group in `frontend/`:

- The frontend ships inside the Docker image for self-hosters; marketing pages would bloat the image and confuse routing.
- The marketing site can deploy independently (Cloudflare Pages/Vercel) without the backend.
- Different dependencies, analytics and SEO needs.
- A separate site makes it impossible to break the app with a marketing change.

**Before the site: add a one-line installer.** A `install.sh` / `install/docker-install.sh` that checks Docker + Compose, downloads `compose.yml`, generates `SECRET_KEY`, starts the stack and prints the URL turns the hero CTA from “read four steps” into “paste one line”. Bambuddy's entire install page is built on this promise. It is a small backend/ops task with a large conversion payoff.

**Stack:**

- Next.js 16 (same major as the app), Tailwind v4, TypeScript.
- Static export (`output: "export"`) or Cloudflare Pages. No server runtime needed.
- MDX for `/changelog` and `/blog`; a typed `features.ts` for copy.
- Reuse the app’s design tokens by copying the CSS variables; do not build a shared package for v1.
- Components: `Nav`, `Hero`, `ScreenshotFrame`, `FeatureSection`, `CodeBlock`, `FAQ`, `Footer`, `StarBadge`, `DemoCTA`, `SectionLabel`, `DataCallout`.
- `next/font` for Geist/Geist Mono (the dashboard's fonts); self-host, subset, `display: swap`.
- `next/og` for dynamic OG images; or a static 1200×630 asset for v1.
- `sitemap.ts`, `robots.ts`, canonical URLs, JSON-LD `SoftwareApplication` + `FAQPage`.
- Analytics: Umami Cloud (cookieless) or self-hosted; no cookie banner. If none, say “no analytics” and mean it.
- Deployment: Cloudflare Pages for `openprintdash.app`; `www` 301 to apex; `demo.` on Cloudflare/Vercel with the demo build; `docs.` later.

**Performance budget:**

| Metric | Target |
|---|---|
| Initial HTML+CSS+JS | < 500 KB |
| JS on landing | < 150 KB |
| LCP | < 1.5 s on desktop, < 2.5 s on mobile 4G |
| CLS | < 0.05 |
| Images | AVIF/WebP, responsive `srcset`, lazy below fold |
| Fonts | 2 families max, subset, preload the display face |
| Third-party scripts | 0 (analytics excluded) |

**Accessibility:**

- WCAG 2.2 AA: contrast, focus, keyboard, labels.
- `prefers-reduced-motion` for all transitions.
- Alt text describes the screen and the benefit, not “screenshot”.
- No autoplay video with sound; provide captions if there is narration.
- Test with keyboard only and a screen reader before launch.

### 7.8 Content and SEO

**Title pattern:**

- Home: `OpenPrintDash — Self-hosted Bambu Lab dashboard`
- Features: `Live printer status for Bambu Lab — OpenPrintDash`
- Install: `Install OpenPrintDash — Docker setup for Bambu Lab`
- Compare: `OpenPrintDash vs Bambu Handy — self-hosted alternative`

**Pages with search intent:**

- “Bambu Lab dashboard”
- “Bambu Lab alternative to Bambu Handy”
- “self-hosted Bambu Lab”
- “Bambu Lab filament tracker”
- “Bambu Lab cost per print”
- “Bambuddy alternative”
- “Spoolman alternative with dashboard”
- “OctoPrint for Bambu Lab”

**Lead magnet idea:** a free “3D print cost calculator” page (filament price/kg and print weight — the same inputs the dashboard uses — with optional energy/machine-time inputs for a more complete estimate) and a shareable result. It is useful, linkable, and directly demonstrates the product’s cost-tracking value. Embed a small version on the homepage or link it from the analytics section.

**Changelog:** one entry per release, with a screenshot and a one-line “why it matters”. This is proof of momentum and gives the site fresh content without a blog.

**README alignment:** the GitHub README is the second-most-visited page. Update its hero, screenshots, feature list and install steps to match the site. Add a link to `openprintdash.app` and the demo at the top. Do not let the README and the site tell different stories.

### 7.9 Launch plan

**Done 8–9 Nov 2026:**

- Public name for the site: OpenPrintDash; full name in footer/metadata.
- Site accent: emerald in the dashboard default, icon and site.
- Native app deck with three real phone captures replaces the old PWA screenshots; the native UI is not used as design direction.
- “No cloud required” removed; README tagline is “On your own hardware”.
- Production demo flag implemented.
- `site/` built: `/`, `/install/`, `/privacy/`, 404, sitemap, robots.
- Fresh 2× web captures and 3× phone captures; `overview`/`analytics` from `feat/dashboard-polish`.
- 3D hero deck with scroll flatten, pointer lean, and section reveals.
- 3D hover tilt on large screenshot cards.
- “What runs where” copy on the homepage and install page.

**Still P0 — before the site goes live:**

1. Deploy the production demo build at `demo.openprintdash.app`.
2. Deploy `site/` to `openprintdash.app`.
3. Set up DNS, TLS, `www` redirect and email.
4. Re-shoot the screenshots at 2× and record the 20 s loop.
5. Update the README with the demo link and new screenshots.
6. Cookieless analytics (or none) and the final privacy check.
7. Test mobile, keyboard, Lighthouse and OG previews.

**P1 — first 30 days:**

- `/features/*` pages for the six surfaces.
- `/compare/bambu-handy` and `/compare/bambuddy` (fair, factual).
- `/changelog` and `/roadmap`.
- Press kit and outreach.
- 3–5 user stories or “how I use it” posts.
- Cost calculator.

**P2 — 60–90 days:**

- Docs subdomain with search.
- Integrations pages (Spoolman, Home Assistant) and a “connection modes” compatibility page.
- Sponsor page + GitHub Sponsors.
- German translation if the data supports it.
- A hosted demo video on the homepage (click-to-play).

**Launch channels:**

- **Show HN:** “Show HN: Self-hosted dashboard for Bambu Lab printers — live status, spools, costs.”
- **Reddit:** r/BambuLab, r/3Dprinting, r/selfhosted, r/homelab. Read each community’s self-promotion rules; lead with the demo, not the repo.
- **Discord/forums:** Bambu Lab communities, self-hosted communities, Home Assistant communities.
- **YouTube:** Bambu-focused creators; offer a demo and a ready-made b-roll pack.
- **Press:** XDA, How-To Geek, MakeUseOf, Fabbaloo, Hackaday, Tom’s Hardware, 3Druck (German). Bambuddy’s press page shows the target list is reachable.
- **Directories:** self-hosted awesome lists, AlternativeTo, Product Hunt (optional), opensource alternatives directories.

**What not to do:** mass-DM creators, post the same text in five subreddits on day one, buy reviews, or claim “production-ready” at v0.1.

### 7.10 Metrics

| Funnel stage | Metric | Target (first 90 days) |
|---|---|---|
| Acquisition | Unique visitors | 5k/month |
| Acquisition | GitHub referrals from site | 30% of visitors |
| Engagement | Demo click-through | > 25% of visitors |
| Engagement | Demo → install page | > 15% |
| Conversion | Install page → GitHub clone/compose | > 20% |
| Community | GitHub stars | +500 |
| Community | Discord members | 100 |
| Retention | Weekly active instances (if telemetry-free, use GitHub release downloads) | — |

Because the product has no telemetry, use GitHub release downloads, Docker pulls, demo sessions (if analytics), and self-reported “I use it” posts. Do not add telemetry just to measure the funnel; it would undermine the privacy positioning.

### 7.12 Future hosted tier — OpenPrintDash Cloud

The hosted tier is the long-term revenue path: the same dashboard, run and maintained by you, for people who don’t want to run Docker. It should not shape the v1 homepage beyond a roadmap mention, but the site architecture should be ready for it.

**Positioning:**

> The same dashboard, without the server. We run OpenPrintDash for you — updates, backups and uptime included. Export everything and move to self-hosting whenever you want.

**When to launch it:**

- After the self-hosted onboarding is stable and support load is understood.
- After there is a demo that converts and a changelog that proves cadence.
- Not before the product can survive a multi-tenant deployment (backups, isolation, monitoring, billing, support).

**Website structure when it is real:**

```
/cloud          hosted-tier landing + waitlist or signup
/pricing        self-hosted free vs cloud tiers
/cloud/security isolation, backups, data export, region
/cloud/status   uptime/status page
```

Add a “Cloud” nav item only when the page can take a signup or waitlist. Until then, a `/roadmap` entry is enough.

**Pricing models to test:**

- Per printer/month (e.g. €5/printer) — scales with the audience; simple to explain.
- Flat maker tier (e.g. €9/month up to 3 printers) — easier for single-printer owners.
- Annual discount, 14-day trial, no credit card.
- Keep the self-hosted edition complete and free; sell convenience, backups and uptime — not features.

**Trust requirements:**

- Data export at any time; no lock-in.
- EU hosting / GDPR if targeting the German-speaking market.
- Clear “what we store” page and a real security contact.
- Status page and a public incident history.
- A one-click migration path from cloud to self-hosted.

**What not to do:** gate core features, call the self-hosted edition “limited”, use fake scarcity, or advertise the cloud before it exists.

### 7.11 Risks and mitigations

| Risk | Mitigation |
|---|---|
| Bambu Lab changes its cloud/LAN API, or MQTT is removed | Compatibility page, version pinning, clear “tested with” table, fast releases; don’t market a specific protocol |
| Cloud dependency is a product choice, not a secret | Explain exactly what uses Bambu Cloud; never claim “no cloud”; sell self-hosted app + data ownership instead |
| Hosted tier distracts from the self-hosted launch | Launch self-hosted-first; `/hosting/` is a footer/install link with beta interest only; no pricing or signup until the beta; keep the free edition complete |
| Bambuddy is a year ahead with 3.3k stars | Do not compete on farm features; own single-printer UX, filament scanning and cost clarity |
| AGPL confusion | Explain the license in plain language; link to the source; no “open core” bait-and-switch |
| Bambu Lab trademark | Disclaimer; no Bambu logos without permission; use “for Bambu Lab printers” descriptively |
| Security concerns (printer access codes, Bambu credentials) | Document encryption at rest, self-hosted architecture, responsible disclosure, no telemetry |
| Name confusion with OpenPrinting/CUPS | Always pair “OpenPrintDash” with “Bambu Lab dashboard”; use the full name in the title tag |
| Thin social proof | Lean on the demo, changelog, roadmap, and “built in the open”; ask for feedback, not trust |
| Heavy site / slow LCP | Static export, image budget, no third-party scripts, performance gate in CI |

---

## 8. 30/60/90-day plan

**Days 0–30 — foundation**

- Brand decisions (name, accent, logo lockup).
- Remove “No cloud required”; write the “What runs where” copy.
- Deploy the production demo.
- Screenshot/video shoot.
- One-page site + `/install` + `/privacy` + `/press`.
- README refresh.
- DNS/TLS/email/analytics.
- Launch checklist and soft launch to 5 friendly users.

**Days 31–60 — launch**

- Show HN + Reddit + Discord + YouTube outreach + press.
- `/features/*` pages.
- `/compare/bambu-handy` and `/compare/bambuddy`.
- `/changelog` and `/roadmap`.
- Cost calculator.
- Iterate on the first 100 demo sessions (where do people drop?).

**Days 61–90 — compounding**

- Docs subdomain.
- Integrations pages.
- User stories.
- German translation if data supports it.
- Sponsor page.
- SEO review: which comparison/feature pages rank, which need rewriting.
- Plan v0.2 around the top three user requests, not the roadmap fantasy.

---

## 9. Open decisions

**Resolved (8–9 Nov 2026):** cloud stays; “No cloud required” is removed; MQTT may go; the site must fit the dashboard; a separate `site/` app is built; the production demo flag is implemented; the site uses OpenPrintDash + the emerald accent; the native app is shown in a three-phone deck without using its visual language as the site’s design direction; a paid hosted tier is planned for later.

**Still open before launch:**

1. **Language:** English only at launch, or English + German?
2. **Domain:** is `openprintdash.app` registered and ready? It did not resolve from the review environment; verify DNS before launch.
3. **Hosted tier:** pricing model and timing — per printer/month vs flat tier; waitlist now vs later?
4. **Logo:** keep the reticle as the mark, or commission a printer/dashboard mark before launch?
5. **Press page:** build it now or after the first launch coverage?

---

## 10. Reference index

**Direct 3D printing**

- Bambuddy — https://bambuddy.cool/
- OctoPrint — https://octoprint.org/
- Obico — https://obico.io/
- SimplyPrint — https://www.simplyprint.io/
- Printago — https://printago.io/
- OctoEverywhere — https://octoeverywhere.com/
- 3DPrinterOS — https://www.3dprinteros.com/
- Spoolman — https://github.com/Donkie/Spoolman/wiki
- FilaMan — https://www.filaman.app/
- Manyfold — https://manyfold.app/
- Mainsail — https://www.mainsail.xyz/
- Fluidd — https://fluidd.xyz/
- Klipper — https://www.klipper3d.org/
- 3DPrintForge — https://github.com/skynett81/3dprintforge

**Self-hosted OSS leaders**

- Immich — https://immich.app/
- Home Assistant — https://www.home-assistant.io/
- Actual Budget — https://actualbudget.org/
- Frigate — https://frigate.video/
- Jellyfin — https://jellyfin.org/
- Karakeep — https://karakeep.app/
- Linkwarden — https://linkwarden.app/
- Umami — https://umami.is/
- Plausible — https://plausible.io/
- PhotoPrism — https://www.photoprism.app/
- Homarr — https://homarr.dev/
- Mealie — https://mealie.io/
- Paperless-ngx — https://docs.paperless-ngx.com/

**Craft / brand**

- n8n — https://n8n.io/
- Bambu Lab — https://bambulab.com/

**Screenshot index**

All screenshots are in [`screenshots/`](./screenshots), captured 8 November 2026 at 1440×900 unless noted. They are third-party sites, kept for internal design reference only.

| File | Site | What to study |
|---|---|---|
| `bambuddy-hero.jpeg` | Bambuddy | Hero hierarchy, mono trust row, demo-first CTA |
| `bambuddy-loop.jpeg` | Bambuddy | Three-step “loop” section with a full-width real screenshot |
| `bambuddy-material.jpeg` | Bambuddy | Dense spool table; how much detail the audience tolerates |
| `bambuddy-demo.jpeg` | Bambuddy | “Try it against the demo before you install anything” copy |
| `bambuddy-mobile.jpeg` | Bambuddy | Mobile type scale and full-width CTAs |
| `immich-hero.jpeg` | Immich | The gold-standard hero + screenshot + two CTAs |
| `immich-mobile.jpeg` | Immich | Mobile headline scaling; what not to do with a 5-line H1 |
| `karakeep-hero.jpeg` | Karakeep | Star pill, highlighter motif, browser-framed screenshot |
| `linkwarden-hero.jpeg` | Linkwarden | Tabbed product viewer, premium dark palette |
| `actualbudget-hero.jpeg` | Actual Budget | Local-first copy, hosted + manual paths, demo overlay |
| `frigate-hero.jpeg` | Frigate | Split hero with one killer screenshot |
| `printago-hero.jpeg` | Printago | SaaS split hero, stats row, logo strip |
| `simplyprint-hero.jpeg` | SimplyPrint | Trust stats, feature tabs, objection microcopy |
| `obico-hero.jpeg` | Obico | Pain-led headline, cloud vs self-host choice |
| `octoeverywhere-hero.jpeg` | OctoEverywhere | Three-beat promise, scale stats, platform logos |
| `octoprint-hero.jpeg` | OctoPrint | Cautionary tale: banners, no screenshot, dated design |
| `photoprism-hero.jpeg` | PhotoPrism | Cautionary tale: purple slab + icon grid |
| `homeassistant-hero.jpeg` | Home Assistant | Community portal, release momentum, cyan identity |
| `jellyfin-hero.jpeg` | Jellyfin | Honest “we don’t run servers” note; dark hero |
| `umami-hero.jpeg` | Umami | Star count in nav, centered SaaS hero, dashboard |
| `plausible-hero.jpeg` | Plausible | “Alternative to X” positioning, demo + screenshot |
| `homarr-hero.jpeg` | Homarr | Bold color, dashboard collage, three CTAs |
| `mealie-hero.jpeg` | Mealie | Docs-as-homepage with screenshots and install paths |
| `manyfold-hero.jpeg` | Manyfold | Docs theme as front door; horizontal scrollbar bug |
| `mainsail-hero.jpeg` | Mainsail | Docs + screenshot gallery + star/version widget |
| `klipper-hero.jpeg` | Klipper | Pure docs, no marketing |
| `3dprinteros-hero.jpeg` | 3DPrinterOS | Enterprise clutter and stock-photo hero |
| `bambulab-hero.jpeg` | Bambu Lab | Product photography, 3–6 word copy, premium hardware feel |
| `n8n-hero.jpeg` | n8n | Interactive hero, dot grid, social proof without a screenshot |
