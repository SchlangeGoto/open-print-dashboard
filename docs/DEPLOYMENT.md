# Deployment

## Two compose files

| File | Use |
| --- | --- |
| `compose.yml` | Local development. Mounts source, runs `fastapi dev` and `next dev`, exposes PostgreSQL and Mailpit |
| `compose.prod.yml` | Production. Built images, `fastapi run`, `next start`, no source mounts, no database port, no Mailpit |

Do not use `compose.yml` for a public deployment: it runs development servers
and exposes the database.

## Production quick start

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

Then build and start:

```bash
docker compose -f compose.prod.yml up -d --build
```

Open the frontend URL and follow the setup wizard.

## What each value does

| Variable | Notes |
| --- | --- |
| `SECRET_KEY` | Required. Generate with `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | Required for anything public; change the default |
| `NEXT_PUBLIC_API_URL` | **Build-time** value. The browser uses it to reach the API. Rebuild the frontend after changing it |
| `FRONTEND_HOST` | Backend CORS allowlist. Must match the public frontend URL |
| `PRINTER_IP`, `PRINTER_SERIAL`, `PRINTER_ACCESS_CODE` | Optional defaults for the Bambu Lab connection |
| `SMTP_*`, `EMAILS_FROM_EMAIL` | Optional. If you are not using SMTP, set `EMAILS_FROM_EMAIL=` and `SMTP_HOST=` empty to skip email |

`NEXT_PUBLIC_API_URL` is inlined by Next.js at build time. If you change it,
run:

```bash
docker compose -f compose.prod.yml build frontend
docker compose -f compose.prod.yml up -d frontend
```

## Reverse proxy and TLS

The stack exposes the frontend on `:3000` and the API on `:8000`. For a public
deployment, put a reverse proxy in front:

- `https://dashboard.example.com` → `http://127.0.0.1:3000`
- `https://api.example.com` → `http://127.0.0.1:8000`

Set `NEXT_PUBLIC_API_URL=https://api.example.com` and
`FRONTEND_HOST=https://dashboard.example.com` before building.

Caddy example:

```caddyfile
dashboard.example.com {
    reverse_proxy 127.0.0.1:3000
}

api.example.com {
    reverse_proxy 127.0.0.1:8000
}
```

The backend uses a single process because printer connections and the pending
Bambu login are kept in memory. Do not scale the backend to multiple replicas
without moving that state out of process.

## Updating

```bash
git pull
docker compose -f compose.prod.yml up -d --build
```

The database lives in the `postgres_data` Docker volume and survives rebuilds.
Migrations run automatically in `backend/scripts/start.sh`.

## Backup

```bash
docker compose -f compose.prod.yml exec -T db \
  pg_dump -U opd openprintdashboard > backup.sql
```

Restore:

```bash
cat backup.sql | docker compose -f compose.prod.yml exec -T db \
  psql -U opd -d openprintdashboard
```

## Images and CI

`Docker Build` builds the backend image and `frontend/Dockerfile.prod` on PRs
that touch Docker, Compose, or dependency files. It does not push them.

Publishing to a registry such as GHCR is optional. If the project starts
shipping prebuilt images, add a tag-triggered workflow that pushes:

- `ghcr.io/<owner>/open-print-dashboard/backend`
- `ghcr.io/<owner>/open-print-dashboard/frontend`

Then production hosts can `docker compose pull` instead of building.

## Mobile app

The mobile app is not part of the dashboard deployment.

- `Build Mobile APK` is a manual GitHub Actions workflow. It generates the
  native Android project with `expo prebuild` and uploads a **debug** APK.
- A debug APK is installable for testing but cannot be published to Google
  Play.
- For release builds, use EAS Build with an `EXPO_TOKEN`, or add a keystore
  secret and a tag-triggered `assembleRelease`/`bundleRelease` workflow.
- iOS builds need macOS or EAS Build; no IPA workflow is configured.

## Marketing site

`site/` is a static Next.js export (`site/out/`). `Test Site` builds it in CI.
Deployment is separate from the self-hosted dashboard.

## Health checks

- Backend: `GET /api/v1/utils/health-check/`
- Frontend: `GET /`
- Database: `pg_isready`

If the frontend loads but API calls fail, check `NEXT_PUBLIC_API_URL` first.
If the browser gets CORS errors, check `FRONTEND_HOST`.
