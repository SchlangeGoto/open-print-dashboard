#!/usr/bin/env bash
# Guided installer for OpenPrintDash. It downloads only the Compose file and
# Caddy config for one release, writes .env, and starts the published images.
# No repository clone is required.
set -euo pipefail

REPO="SchlangeGoto/open-print-dashboard"
IMAGE_PREFIX="ghcr.io/schlangegoto/open-print-dashboard"
DEFAULT_DIR="/opt/openprintdashboard"

blue() { printf '\033[1;34m%s\033[0m\n' "$*"; }
green() { printf '\033[1;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[1;33m%s\033[0m\n' "$*"; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"; }

ask() {
  local prompt="$1" default="${2:-}" value
  if [ -n "$default" ]; then
    read -r -p "$prompt [$default]: " value < /dev/tty
    printf '%s' "${value:-$default}"
  else
    read -r -p "$prompt: " value < /dev/tty
    printf '%s' "$value"
  fi
}

ask_secret() {
  local prompt="$1" value
  read -r -s -p "$prompt: " value < /dev/tty
  printf '\n' >&2
  printf '%s' "$value"
}

env_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

TAG=""
DOMAIN=""
PROXY=""
BIND_ADDR="127.0.0.1"
APP_PORT="3000"
API_PORT="8000"
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
INSTALL_DIR="${OPD_INSTALL_DIR:-$DEFAULT_DIR}"
NON_INTERACTIVE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --proxy) PROXY="$2"; shift 2 ;;
    --bind) BIND_ADDR="$2"; shift 2 ;;
    --port) APP_PORT="$2"; shift 2 ;;
    --api-port) API_PORT="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
    --non-interactive) NON_INTERACTIVE=1; shift ;;
    -h|--help)
      cat <<USAGE
OpenPrintDash installer

  --dir DIR             install directory (default $DEFAULT_DIR)
  --domain HOST         public dashboard hostname
  --tag vX.Y.Z          release to install (default: latest GitHub release)
  --proxy bundled       run the bundled Caddy TLS proxy (default)
  --proxy existing      use an existing reverse proxy; app binds to loopback
  --bind ADDRESS        bind address for the app ports with --proxy existing
  --port PORT           frontend port with --proxy existing (default 3000)
  --api-port PORT       backend port with --proxy existing (default 8000)
  --admin-email EMAIL   first superuser email
  --admin-password PASS first superuser password (default: generated)
  --non-interactive     fail instead of prompting for missing values

Example:
  curl -fsSL https://raw.githubusercontent.com/$REPO/main/install.sh | bash
USAGE
      exit 0 ;;
    *) die "Unknown option: $1 (use --help)" ;;
  esac
done

need curl
need docker
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required"
need openssl

if [ -z "$TAG" ]; then
  blue "Looking up the latest OpenPrintDash release…"
  release_json=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest") || \
    die "Could not read the latest release. Pass --tag vX.Y.Z."
  TAG=$(printf '%s' "$release_json" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
  [ -n "$TAG" ] || die "Could not determine the latest release tag. Pass --tag vX.Y.Z."
fi
TAG="v${TAG#v}"
VERSION="${TAG#v}"

if [ -z "$PROXY" ]; then
  if [ "$NON_INTERACTIVE" = 1 ]; then
    PROXY="bundled"
  else
    blue "How should the dashboard be exposed?"
    printf '  1) Let OpenPrintDash run Caddy and obtain TLS for me (recommended)\n'
    printf '  2) I already have a reverse proxy (Caddy, Nginx, Traefik, …)\n'
    choice=$(ask "Choose 1 or 2" "1")
    case "$choice" in
      2) PROXY="existing" ;;
      *) PROXY="bundled" ;;
    esac
  fi
fi
case "$PROXY" in
  bundled|existing) ;;
  *) die "--proxy must be 'bundled' or 'existing'" ;;
esac

