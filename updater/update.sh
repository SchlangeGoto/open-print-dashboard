#!/bin/sh
# Watches /data/request for a release tag and updates only the backend and
# frontend images. The database and named volumes are never touched.
set -eu

DATA_DIR="${UPDATER_DATA_DIR:-/data}"
PROJECT_DIR="${UPDATER_PROJECT_DIR:-/project}"
STATE_FILE="$DATA_DIR/status"
READY_FILE="$DATA_DIR/ready"
REQUEST_FILE="$DATA_DIR/request"
LOCK_DIR="$DATA_DIR/lock"
HEALTH_URL="${UPDATER_HEALTH_URL:-http://backend:8000/api/v1/utils/health-check/}"
HEALTH_ATTEMPTS="${UPDATER_HEALTH_ATTEMPTS:-60}"

mkdir -p "$DATA_DIR"
touch "$READY_FILE"
rm -rf "$LOCK_DIR"

write_status() {
  state="$1"
  tag="$2"
  message="$3"
  tmp="$STATE_FILE.tmp.$$"
  {
    printf 'state=%s\n' "$state"
    printf 'tag=%s\n' "$tag"
    printf 'message=%s\n' "$message"
    printf 'updated_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$tmp"
  mv "$tmp" "$STATE_FILE"
}

compose() {
  if grep -q '^OPD_PROXY_MODE=existing' "$PROJECT_DIR/.env" 2>/dev/null; then
    docker compose --env-file "$PROJECT_DIR/.env" \
      -f "$PROJECT_DIR/compose.ghcr.yml" \
      -f "$PROJECT_DIR/compose.override.yml" "$@"
  else
    docker compose --env-file "$PROJECT_DIR/.env" \
      -f "$PROJECT_DIR/compose.ghcr.yml" "$@"
  fi
}

wait_for_backend() {
  attempt=0
  while [ "$attempt" -lt "$HEALTH_ATTEMPTS" ]; do
    if wget -q -O /dev/null "$HEALTH_URL" 2>/dev/null; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 2
  done
  return 1
}

write_status idle "" "Waiting for an update request"
while true; do
  if [ -f "$REQUEST_FILE" ] && mkdir "$LOCK_DIR" 2>/dev/null; then
    requested=$(head -n 1 "$REQUEST_FILE" | tr -d '[:space:]')
    rm -f "$REQUEST_FILE"
    if ! printf '%s' "$requested" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
      write_status error "$requested" "Release tag must be X.Y.Z"
      rmdir "$LOCK_DIR"
      sleep 5
      continue
    fi

    current=$(sed -n 's/^IMAGE_TAG=//p' "$PROJECT_DIR/.env" | head -n1)
    write_status running "$requested" "Pulling $requested"
    cp "$PROJECT_DIR/.env" "$DATA_DIR/env.backup"

    if ! sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$requested/" "$PROJECT_DIR/.env" ||
       ! sed -i "s/^APP_VERSION=.*/APP_VERSION=$requested/" "$PROJECT_DIR/.env"; then
      cp "$DATA_DIR/env.backup" "$PROJECT_DIR/.env"
      write_status error "$requested" "Could not update .env"
      rmdir "$LOCK_DIR"
      sleep 5
      continue
    fi

    if ! compose pull backend frontend ||
       ! compose up -d --no-deps backend frontend ||
       ! wait_for_backend; then
      write_status error "$requested" "Update failed; rolling back to $current"
      if [ -n "$current" ]; then
        sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$current/" "$PROJECT_DIR/.env"
        sed -i "s/^APP_VERSION=.*/APP_VERSION=$current/" "$PROJECT_DIR/.env"
        compose pull backend frontend >/dev/null 2>&1 || true
        compose up -d --no-deps backend frontend >/dev/null 2>&1 || true
        wait_for_backend || true
      fi
      write_status error "$requested" "Update failed; previous version restored"
    else
      write_status success "$requested" "Updated to $requested"
    fi
    rmdir "$LOCK_DIR"
  fi
  sleep 5
done
