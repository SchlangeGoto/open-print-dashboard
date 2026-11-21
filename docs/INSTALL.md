# Install without cloning

The guided installer downloads only the Compose file and Caddy config for the
latest stable GitHub release, writes `.env`, and starts the published images.
It never runs a checkout from `main`.

```bash
curl -fsSL https://raw.githubusercontent.com/SchlangeGoto/open-print-dashboard/main/install.sh | bash
```

The interactive prompts cover:

- the dashboard domain,
- whether OpenPrintDash should run Caddy and obtain TLS, or you already have a
  reverse proxy,
- the app ports when you already have a proxy,
- the first admin email and password.

The install directory (`--dir`, default `/opt/openprintdashboard`), project
name (`--project-name`, default: derived from the install directory) and release tag
(`--tag vX.Y.Z`, default: latest GitHub release) are optional flags. Adding
`--force` reuses the existing secrets and admin values when updating an install
in place. Changing `FIRST_SUPERUSER_PASSWORD` only affects the initial account
creation; an account that already exists is changed in the app's account
settings, not by the env file.

## Bundled Caddy

Choose option 1. Caddy listens on 80/443 and obtains a certificate for the
domain. Forward TCP 80 and 443 from the router/firewall to the host and point
the DNS record at the server.

## Existing reverse proxy

Choose option 2. The installer binds the frontend to `127.0.0.1:3000` and the
backend to `127.0.0.1:8000`, then prints Caddy and Nginx examples. The proxy
must route:

- `/api/*` to `127.0.0.1:8000`
- everything else to `127.0.0.1:3000`

If the proxy runs on another machine, the installer can bind the two ports to
the network instead; restrict them with a firewall so only the proxy reaches
them.

## Updates

The installer enables the `updater` sidecar. A superuser sees an **Updates**
card in Settings. It checks the latest stable GitHub release, shows the current
and available version, and after confirmation updates only the backend and
frontend containers to that release tag. The database and uploads stay in the
named volumes.

If the new backend does not become healthy before a database migration, the
updater restores the previous tag automatically. If the new image already
migrated the database, automatic rollback is skipped and the card shows the
database backup path; restore that backup before downgrading.

If the sidecar is restarted while an update is running, it recovers on start:
it restores the previous tag when the database revision did not move, and stops
with the backup path when a migration already committed.

The dump lives in the `updater_data` volume. Each attempt gets its own file, and
the card shows the exact path. With the default project name, restore into a
fresh database so a failed migration cannot leave objects behind:

```bash
(
  set -e

  # 1. Verify and extract the exact dump shown in the update status.
  BACKUP=pre-update-X.Y.Z-YYYYMMDDTHHMMSSZ-PID.sql.gz
  docker run --rm -v openprintdashboard_updater_data:/d alpine \
    sh -c "gunzip -t /d/$BACKUP"
  docker run --rm -v openprintdashboard_updater_data:/d alpine \
    sh -c "gunzip -c /d/$BACKUP" > /tmp/opd-restore.sql

  # 2. Stop everything that writes to the database.
  docker compose -f compose.ghcr.yml stop backend updater

  # 3. Recreate an empty database.
  docker compose -f compose.ghcr.yml exec -T db psql -U opd -d postgres \
    -c 'DROP DATABASE IF EXISTS openprintdashboard'
  docker compose -f compose.ghcr.yml exec -T db psql -U opd -d postgres \
    -c 'CREATE DATABASE openprintdashboard TEMPLATE template0'

  # 4. Restore and stop on the first error.
  docker compose -f compose.ghcr.yml exec -T db psql -X -v ON_ERROR_STOP=1 \
    -U opd -d openprintdashboard < /tmp/opd-restore.sql
)

# 5. Set IMAGE_TAG and APP_VERSION in .env back to the previous release.
docker compose -f compose.ghcr.yml up -d
```

With an existing reverse proxy, add `-f compose.override.yml` to the Compose
commands. The volume name follows the Compose project name; use
`docker volume ls` if you changed it. Use the exact backup filename from the
status, not a wildcard: a retry for the same release keeps the previous dump
too.

The updater needs `/var/run/docker.sock`. That is root-equivalent on the host;
only the fixed updater image has it. The image accepts a single `X.Y.Z` tag and
cannot run arbitrary commands.

Releases before the updater image existed are installed without the sidecar. In
that case the installer removes `COMPOSE_PROFILES=updater` and prints the manual
update commands instead.

### Manual fallback

To disable dashboard updates, stop the sidecar before removing the profile, then
change `IMAGE_TAG` and `APP_VERSION` in the install directory's `.env` and pull
and recreate:

```bash
docker compose -f compose.ghcr.yml stop updater
docker compose -f compose.ghcr.yml rm -f updater
# then remove COMPOSE_PROFILES=updater from .env

# bundled Caddy
docker compose -f compose.ghcr.yml pull
docker compose -f compose.ghcr.yml up -d

# existing proxy
docker compose -f compose.ghcr.yml -f compose.override.yml pull db backend frontend
docker compose -f compose.ghcr.yml -f compose.override.yml up -d db backend frontend
```

The named volumes `postgres_data` and `backend_data` are never removed by these
commands. Back up `.env` separately: it contains the admin password and the
keys for stored Bambu credentials. Updates always use an explicit release tag,
never a build from `main`.
