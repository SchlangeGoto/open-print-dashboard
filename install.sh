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
FORCE=0
EXISTING_ENV=0
PROJECT_NAME="openprintdashboard"
ADMIN_EMAIL_SET=0
ADMIN_PASSWORD_SET=0
PROJECT_NAME_SET=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --proxy) PROXY="$2"; shift 2 ;;
    --bind) BIND_ADDR="$2"; shift 2 ;;
    --port) APP_PORT="$2"; shift 2 ;;
    --api-port) API_PORT="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; ADMIN_EMAIL_SET=1; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="$2"; ADMIN_PASSWORD_SET=1; shift 2 ;;
    --non-interactive) NON_INTERACTIVE=1; shift ;;
    --force) FORCE=1; shift ;;
    --project-name) PROJECT_NAME="$2"; PROJECT_NAME_SET=1; shift 2 ;;
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
  --force               reuse the existing install's secrets and admin
  --project-name NAME   Compose project name (default: derived from --dir)

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
printf '%s' "$TAG" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$' || \
  die "Release tag must be vX.Y.Z"
case "$INSTALL_DIR" in
  *"'"*|*'"'*|*'$'*|*'`'*|*'\'*|*[[:cntrl:]]*) die "Install directory contains unsupported characters" ;;
esac
mkdir -p "$INSTALL_DIR/deploy" 2>/dev/null || die "Cannot create $INSTALL_DIR (use sudo or --dir)"
[ -w "$INSTALL_DIR" ] || die "$INSTALL_DIR is not writable (use sudo or --dir)"
if [ -e "$INSTALL_DIR/.env" ]; then
  if [ "$FORCE" != 1 ]; then
    die "Already installed in $INSTALL_DIR. Use --force to update the Compose files and keep its secrets."
  fi
  EXISTING_ENV=1
