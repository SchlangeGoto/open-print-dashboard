# Deployment

## Compose files

| File | Use |
| --- | --- |
| `compose.yml` | Local development. Mounts source, runs `fastapi dev` and `next dev`, exposes PostgreSQL and Mailpit |
| `compose.prod.yml` | Production built from source. `fastapi run`, standalone `node server.js`, no source mounts, no database port, no Mailpit |
| `compose.ghcr.yml` | Production using published GHCR images. Caddy serves the frontend and proxies `/api` to the backend |
| `compose.public.yml` | Public marketing site and demo, served from GHCR images through Caddy |

Do not use `compose.yml` for a public deployment: it runs development servers
and exposes the database.

## Source build (compose.prod.yml)

```bash
git clone https://github.com/SchlangeGoto/open-print-dashboard.git
cd open-print-dashboard
cp .env.example .env
```

Edit `.env` and set at least:

```dotenv
SECRET_KEY=<openssl rand -hex 32>   # or leave empty to auto-generate
POSTGRES_PASSWORD=<a long random password>
NEXT_PUBLIC_API_URL=https://api.example.com
FRONTEND_HOST=https://dashboard.example.com
```

Then:

```bash
docker compose -f compose.prod.yml up -d --build
```

The frontend and API are exposed separately on `:3000` and `:8000`. Put a
reverse proxy in front for TLS.

## Prebuilt images (compose.ghcr.yml)

`Release Containers` publishes multi-arch images to GHCR on every `v*` tag:

- `ghcr.io/schlangegoto/open-print-dashboard/backend`
- `ghcr.io/schlangegoto/open-print-dashboard/frontend`
- `ghcr.io/schlangegoto/open-print-dashboard/site`
- `ghcr.io/schlangegoto/open-print-dashboard/demo`

After the first `Release Containers` run, open each package under the
repository's **Packages** tab and set its visibility to **Public**, or run
`docker login ghcr.io` on the server with a token that can read packages.
Otherwise `docker compose pull` cannot fetch the images.

The frontend image is built with an empty `NEXT_PUBLIC_API_URL`, so the browser
calls `/api/v1` on the same origin. Caddy proxies `/api/*` to the backend; no
separate API hostname is needed.

```bash
cp .env.example .env
```

Edit `.env` and set:

```dotenv
SECRET_KEY=<openssl rand -hex 32>       # or leave empty to auto-generate
POSTGRES_PASSWORD=<openssl rand -hex 32> # URL-safe; it is embedded in DATABASE_URL
DOMAIN=dashboard.example.com
FRONTEND_HOST=https://dashboard.example.com
IMAGE_PREFIX=ghcr.io/schlangegoto/open-print-dashboard
IMAGE_TAG=0.2.0
```

The `:latest` tag moves only when all three release gates pass: the tag is a
plain `vX.Y.Z` semver tag (no pre-release suffix), it is the newest semver tag
merged into `main`, and it was the `main` tip when the guard ran. Pin
`IMAGE_TAG` in production so a skipped promotion cannot leave the server on an
older build.

Use a URL-safe password (hex or base64url) because `DATABASE_URL` embeds it
without URL encoding. If you copied `.env.example`, change `FRONTEND_HOST` from
`http://localhost:3000` to the public URL; otherwise CORS and password-reset
links point at localhost.

Then:

```bash
docker compose -f compose.ghcr.yml pull
docker compose -f compose.ghcr.yml up -d
```

`SECRET_KEY` is generated once and kept. If it is unset (or still the example
placeholder) outside development, the backend generates a random key on first
start and stores it in the `backend_data` volume. Either way, keep it: the
backend derives its credential-encryption key from it, so replacing it makes
existing printer credentials unreadable. Back up that volume, or set the key
explicitly in `.env`.

Point `dashboard.example.com` at the server and open ports 80/443. Caddy obtains
TLS certificates automatically.

Set `FRONTEND_HOST` only if you change the public hostname; `compose.ghcr.yml`
derives it from `DOMAIN`.

## Configuration

| Variable | Notes |
| --- | --- |
| `SECRET_KEY` | Recommended (`openssl rand -hex 32`). If empty, a key is generated into the `backend_data` volume on first start |
| `POSTGRES_PASSWORD` | Required for anything public; change the default |
| `DOMAIN` | Public dashboard hostname for `compose.ghcr.yml` |
| `IMAGE_PREFIX`, `IMAGE_TAG` | GHCR image prefix and release tag |
| `NEXT_PUBLIC_API_URL` | Source-build only. **Build-time** value; rebuild after changing it |
| `FRONTEND_HOST` | Backend CORS allowlist. Set it to the public frontend URL; `.env.example` defaults to localhost |
| `SMTP_*`, `EMAILS_FROM_EMAIL` | Optional. If you are not using SMTP, set `EMAILS_FROM_EMAIL=` and `SMTP_HOST=` empty to skip email |

The backend uses a single process because printer connections and the pending
Bambu login are kept in memory. Do not scale the backend to multiple replicas
without moving that state out of process.

## Backend worker

Run exactly **one** backend worker. The printer connection registry and the
pending Bambu login live in process memory; a second worker would open its own
MQTT sessions and see only its own state. `backend/scripts/start.sh` uses
`fastapi run` with the default single worker and refuses to start when
`WEB_CONCURRENCY` is greater than 1.

## Rolling back

Back up the database before downgrading. Several migrations are lossy in
`downgrade()`: printer LAN fields, NFC identifiers, and the one-active-spool
ordering. A downgrade does not restore credentials or tags.

## Updating

Source build:

```bash
git pull
docker compose -f compose.prod.yml up -d --build
```

Prebuilt images:

