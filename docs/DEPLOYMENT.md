# Deployment

## Compose files

| File | Use |
| --- | --- |
| `compose.yml` | Local development. Mounts source, runs `fastapi dev` and `next dev`, exposes PostgreSQL and Mailpit |
| `compose.prod.yml` | Production built from source. `fastapi run`, standalone `node server.js`, no source mounts, no database port, no Mailpit |
| `compose.ghcr.yml` | Production using published GHCR images. Caddy serves the frontend and proxies `/api` to the backend |
| `compose.external-proxy.yml` | Overlay for `compose.ghcr.yml` that removes the bundled Caddy and publishes the frontend and backend on loopback |
| `compose.public.yml` | Marketing site and demo, from GHCR, on loopback behind the proxy already running on the host |

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

### Reverse proxy already on the host

`compose.ghcr.yml` bundles Caddy so that one command produces a working TLS
deployment on a machine with nothing else on ports 80/443. If a proxy is already
running there (home lab, shared host, Traefik in front of several services), use
the overlay instead:

```bash
docker compose -f compose.ghcr.yml -f compose.external-proxy.yml up -d --remove-orphans
```

The overlay removes the bundled Caddy (`!reset`) and publishes the frontend on
`127.0.0.1:3000` and the backend on `127.0.0.1:8000`. `--remove-orphans` is
required when switching an existing install: without it the old `caddy`
container keeps running and holds 80/443. Your proxy must send `/api/*` to the
backend and everything else to the frontend, because the frontend image calls
`/api/v1` on its own origin:

```caddyfile
dashboard.example.com {
	handle /api/* {
		reverse_proxy 127.0.0.1:8000
	}
	reverse_proxy 127.0.0.1:3000
}
```

`DOMAIN` no longer configures a proxy in this mode, but it still feeds the
default `FRONTEND_HOST`; keep it set, or set `FRONTEND_HOST` directly, so CORS
and password-reset links are correct. `BACKEND_PORT` and `FRONTEND_PORT` change
the two loopback ports. The `!reset` tag needs Compose v2.24 or newer.

Automatic deployment does not pass this overlay. With a host proxy, leave
`DEPLOY_DASHBOARD` unset and update with the command above; the dashboard job
would otherwise restart the bundled Caddy and collide with your proxy.

## Configuration

| Variable | Notes |
| --- | --- |
| `SECRET_KEY` | Recommended (`openssl rand -hex 32`). If empty, a key is generated into the `backend_data` volume on first start |
| `POSTGRES_PASSWORD` | Required for anything public; change the default |
| `DOMAIN` | Public dashboard hostname for `compose.ghcr.yml` |
| `IMAGE_PREFIX` | GHCR image prefix, shared by every stack |
| `IMAGE_TAG` | Release tag for `compose.ghcr.yml` (dashboard) |
| `SITE_IMAGE_TAG`, `DEMO_IMAGE_TAG` | Release tags for the public site and demo |
| `SITE_PORT`, `DEMO_PORT` | Loopback ports for the public site and demo. Default 8080 and 3000 |
| `BACKEND_PORT`, `FRONTEND_PORT` | Loopback ports for the dashboard when `compose.external-proxy.yml` removes its Caddy. Default 8000 and 3000 |
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
# Set IMAGE_TAG=0.3.0 in .env, then pull and restart. Do not export it in the
# shell: Compose reads shell variables before .env, so a leftover export would
# override the pin on later runs.
docker compose -f compose.ghcr.yml pull
docker compose -f compose.ghcr.yml up -d
```

The database lives in the `postgres_data` Docker volume and survives rebuilds.
Migrations run automatically in `backend/scripts/start.sh`.

## Automatic deployment on tags (optional)

`Deploy` (`.github/workflows/deploy.yml`) is a reusable workflow that
`Release Containers` calls as its final job for a plain `vX.Y.Z` tag, after the
version images and the `latest` promotion. It SSHes to the server, checks out
the tag, pulls the matching images, restarts the stack, and calls an optional
health URL.

The dashboard, site and demo targets are all disabled until their `DEPLOY_*`
variable is `true`. This keeps tag releases working before a server is
configured.

Automatic deployment shares the `latest` promotion gate: only the newest plain
`vX.Y.Z` tag, created at the then-current `main` tip, deploys. Re-running an
older `Release Containers` run rebuilds its images but does not deploy them, so
a stale rerun cannot silently downgrade production. Rolling back is the manual
dispatch below.

### Server prerequisites

- The repository is cloned on the server at the configured path.
- `.env` is configured and the stack has been started once manually.
- The deploy user can run `docker compose` (normally the `docker` group) and has
  `git` and `curl`.
- The clone has no tracked local changes; untracked files such as `.env` are
  fine.

### Persistent settings on the server

The SSH session starts a fresh shell, so anything you only `export`ed in an
interactive login is gone. The deploy workflow exports `IMAGE_PREFIX` and
`IMAGE_TAG` for the pull and rewrites both lines in the server `.env` (creating
the file for the site and demo stacks if it does not exist yet). A later plain
`docker compose ... up -d` therefore uses the same images instead of falling
back to `latest` or to the default prefix, which is what makes a manual
rollback stick. Do not edit those lines by hand.

The site and demo stacks need nothing else in `.env`; their hostnames live in
the reverse proxy on the host. The dashboard clone needs its normal `.env` from
`.env.example`; deployment fails if it is missing.

### Secrets

| Name | Purpose |
| --- | --- |
| `DEPLOY_SSH_KEY` | Private key for the deploy user |
| `DEPLOY_KNOWN_HOSTS` | `ssh-keyscan` output for every deploy host |

### Variables

| Name | Example | Purpose |
| --- | --- | --- |
| `DEPLOY_DASHBOARD` | `true` | Enable `compose.ghcr.yml` deployment |
| `DASHBOARD_HOST` | `dashboard.example.com` | SSH host |
| `DASHBOARD_USER` | `deploy` | SSH user |
| `DASHBOARD_PATH` | `/opt/open-print-dashboard` | Clone on the server |
| `DASHBOARD_URL` | `https://dashboard.example.com` | Link on the deployment |
| `DASHBOARD_HEALTH_URL` | `https://dashboard.example.com/api/v1/utils/health-check/` | Checked after restart |
| `DEPLOY_SITE` | `true` | Enable `compose.public.yml` deployment (site and demo) |
| `SITE_HOST` | `openprintdash.app` | SSH host for the site and demo |
| `SITE_USER` | `deploy` | SSH user |
| `SITE_PATH` | `/opt/openprint-public` | Clone on the server |
| `SITE_URL` | `https://openprintdash.app` | Link on the deployment |
| `SITE_HEALTH_URL` | `https://openprintdash.app/` | Checked after restart |
| `DEMO_URL` | `https://demo.openprintdash.app` | Link on the deployment |
| `DEMO_HEALTH_URL` | `https://demo.openprintdash.app/` | Checked after restart |