if [ -z "$DOMAIN" ] && [ "$PROXY" = "bundled" ]; then
  [ "$NON_INTERACTIVE" = 1 ] && die "--domain is required with --proxy bundled"
  DOMAIN=$(ask "Dashboard domain (for example print.example.com)")
  [ -n "$DOMAIN" ] || die "A domain is required for automatic TLS"
fi

if [ "$PROXY" = "existing" ] && [ "$NON_INTERACTIVE" = 0 ]; then
  blue "Where does your reverse proxy run?"
  printf '  1) Same host (app ports stay on 127.0.0.1)\n'
  printf '  2) Another machine (app ports bind to the network)\n'
  choice=$(ask "Choose 1 or 2" "1")
  if [ "$choice" = "2" ]; then
    BIND_ADDR="0.0.0.0"
    yellow "The app ports will be reachable from the network. Restrict them with a firewall."
  fi
  APP_PORT=$(ask "Frontend port" "$APP_PORT")
  API_PORT=$(ask "Backend API port" "$API_PORT")
fi

if [ -z "$ADMIN_EMAIL" ]; then
  if [ "$NON_INTERACTIVE" = 1 ]; then
    ADMIN_EMAIL="admin@${DOMAIN:-localhost}"
  else
    ADMIN_EMAIL=$(ask "Admin email" "admin@${DOMAIN:-localhost}")
  fi
fi
if [ -z "$ADMIN_PASSWORD" ]; then
  if [ "$NON_INTERACTIVE" = 1 ]; then
    ADMIN_PASSWORD=$(openssl rand -hex 16)
  else
    ADMIN_PASSWORD=$(ask_secret "Admin password (leave empty to generate one)")
    if [ -z "$ADMIN_PASSWORD" ]; then
      ADMIN_PASSWORD=$(openssl rand -hex 16)
      yellow "Generated admin password: $ADMIN_PASSWORD"
    fi
  fi