```bash
export IMAGE_TAG=0.3.0
docker compose -f compose.ghcr.yml pull
docker compose -f compose.ghcr.yml up -d
```

The database lives in the `postgres_data` Docker volume and survives rebuilds.
Migrations run automatically in `backend/scripts/start.sh`.

## Backup

```bash
docker compose -f compose.ghcr.yml exec -T db \
  pg_dump -U opd openprintdashboard > backup.sql
```

Restore:

```bash
cat backup.sql | docker compose -f compose.ghcr.yml exec -T db \
  psql -U opd -d openprintdashboard
```

Use `compose.prod.yml` instead of `compose.ghcr.yml` if that is the stack you
run.

## Public site and demo

`site/` is a static Next.js export. `frontend/` can run as a standalone demo
with `NEXT_PUBLIC_DEMO_MODE=true`. `Release Containers` publishes both as
images, and `compose.public.yml` serves them with Caddy:

```bash
export IMAGE_PREFIX=ghcr.io/schlangegoto/open-print-dashboard
export IMAGE_TAG=0.2.0
export SITE_DOMAIN=openprintdash.app
export DEMO_DOMAIN=demo.openprintdash.app

docker compose -f compose.public.yml pull
docker compose -f compose.public.yml up -d
```

Point both DNS records at the server and open ports 80/443. Caddy obtains
certificates automatically.

`compose.ghcr.yml` and `compose.public.yml` both bind ports 80/443. Run them on
separate hosts, or terminate TLS in one external Caddy and route by hostname.
The Compose project names are isolated (`openprintdashboard` and
`openprint-public`), but port bindings still conflict on a single host.

The site image bakes `NEXT_PUBLIC_DEMO_URL` at build time (default
`https://demo.openprintdash.app`). If `DEMO_DOMAIN` differs, rebuild the site
image with the matching `--build-arg NEXT_PUBLIC_DEMO_URL=...`.

For local testing, the base stack publishes only Caddy's 80/443. To skip Caddy
and run just the site and demo, add the local override:

```bash
docker compose -f compose.public.yml -f compose.public.local.yml up -d site demo
```

Then open `http://localhost:8080` and `http://localhost:8081`. The override
binds only `127.0.0.1:8080` and `127.0.0.1:8081`; never use it on a public host.

There is no Vercel or Cloudflare dependency. The site and demo are self-hosted.

## Mobile releases (EAS)

The mobile app is not part of the dashboard deployment. Releases use
[EAS Build](https://docs.expo.dev/build/introduction/), which compiles and signs
the artifact in the cloud and stores the signing credentials.

### Distribution model

**Android ships as a signed APK. There is no Play Store step.** Sideloading an
APK is allowed, so no Play Console account, no AAB, and no store review. Android
may show a Play Protect warning on first install; the user confirms once.

The `production` profile in `mobile/eas.json` still produces an AAB if the app
is ever submitted to Play.

**iOS cannot avoid Apple's signing rules.** There is no unsigned equivalent of
"just install the APK":

| Route | Cost | Limits |
| --- | --- | --- |
| Free Apple ID + AltStore/SideStore | $0 | 7-day expiry, 3 apps, re-sign weekly, needs a Windows/macOS helper |
| Paid Apple Developer Program + ad hoc | $99/year | 100 devices, 12-month validity, install from a link |
| TestFlight / App Store | $99/year + review | Public distribution |

EAS signs iOS device builds with ad hoc provisioning, which requires the paid
program. A free Apple ID cannot be used for cloud builds — that route signs
locally with Xcode or a sideloading helper. Simulation builds need no Apple
account, but need a Mac to run them.

iOS is therefore **not** part of the tag workflow. Set it up separately once a
paid Apple Developer account exists.

### One-time setup

```bash
npm install -g eas-cli   # or: pnpm add -g eas-cli, if npm's prefix is /usr
eas login
cd mobile
eas init                 # writes the Expo project ID into app.json
eas build:configure      # creates/updates eas.json
git add app.json eas.json
git commit -m "chore: configure EAS project"
git push
```

`eas init` changes `mobile/app.json`; commit and push it **before** creating a
release tag. The release workflow checks out the tagged commit, so an
uncommitted project ID cannot work.

Android signing:

```bash
eas credentials -p android   # choose the production profile, let EAS generate
```

Back up the keystore. It is the Play upload key; losing it needs a Google
support request to reset, not a lost app.

Then create an Expo access token and add it as the `EXPO_TOKEN` repository
secret:

```bash
gh secret set EXPO_TOKEN
```

iOS, only if a paid Apple Developer account exists:

```bash
eas credentials -p ios
eas device:create            # register a device UDID, then rebuild
eas build --platform ios --profile preview
```

### Release

Set `expo.version` in `mobile/app.json` to the release version (for example
`0.2.0`), commit it, and push before tagging. EAS `autoIncrement` changes build
numbers, not the user-facing version.

```bash
git tag v0.2.0
git push origin v0.2.0
```

`Release Android` builds a signed APK with the `preview` profile and attaches
`openprint-dashboard-v0.2.0.apk` to the GitHub Release.

Manual run:

```bash
gh workflow run release-android.yml
```

Locally:

```bash
cd mobile
eas build --platform android --profile preview
```

The separate `Build Mobile APK` workflow produces an unsigned debug APK for
testing. It is not a distribution artifact.

The first EAS build fails until `eas init`, the Android keystore, and
`EXPO_TOKEN` are configured. That is expected.


## Health checks

- Backend: `GET /api/v1/utils/health-check/`
- Frontend: `GET /`
- Database: `pg_isready`

If the frontend loads but API calls fail, check `NEXT_PUBLIC_API_URL` (source
build) or the Caddy `/api` proxy (GHCR stack). If the browser gets CORS errors,
check `FRONTEND_HOST`.
