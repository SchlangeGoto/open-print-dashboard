# Deployment

## Compose files

| File | Use |
| --- | --- |
| `compose.yml` | Local development. Mounts source, runs `fastapi dev` and `next dev`, exposes PostgreSQL and Mailpit |
| `compose.prod.yml` | Production built from source. `fastapi run`, `next start`, no source mounts, no database port, no Mailpit |
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
SECRET_KEY=<openssl rand -hex 32>
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

- `ghcr.io/schlangengoto/open-print-dashboard/backend`
- `ghcr.io/schlangengoto/open-print-dashboard/frontend`
- `ghcr.io/schlangengoto/open-print-dashboard/site`
- `ghcr.io/schlangengoto/open-print-dashboard/demo`

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
SECRET_KEY=<openssl rand -hex 32>       # generate once, then keep it
POSTGRES_PASSWORD=<openssl rand -hex 32> # URL-safe; it is embedded in DATABASE_URL
DOMAIN=dashboard.example.com
FRONTEND_HOST=https://dashboard.example.com
IMAGE_PREFIX=ghcr.io/schlangengoto/open-print-dashboard
IMAGE_TAG=0.2.0
```

Use a URL-safe password (hex or base64url) because `DATABASE_URL` embeds it
without URL encoding. If you copied `.env.example`, change `FRONTEND_HOST` from
`http://localhost:3000` to the public URL; otherwise CORS and password-reset
links point at localhost.

Then:

```bash
docker compose -f compose.ghcr.yml pull
docker compose -f compose.ghcr.yml up -d
```

Generate `SECRET_KEY` **once** and keep it in a protected, backed-up `.env` or
secret manager. The backend derives its credential-encryption key from it;
replacing it makes existing printer credentials unreadable.

Point `dashboard.example.com` at the server and open ports 80/443. Caddy obtains
TLS certificates automatically.

Set `FRONTEND_HOST` only if you change the public hostname; `compose.ghcr.yml`
derives it from `DOMAIN`.

## Configuration

| Variable | Notes |
| --- | --- |
| `SECRET_KEY` | Required. Generate with `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | Required for anything public; change the default |
| `DOMAIN` | Public dashboard hostname for `compose.ghcr.yml` |
| `IMAGE_PREFIX`, `IMAGE_TAG` | GHCR image prefix and release tag |
| `NEXT_PUBLIC_API_URL` | Source-build only. **Build-time** value; rebuild after changing it |
| `FRONTEND_HOST` | Backend CORS allowlist. Set it to the public frontend URL; `.env.example` defaults to localhost |
| `PRINTER_IP`, `PRINTER_SERIAL`, `PRINTER_ACCESS_CODE` | Optional defaults for the Bambu Lab connection |
| `SMTP_*`, `EMAILS_FROM_EMAIL` | Optional. If you are not using SMTP, set `EMAILS_FROM_EMAIL=` and `SMTP_HOST=` empty to skip email |

The backend uses a single process because printer connections and the pending
Bambu login are kept in memory. Do not scale the backend to multiple replicas
without moving that state out of process.

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
export IMAGE_PREFIX=ghcr.io/schlangengoto/open-print-dashboard
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

For local testing, use hostnames that Caddy can issue locally:

```bash
SITE_DOMAIN=localhost DEMO_DOMAIN=demo.localhost \
  docker compose -f compose.public.yml up -d
```

There is no Vercel or Cloudflare dependency. The site and demo are self-hosted.

## Mobile releases (EAS)

The mobile app is not part of the dashboard deployment. Release builds use
[EAS Build](https://docs.expo.dev/build/introduction/), which signs Android and
iOS artifacts in the cloud.

### One-time setup

```bash
npm install -g eas-cli
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

- Android: let EAS generate and store the upload keystore. Back it up in the
  Expo dashboard.
- iOS: an Apple Developer account is required. EAS prompts for the Apple login
  and stores the credentials.
- Create an Expo access token and add it as the `EXPO_TOKEN` repository secret.

### Release

Set `expo.version` in `mobile/app.json` to the release version (for example
`0.2.0`), commit it, and push before tagging. EAS `autoIncrement` changes build
numbers, not the user-facing version.

```bash
git tag v0.2.0
git push origin v0.2.0
```

`Release Mobile` builds the production Android **AAB** and iOS **IPA**, uploads
them as workflow artifacts, and attaches them to the GitHub Release.

Manual run:

```bash
gh workflow run release-mobile.yml
```

A signed **APK** for direct installation:

```bash
cd mobile
eas build --platform android --profile preview
```

The separate `Build Mobile APK` workflow produces an unsigned/debug APK for
testing; it is not a store artifact.

The first EAS build fails until `eas init`, credentials, and `EXPO_TOKEN` are
configured. That is expected.

## Health checks

- Backend: `GET /api/v1/utils/health-check/`
- Frontend: `GET /`
- Database: `pg_isready`

If the frontend loads but API calls fail, check `NEXT_PUBLIC_API_URL` (source
build) or the Caddy `/api` proxy (GHCR stack). If the browser gets CORS errors,
check `FRONTEND_HOST`.
