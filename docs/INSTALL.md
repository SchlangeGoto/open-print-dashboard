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

For now, change `IMAGE_TAG` and `APP_VERSION` in the install directory's `.env`
to the new release (without the leading `v`), then pull and recreate:

```bash
# bundled Caddy
docker compose -f compose.ghcr.yml pull
docker compose -f compose.ghcr.yml up -d

# existing proxy
docker compose -f compose.ghcr.yml -f compose.override.yml pull db backend frontend
docker compose -f compose.ghcr.yml -f compose.override.yml up -d db backend frontend
```

The named volumes `postgres_data` and `backend_data` are never removed by these
commands. Back up `.env` separately: it contains the admin password and the
keys for stored Bambu credentials.

A dashboard-driven updater is the next step; until it lands, an update is an
explicit release-tag change, never a build from `main`.