### One-time setup

```bash
# Create the key outside the repository clone so it can never be staged.
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/openprint-deploy -N ""

# Verify the fingerprints, add ~/.ssh/openprint-deploy.pub to
# ~/.ssh/authorized_keys on each server, then:
gh secret set DEPLOY_SSH_KEY -R SchlangeGoto/open-print-dashboard < ~/.ssh/openprint-deploy
ssh-keyscan -H dashboard.example.com openprintdash.app > ~/.ssh/openprint-known-hosts

# ssh-keyscan trusts whatever the network returns. Compare every fingerprint
# with the server's own key read over a trusted channel (for example console
# access) before storing the secret:
#   ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub   # on the server
ssh-keygen -lf ~/.ssh/openprint-known-hosts
gh secret set DEPLOY_KNOWN_HOSTS -R SchlangeGoto/open-print-dashboard < ~/.ssh/openprint-known-hosts

# The private key and host list are only needed for the two `gh secret set`
# commands above.
rm -f ~/.ssh/openprint-deploy ~/.ssh/openprint-known-hosts

gh variable set DEPLOY_DASHBOARD -R SchlangeGoto/open-print-dashboard --body true
gh variable set DASHBOARD_HOST -R SchlangeGoto/open-print-dashboard --body dashboard.example.com
gh variable set DASHBOARD_USER -R SchlangeGoto/open-print-dashboard --body deploy
gh variable set DASHBOARD_PATH -R SchlangeGoto/open-print-dashboard --body /opt/open-print-dashboard
gh variable set DASHBOARD_URL -R SchlangeGoto/open-print-dashboard --body https://dashboard.example.com
gh variable set DASHBOARD_HEALTH_URL -R SchlangeGoto/open-print-dashboard --body https://dashboard.example.com/api/v1/utils/health-check/

gh variable set DEPLOY_SITE -R SchlangeGoto/open-print-dashboard --body true
gh variable set SITE_HOST -R SchlangeGoto/open-print-dashboard --body openprintdash.app
gh variable set SITE_USER -R SchlangeGoto/open-print-dashboard --body deploy
gh variable set SITE_PATH -R SchlangeGoto/open-print-dashboard --body /opt/openprint-public
gh variable set SITE_URL -R SchlangeGoto/open-print-dashboard --body https://openprintdash.app
gh variable set SITE_HEALTH_URL -R SchlangeGoto/open-print-dashboard --body https://openprintdash.app/
gh variable set DEMO_URL -R SchlangeGoto/open-print-dashboard --body https://demo.openprintdash.app
gh variable set DEMO_HEALTH_URL -R SchlangeGoto/open-print-dashboard --body https://demo.openprintdash.app/
```

