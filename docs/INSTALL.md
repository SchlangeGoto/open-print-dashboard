# Install without cloning

The guided installer downloads only the Compose file and Caddy config for the
latest stable GitHub release, writes `.env`, and starts the published images.
It never runs a checkout from `main`.

```bash
curl -fsSL https://raw.githubusercontent.com/SchlangeGoto/open-print-dashboard/main/install.sh | bash
```

It asks for:

- the install directory (default `/opt/openprintdashboard`),
- the release tag (default: latest GitHub release),
- the dashboard domain,
- whether OpenPrintDash should run Caddy and obtain TLS, or you already have a
  reverse proxy,
- the app ports when you already have a proxy,
- the first admin email and password.

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

If the new backend does not become healthy, the updater restores the previous
tag automatically. A failed update leaves a message in the card.

The updater needs `/var/run/docker.sock`. That is root-equivalent on the host;
only the fixed updater image has it. The image accepts a single `X.Y.Z` tag and
cannot run arbitrary commands.

### Manual fallback

If the updater profile is disabled, change `IMAGE_TAG` and `APP_VERSION` in the
install directory's `.env`, then pull and recreate:

```bash
# bundled Caddy
docker compose -f compose.ghcr.yml pull
docker compose -f compose.ghcr.yml up -d

# existing proxy
docker compose -f compose.ghcr.yml -f compose.override.yml pull db backend frontend updater
docker compose -f compose.ghcr.yml -f compose.override.yml up -d db backend frontend updater
```

The named volumes `postgres_data` and `backend_data` are never removed by these
commands. Back up `.env` separately: it contains the admin password and the
keys for stored Bambu credentials. Updates always use an explicit release tag,
never a build from `main`.