fi
if [ "$PROJECT_NAME_SET" = 0 ] && [ "$EXISTING_ENV" = 0 ]; then
  # Two installations on one host must not share Compose services or volumes.
  if [ "$INSTALL_DIR" = "$DEFAULT_DIR" ]; then
    PROJECT_NAME="openprintdashboard"
  else
    dir_name=$(basename "$INSTALL_DIR")
    dir_name=$(printf '%s' "$dir_name" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9_-' '-')
    dir_name=$(printf '%s' "$dir_name" | sed 's/-\{2,\}/-/g; s/^-//; s/-$//')
    dir_hash=$(printf '%s' "$INSTALL_DIR" | cksum | awk '{print $1}')
    PROJECT_NAME="openprintdashboard-${dir_name}-${dir_hash}"
  fi
fi
printf '%s' "$PROJECT_NAME" | grep -Eq '^[a-z0-9][a-z0-9_-]*$' || \
  die "Project name must contain lowercase letters, digits, dashes or underscores"

validate_safe() {
  case "$1" in
    *"'"*|*'"'*|*'$'*|*'`'*|*'\'*|*[[:cntrl:]]*)
      die "$2 contains characters that cannot be stored safely in .env (quote, dollar, backtick or backslash)"
      ;;
  esac
}

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
if [ -z "$DOMAIN" ] && [ "$PROXY" = "existing" ] && [ "$NON_INTERACTIVE" = 0 ]; then
  DOMAIN=$(ask "Public dashboard hostname for links (optional)" "")
fi
if [ -n "$DOMAIN" ]; then
  printf '%s' "$DOMAIN" | grep -Eq '^[A-Za-z0-9.-]+$' || die "Domain contains unsupported characters"
  validate_safe "$DOMAIN" "Domain"
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
printf '%s' "$BIND_ADDR" | grep -Eq '^[0-9A-Za-z._-]+$' || \
  die "Bind address must be an IPv4 address or hostname (IPv6 is not supported yet)"
for port in "$APP_PORT" "$API_PORT"; do
  printf '%s' "$port" | grep -Eq '^[0-9]+$' || die "Ports must be numbers"
  [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || die "Ports must be between 1 and 65535"
done

if [ "$EXISTING_ENV" = 1 ]; then
  [ "$ADMIN_EMAIL_SET" = 1 ] || ADMIN_EMAIL=""
  [ "$ADMIN_PASSWORD_SET" = 1 ] || ADMIN_PASSWORD=""
elif [ -z "$ADMIN_EMAIL" ]; then
  if [ "$NON_INTERACTIVE" = 1 ]; then
    ADMIN_EMAIL="admin@${DOMAIN:-example.com}"
  else
    ADMIN_EMAIL=$(ask "Admin email" "admin@${DOMAIN:-example.com}")
  fi
fi
if [ "$EXISTING_ENV" = 0 ] && [ -z "$ADMIN_PASSWORD" ]; then
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

if [ "$EXISTING_ENV" = 0 ]; then
  [ ${#ADMIN_PASSWORD} -ge 8 ] || die "Admin password must be at least 8 characters"
  printf '%s' "$ADMIN_EMAIL" | grep -Eq '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' || \
    die "Admin email must be a valid address with a domain"
  validate_safe "$ADMIN_EMAIL" "Admin email"
  validate_safe "$ADMIN_PASSWORD" "Admin password"
fi

blue "Installing OpenPrintDash $VERSION into $INSTALL_DIR"
cd "$INSTALL_DIR"

BASE_URL="${OPD_RELEASE_BASE_URL:-https://raw.githubusercontent.com/$REPO/$TAG}"
curl -fsSL "$BASE_URL/compose.ghcr.yml" -o compose.ghcr.yml || \
  die "Could not download compose.ghcr.yml for $TAG"
curl -fsSL "$BASE_URL/deploy/Caddyfile" -o deploy/Caddyfile || \
  die "Could not download deploy/Caddyfile for $TAG"

read_env() {
  sed -n "s/^$1=//p" .env 2>/dev/null | head -n1 | \
    sed -e "s/^'//" -e "s/'$//" -e 's/^"//' -e 's/"$//'
}

if [ "$EXISTING_ENV" = 1 ]; then
  cp .env ".env.bak.$(date +%s)"
  POSTGRES_USER=$(read_env POSTGRES_USER)
  POSTGRES_DB=$(read_env POSTGRES_DB)
  POSTGRES_PASSWORD=$(read_env POSTGRES_PASSWORD)
  SECRET_KEY=$(read_env SECRET_KEY)
  BAMBU_KEY=$(read_env BAMBU_CREDENTIALS_KEY)
  [ -n "$POSTGRES_PASSWORD" ] || die "Existing .env has no POSTGRES_PASSWORD"
  POSTGRES_USER=${POSTGRES_USER:-opd}
  POSTGRES_DB=${POSTGRES_DB:-openprintdashboard}
  printf '%s' "$POSTGRES_USER" | grep -Eq '^[A-Za-z0-9_]+$' || \
    die "Existing POSTGRES_USER contains unsupported characters"
  printf '%s' "$POSTGRES_DB" | grep -Eq '^[A-Za-z0-9_]+$' || \
    die "Existing POSTGRES_DB contains unsupported characters"
  validate_safe "$POSTGRES_PASSWORD" "POSTGRES_PASSWORD"
  validate_safe "$SECRET_KEY" "SECRET_KEY"
  validate_safe "$BAMBU_KEY" "BAMBU_CREDENTIALS_KEY"
  if [ "$ADMIN_EMAIL_SET" = 0 ]; then
    ADMIN_EMAIL=$(read_env FIRST_SUPERUSER)
  fi
  if [ "$ADMIN_PASSWORD_SET" = 0 ]; then
    ADMIN_PASSWORD=$(read_env FIRST_SUPERUSER_PASSWORD)
  fi
  existing_project=$(read_env COMPOSE_PROJECT_NAME)
  existing_project=${existing_project:-openprintdashboard}
  if [ "$PROJECT_NAME_SET" = 1 ] && [ "$PROJECT_NAME" != "$existing_project" ]; then
    die "Cannot change the Compose project name on an existing install; its volumes live under $existing_project"
  fi
  PROJECT_NAME=$existing_project
  if [ -n "$ADMIN_EMAIL" ] || [ -n "$ADMIN_PASSWORD" ]; then
    printf '%s' "$ADMIN_EMAIL" | grep -Eq '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' || \
      die "Admin email is invalid; fix .env or pass a valid --admin-email"
    [ ${#ADMIN_PASSWORD} -ge 8 ] || \
      die "Admin password is invalid; fix FIRST_SUPERUSER_PASSWORD in .env or pass --admin-password"
    validate_safe "$ADMIN_EMAIL" "Admin email"
    validate_safe "$ADMIN_PASSWORD" "Admin password"
  fi
  yellow "Reusing the existing secrets; admin values not overridden are kept."
fi
if [ "$EXISTING_ENV" = 1 ]; then
  # Empty SECRET_KEY/BAMBU_CREDENTIALS_KEY means "use the key persisted in
  # backend_data". Do not replace that with a new random key on --force.
  :
else
  POSTGRES_PASSWORD=$(openssl rand -hex 24)
  POSTGRES_USER=opd
  POSTGRES_DB=openprintdashboard
  SECRET_KEY=$(openssl rand -hex 32)
  BAMBU_KEY=$(openssl rand -hex 32)
fi
FRONTEND_HOST="http://localhost:${APP_PORT}"
[ -n "$DOMAIN" ] && FRONTEND_HOST="https://${DOMAIN}"

umask 077
{
  printf 'PROJECT_NAME=OpenPrintDash\n'
  printf 'COMPOSE_PROJECT_NAME=%s\n' "$(env_quote "$PROJECT_NAME")"
  printf 'DOMAIN=%s\n' "$(env_quote "$DOMAIN")"
  printf 'IMAGE_PREFIX=%s\n' "$IMAGE_PREFIX"
  printf 'IMAGE_TAG=%s\n' "$VERSION"
  printf 'APP_VERSION=%s\n' "$VERSION"
  printf 'POSTGRES_USER=%s\n' "$(env_quote "$POSTGRES_USER")"
  printf 'POSTGRES_PASSWORD=%s\n' "$(env_quote "$POSTGRES_PASSWORD")"
  printf 'POSTGRES_DB=%s\n' "$(env_quote "$POSTGRES_DB")"
  printf 'SECRET_KEY=%s\n' "$(env_quote "$SECRET_KEY")"
  printf 'BAMBU_CREDENTIALS_KEY=%s\n' "$(env_quote "$BAMBU_KEY")"
  printf 'FIRST_SUPERUSER=%s\n' "$(env_quote "$ADMIN_EMAIL")"
  printf 'FIRST_SUPERUSER_PASSWORD=%s\n' "$(env_quote "$ADMIN_PASSWORD")"
  printf 'FRONTEND_HOST=%s\n' "$(env_quote "$FRONTEND_HOST")"
  printf 'OPD_PROXY_MODE=%s\n' "$PROXY"
  printf 'COMPOSE_PROFILES=updater\n'
  if [ "$PROXY" = "existing" ]; then
    printf 'APP_BIND=%s\nAPP_PORT=%s\nAPI_BIND=%s\nAPI_PORT=%s\n' \
      "$(env_quote "$BIND_ADDR")" "$APP_PORT" "$(env_quote "$BIND_ADDR")" "$API_PORT"
  fi
} > .env
chmod 600 .env
umask 022

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

UPDATER_DISABLED=0
if grep -qx 'COMPOSE_PROFILES=updater' .env; then
  # Older releases predate the updater image. Install them without the
  # sidecar instead of failing the whole install on a missing image.
  if ! "${COMPOSE[@]}" --profile updater pull updater >/dev/null 2>&1; then
    sed -i '/^COMPOSE_PROFILES=updater$/d' .env
    chmod 600 .env
    UPDATER_DISABLED=1
    yellow "$VERSION has no updater image; dashboard updates are disabled."
  fi
fi
if [ "$UPDATER_DISABLED" = 1 ] && [ "$PROXY" = "existing" ]; then
  SERVICES=(db backend frontend)
fi

blue "Pulling OpenPrintDash $VERSION images…"
"${COMPOSE[@]}" pull ${SERVICES[@]+"${SERVICES[@]}"}

blue "Starting the stack…"
"${COMPOSE[@]}" up -d --wait ${SERVICES[@]+"${SERVICES[@]}"}
if [ "$PROXY" = "existing" ]; then
  # A previous bundled install may still be holding 80/443.
  "${COMPOSE[@]}" stop caddy >/dev/null 2>&1 || true
fi

green "OpenPrintDash $VERSION is starting."
printf '\n'
if [ "$PROXY" = "bundled" ]; then
  printf 'Dashboard: https://%s\n' "$DOMAIN"
  if [ -n "$ADMIN_EMAIL" ]; then
    printf 'Admin:     %s\n' "$ADMIN_EMAIL"
  fi
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
  if [ "$BIND_ADDR" = "0.0.0.0" ]; then
    PROXY_TARGET="<this-server>"
    printf 'Dashboard: http://<this-server>:%s (behind your proxy)\n' "$APP_PORT"
  else
    PROXY_TARGET="$BIND_ADDR"
    printf 'Dashboard: http://%s:%s (behind your proxy)\n' "$BIND_ADDR" "$APP_PORT"
  fi
  if [ "$BIND_ADDR" = "0.0.0.0" ]; then
    printf 'Backend:   http://<this-server>:%s\n' "$API_PORT"
  else
    printf 'Backend:   http://%s:%s\n' "$BIND_ADDR" "$API_PORT"
  fi
  cat <<GUIDE

Reverse proxy
  Route /api/* to ${PROXY_TARGET}:${API_PORT} and everything else to
  ${PROXY_TARGET}:${APP_PORT}. Keep both ports on loopback unless the proxy
  runs on another machine.

  Caddy:
    ${DOMAIN:-dashboard.example.com} {
      handle /api/* { reverse_proxy ${PROXY_TARGET}:${API_PORT} }
      handle { reverse_proxy ${PROXY_TARGET}:${APP_PORT} }
    }

  Nginx:
    location /api/ { proxy_pass http://${PROXY_TARGET}:${API_PORT}; }
    location /     { proxy_pass http://${PROXY_TARGET}:${APP_PORT}; }

  Port forwarding
    Forward only the ports your proxy listens on (normally 80/443). If the
    proxy is on another machine, restrict ${APP_PORT} and ${API_PORT} to that
    machine with a firewall rule.

GUIDE
fi

printf '\nData lives in the Compose volumes postgres_data and backend_data.\n'
printf 'The admin password is stored in %s/.env; keep that file backed up.\n' "$INSTALL_DIR"
printf 'To update later: change IMAGE_TAG (and APP_VERSION) in .env, then run\n'
if [ "$UPDATER_DISABLED" = 1 ]; then
  UPDATE_SERVICES="db backend frontend"
else
  UPDATE_SERVICES="db backend frontend updater"
fi
if [ "$PROXY" = "existing" ]; then
  printf '  docker compose --env-file .env -f compose.ghcr.yml -f compose.override.yml pull %s\n' "$UPDATE_SERVICES"
  printf '  docker compose --env-file .env -f compose.ghcr.yml -f compose.override.yml up -d %s\n' "$UPDATE_SERVICES"
else
  printf '  docker compose --env-file .env -f compose.ghcr.yml pull\n'
  printf '  docker compose --env-file .env -f compose.ghcr.yml up -d\n'
fi