fi
[ ${#ADMIN_PASSWORD} -ge 8 ] || die "Admin password must be at least 8 characters"

blue "Installing OpenPrintDash $VERSION into $INSTALL_DIR"
mkdir -p "$INSTALL_DIR/deploy"
cd "$INSTALL_DIR"

BASE_URL="https://raw.githubusercontent.com/$REPO/$TAG"
curl -fsSL "$BASE_URL/compose.ghcr.yml" -o compose.ghcr.yml || \
  die "Could not download compose.ghcr.yml for $TAG"
curl -fsSL "$BASE_URL/deploy/Caddyfile" -o deploy/Caddyfile || \
  die "Could not download deploy/Caddyfile for $TAG"

POSTGRES_PASSWORD=$(openssl rand -hex 24)
SECRET_KEY=$(openssl rand -hex 32)
BAMBU_KEY=$(openssl rand -hex 32)
FRONTEND_HOST="http://localhost:${APP_PORT}"
[ -n "$DOMAIN" ] && FRONTEND_HOST="https://${DOMAIN}"

{
  printf 'PROJECT_NAME=OpenPrintDash\n'
  printf 'DOMAIN=%s\n' "$(env_quote "$DOMAIN")"
  printf 'IMAGE_PREFIX=%s\n' "$IMAGE_PREFIX"
  printf 'IMAGE_TAG=%s\n' "$VERSION"
  printf 'APP_VERSION=%s\n' "$VERSION"
  printf 'POSTGRES_USER=opd\n'
  printf 'POSTGRES_PASSWORD=%s\n' "$(env_quote "$POSTGRES_PASSWORD")"
  printf 'POSTGRES_DB=openprintdashboard\n'
  printf 'SECRET_KEY=%s\n' "$(env_quote "$SECRET_KEY")"
  printf 'BAMBU_CREDENTIALS_KEY=%s\n' "$(env_quote "$BAMBU_KEY")"
  printf 'FIRST_SUPERUSER=%s\n' "$(env_quote "$ADMIN_EMAIL")"
  printf 'FIRST_SUPERUSER_PASSWORD=%s\n' "$(env_quote "$ADMIN_PASSWORD")"
  printf 'FRONTEND_HOST=%s\n' "$(env_quote "$FRONTEND_HOST")"
  printf 'OPD_PROXY_MODE=%s\n' "$PROXY"
  printf 'COMPOSE_PROFILES=updater\n' 
  if [ "$PROXY" = "existing" ]; then
    printf 'APP_BIND=%s\nAPP_PORT=%s\nAPI_BIND=%s\nAPI_PORT=%s\n' \
      "$BIND_ADDR" "$APP_PORT" "$BIND_ADDR" "$API_PORT"
  fi
} > .env
chmod 600 .env

if [ "$PROXY" = "existing" ]; then
  cat > compose.override.yml <<'YAML'
services:
  frontend:
    ports:
      - "${APP_BIND:-127.0.0.1}:${APP_PORT:-3000}:3000"
  backend:
    ports:
      - "${API_BIND:-127.0.0.1}:${API_PORT:-8000}:8000"
YAML
else
  rm -f compose.override.yml
fi

COMPOSE=(docker compose --env-file .env -f compose.ghcr.yml)
SERVICES=()
if [ "$PROXY" = "existing" ]; then
  COMPOSE+=(-f compose.override.yml)
  SERVICES=(db backend frontend updater)
fi

blue "Pulling OpenPrintDash $VERSION images…"
"${COMPOSE[@]}" pull "${SERVICES[@]}"

blue "Starting the stack…"
"${COMPOSE[@]}" up -d "${SERVICES[@]}"

green "OpenPrintDash $VERSION is starting."
printf '\n'
if [ "$PROXY" = "bundled" ]; then
  printf 'Dashboard: https://%s\n' "$DOMAIN"
  printf 'Admin:     %s\n' "$ADMIN_EMAIL"
  cat <<'GUIDE'

Port forwarding
  1. Point the DNS A/AAAA record for the domain at this server.
  2. Forward TCP 80 and 443 from your router/firewall to this host.
  3. Allow 80/tcp and 443/tcp in the host firewall, for example:
       sudo ufw allow 80/tcp
       sudo ufw allow 443/tcp
  Caddy obtains and renews the TLS certificate automatically.

GUIDE
else
  printf 'Dashboard: http://%s:%s (behind your proxy)\n' "$BIND_ADDR" "$APP_PORT"
  printf 'Backend:   http://%s:%s\n' "$BIND_ADDR" "$API_PORT"
  cat <<GUIDE

Reverse proxy
  Route /api/* to 127.0.0.1:${API_PORT} and everything else to
  127.0.0.1:${APP_PORT}. Keep both ports on loopback unless the proxy runs on
  another machine.

  Caddy:
    ${DOMAIN:-dashboard.example.com} {
      handle /api/* { reverse_proxy 127.0.0.1:${API_PORT} }
      handle { reverse_proxy 127.0.0.1:${APP_PORT} }
    }

  Nginx:
    location /api/ { proxy_pass http://127.0.0.1:${API_PORT}; }
    location /     { proxy_pass http://127.0.0.1:${APP_PORT}; }

  Port forwarding
    Forward only the ports your proxy listens on (normally 80/443). If the
    proxy is on another machine, restrict ${APP_PORT} and ${API_PORT} to that
    machine with a firewall rule.

GUIDE
fi

printf '\nData lives in the Compose volumes postgres_data and backend_data.\n'
printf 'The admin password is stored in %s/.env; keep that file backed up.\n' "$INSTALL_DIR"
printf 'To update later: change IMAGE_TAG (and APP_VERSION) in .env, then run\n'
if [ "$PROXY" = "existing" ]; then
  printf '  docker compose -f compose.ghcr.yml -f compose.override.yml pull db backend frontend\n'
  printf '  docker compose -f compose.ghcr.yml -f compose.override.yml up -d db backend frontend\n'
else
  printf '  docker compose -f compose.ghcr.yml pull\n'
  printf '  docker compose -f compose.ghcr.yml up -d\n'
fi