The demo runs on the same host and clone as the site, so it reuses `SITE_HOST`,
`SITE_USER` and `SITE_PATH`; leave the `DEMO_*` health variables unset if you do
not want the demo checked.

### Manual deploy and rollback

```bash
gh workflow run deploy.yml -f tag=v0.2.0
```

Use the same command with an older tag to roll back. Back up the database first:
several migrations have lossy downgrades, and redeploying an older image does not
undo a migration. For the site and demo, pick a tag that contains the site/demo
split; earlier tags bundle their own Caddy and bind 80/443.


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

`site/` is a static Next.js export. `frontend/` runs as a standalone demo with
`NEXT_PUBLIC_DEMO_MODE=true`, on seeded data, with edits kept in the browser and
no backend. `Release Containers` publishes both as images.

They run as two services in one Compose project on the same host and Docker
daemon. Neither bundles a reverse proxy: both publish on loopback, and the proxy
already running on the host terminates TLS and forwards each hostname to its
port.

| Compose file | Service | Container port | Host binding |
| --- | --- | --- | --- |
| `compose.public.yml` | `site` | 8080 | `127.0.0.1:${SITE_PORT:-8080}` |
| `compose.public.yml` | `demo` | 3000 | `127.0.0.1:${DEMO_PORT:-3000}` |

They keep separate image tags (`SITE_IMAGE_TAG`, `DEMO_IMAGE_TAG`) so either can
be released without moving the other, even though they share one project.

Because nothing binds 80/443, this stack does not fight the host proxy. The
containers are stateless: no volumes, no database, nothing to back up.

`DEMO_PORT` defaults to 3000, the same port the dashboard frontend uses. That
only matters if the dashboard runs on the same host with
`compose.external-proxy.yml`; set `DEMO_PORT` there.

The site image bakes `NEXT_PUBLIC_DEMO_URL` at build time (default
`https://demo.openprintdash.app`). A different demo hostname needs the image
rebuilt with `--build-arg NEXT_PUBLIC_DEMO_URL=...`; the release workflow does
not pass that argument.

### Coming from the combined stack

Releases before this change ran the site, the demo and a bundled Caddy in one
project. Stop it while the clone is still on the old tag, otherwise its Caddy
keeps ports 80/443:

```bash
cd /opt/openprint-public
docker compose -f compose.public.yml down --remove-orphans
git fetch --tags origin
git checkout <new-tag>

# Must print nothing:
docker ps --filter label=com.docker.compose.project=openprint-public
```

Without `-f compose.public.yml`, Compose picks up `compose.yml` (the development
stack) instead and fails on its missing database settings. The old `.env` keeps
working; `SITE_DOMAIN`, `DEMO_DOMAIN` and the old `IMAGE_TAG` are ignored by the
public stack from now on and can be deleted.

### What the host needs

- Docker Engine with the Compose plugin, `git`, `curl`
- A reverse proxy already listening on 80/443 (Caddy, nginx, Nginx Proxy
  Manager, Traefik, ...)
- DNS records for the site host (apex and `www`) and the demo host, both
  pointing at this machine
- Ports 80 and 443 open in the firewall; the container ports stay on loopback

### 1. Get the repository onto the host

The deploy workflow checks out a tag inside this clone, so it must be a real git
clone, not a copied directory.

```bash
sudo mkdir -p /opt/openprint-public && sudo chown "$USER" /opt/openprint-public
git clone https://github.com/SchlangeGoto/open-print-dashboard.git /opt/openprint-public
cd /opt/openprint-public
git checkout v0.2.0   # the newest release, and not older than this change
```

The path must match `SITE_PATH` if you enable automatic deployment.

### 2. Pin the release

Create `.env` next to the clone:

```dotenv
IMAGE_PREFIX=ghcr.io/schlangegoto/open-print-dashboard
SITE_IMAGE_TAG=0.2.0
DEMO_IMAGE_TAG=0.2.0
```

`SITE_IMAGE_TAG` and `DEMO_IMAGE_TAG` are the release without the leading `v`.
Compose reads this file on every `up`, which is what keeps later manual restarts
on the same releases. Set `SITE_PORT` or `DEMO_PORT` only if the default port is
already taken on the host. The domains are not in this file: the host proxy owns
them.

### 3. Start the containers

```bash
docker compose -f compose.public.yml pull
docker compose -f compose.public.yml up -d
docker compose -f compose.public.yml ps
curl -fsS http://127.0.0.1:8080/ >/dev/null && echo "site responds"
curl -fsS http://127.0.0.1:3000/ >/dev/null && echo "demo responds"
```

If this fails before the pull, the packages are private: open each package under
the repository's **Packages** tab and set its visibility to **Public**, or run
`docker login ghcr.io` with a token that has `read:packages`.

### 4. Point the host proxy at them

Copy both blocks from [`deploy/Caddyfile.public`](../deploy/Caddyfile.public)
into your proxy config and reload it. That file is an example, not something
Compose mounts. An nginx equivalent is in the same file.

```caddyfile
openprintdash.app {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8080
}

www.openprintdash.app {
	redir https://openprintdash.app{uri} permanent
}

demo.openprintdash.app {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
```

Both hostnames point at the same machine. Verify end to end before touching the
deploy variables:

```bash
curl -fsSI https://openprintdash.app/ | head -1
curl -fsSI https://demo.openprintdash.app/ | head -1
```

If the proxy runs as a container itself, `127.0.0.1` inside it is the proxy
container, not the host. Either run that proxy with host networking, point it at
the Docker bridge gateway (`host.docker.internal` with an `extra_hosts` entry, or
`172.17.0.1`), or attach the containers to a shared external network.

### Everyday commands

```bash
docker compose -f compose.public.yml ps
docker compose -f compose.public.yml logs -f site
docker compose -f compose.public.yml logs -f demo
docker compose -f compose.public.yml restart site demo
docker compose -f compose.public.yml images      # digests actually running
docker compose -f compose.public.yml down        # stop and remove, images stay
```

`down` followed by `up -d` is safe because there is no state. Images are cached,
so a restart does not need the network.

### Updating to a new release

1. Merge to `main` and tag the `main` tip: `git tag v0.3.0 && git push origin v0.3.0`.
2. Wait for `Release Containers` to publish `0.3.0`.
3. On the host, set both `SITE_IMAGE_TAG=0.3.0` and `DEMO_IMAGE_TAG=0.3.0` in `.env`.
4. `docker compose -f compose.public.yml pull`
5. `docker compose -f compose.public.yml up -d`

Changing a tag is what triggers the recreate; `up -d` without a change is a
no-op. Do not export the tags in the shell: Compose reads shell variables before
`.env`, so a leftover export overrides the pin on later runs.

### Rolling back

Set both tags to the previous release, `pull`, `up -d`. Images are immutable, so
that is the entire rollback: no migration to reverse and no state to restore.

Releases before this change bundle a Caddy that binds 80/443. Rolling back that
far collides with the host proxy. Check before downgrading past it:

```bash
git show <tag>:compose.public.yml
```

### Automatic deploy on a tag

The `Deploy` workflow can do steps 3-5 above over SSH. It is described under
[Automatic deployment on tags](#automatic-deployment-on-tags-optional).

What happens on a tag push:

1. `Release Containers` builds multi-arch images and pushes `X.Y.Z`, `X.Y`.
2. Only a plain `vX.Y.Z` tag that is an ancestor of `main` **and** the current
   `main` tip at release time moves `latest`.
3. Only that same release calls `Deploy`, so a rerun of an old tag cannot
   silently downgrade production.
4. The site job checks out the tag on the host, pulls both images, restarts the
   stack and calls `SITE_HEALTH_URL` and `DEMO_HEALTH_URL`.

A tag created from an older commit on `main` still builds images, but does not
move `latest` or deploy. Create the tag from the current `main` tip when you
want it to go out.

Rollback is a manual dispatch, which bypasses the `latest` gate:

```bash
gh workflow run deploy.yml -f tag=v0.2.0
```

### Troubleshooting

- **Proxy returns 502**: the container is not running, or `SITE_PORT` /
  `DEMO_PORT` does not match the port in the proxy config. Check
  `docker compose ... ps` and `logs`.
- **Certificate error**: DNS does not resolve to the machine yet, or port 80 is
  closed, which blocks the ACME challenge.
- **`pull access denied`**: package is private; make it public or log in.
- **Update ran but the old page is served**: the tag did not change, or the
  running digest is stale. Compare `docker compose ... images` with the release,
  then `up -d --force-recreate`.
- **Deploy workflow skipped**: `DEPLOY_SITE` is not `true`, the tag is not a
  plain `vX.Y.Z`, or it was not created at the `main` tip.
- **Health check fails after a successful start**: the URL points at the host
  proxy rather than the loopback port, or DNS/TLS is not ready yet.

For local testing, the stack needs no override file: it already publishes on
loopback, so `docker compose -f compose.public.yml up -d` serves the site at
`http://127.0.0.1:8080` and the demo at `http://127.0.0.1:3000`.

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
