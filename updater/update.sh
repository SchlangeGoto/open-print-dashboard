#!/bin/sh
# Watches /data/request for a release tag and updates only the backend and
# frontend images. The database and named volumes are never recreated.
set -eu
umask 077

DATA_DIR="${UPDATER_DATA_DIR:-/data}"
PROJECT_DIR="${UPDATER_PROJECT_DIR:-/project}"
STATE_FILE="$DATA_DIR/status"
READY_FILE="$DATA_DIR/ready"
HEARTBEAT_FILE="$DATA_DIR/heartbeat"
REQUEST_FILE="$DATA_DIR/request"
LOCK_DIR="$DATA_DIR/lock"
API_PREFIX="${API_V1_STR:-/api/v1}"
HEALTH_URL="${UPDATER_HEALTH_URL:-http://backend:8000${API_PREFIX}/utils/health-check/}"
FRONTEND_URL="${UPDATER_FRONTEND_URL:-http://frontend:3000/}"
HEALTH_ATTEMPTS="${UPDATER_HEALTH_ATTEMPTS:-60}"
ENV_FILE="$PROJECT_DIR/.env"
ENV_BACKUP="/tmp/opd-env.backup"

mkdir -p "$DATA_DIR"
touch "$READY_FILE" "$HEARTBEAT_FILE"
chmod 0644 "$READY_FILE" "$HEARTBEAT_FILE"
rm -rf "$LOCK_DIR" "$ENV_BACKUP"
rm -f "$DATA_DIR"/.pre-update-*.sql
# Keep the heartbeat fresh while a pull, dump or health loop blocks the main
# loop; the backend treats a stale heartbeat as "updater not responding".
( while :; do touch "$HEARTBEAT_FILE"; sleep 5; done ) &
HEARTBEAT_PID=$!
trap 'kill "$HEARTBEAT_PID" 2>/dev/null || true' EXIT INT TERM

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
  chmod 0644 "$STATE_FILE"
}

read_env() {
  sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null | head -n1 | sed "s/^'//;s/'$//"
}

compose() {
  if [ -f "$PROJECT_DIR/compose.override.yml" ]; then
    timeout "${UPDATER_COMPOSE_TIMEOUT:-900}" docker compose --env-file "$ENV_FILE" \
      -f "$PROJECT_DIR/compose.ghcr.yml" \
      -f "$PROJECT_DIR/compose.override.yml" "$@"
  else
    timeout "${UPDATER_COMPOSE_TIMEOUT:-900}" docker compose --env-file "$ENV_FILE" \
      -f "$PROJECT_DIR/compose.ghcr.yml" "$@"
  fi
}

wait_for_url() {
  url="$1"
  attempts="$2"
  attempt=0
  while [ "$attempt" -lt "$attempts" ]; do
    if wget -T 5 -q -O /dev/null "$url" 2>/dev/null; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 2
  done
  return 1
}

db_revision() {
  user=$(read_env POSTGRES_USER)
  database=$(read_env POSTGRES_DB)
  user=${user:-opd}
  database=${database:-openprintdashboard}
  compose exec -T db psql -U "$user" -d "$database" -tAc \
    'SELECT version_num FROM alembic_version' 2>/dev/null | tr -d '[:space:]'
}

backup_database() {
  user=$(read_env POSTGRES_USER)
  database=$(read_env POSTGRES_DB)
  user=${user:-opd}
  database=${database:-openprintdashboard}
  backup="$DATA_DIR/pre-update-$1.sql.gz"
  raw="$DATA_DIR/.pre-update-$1.sql"
  if compose exec -T db pg_dump -U "$user" -d "$database" \
      --no-owner --clean --if-exists > "$raw" &&
     [ -s "$raw" ] &&
     gzip -c "$raw" > "$backup"; then
    rm -f "$raw"
    # Keep only the two newest dumps.
    ls -1t "$DATA_DIR"/pre-update-*.sql.gz 2>/dev/null | tail -n +3 | xargs -r rm -f
    printf '%s\n' "$backup"
    return 0
  fi
  rm -f "$raw" "$backup"
  return 1
}

write_status idle "" "Waiting for an update request"
while true; do
  touch "$HEARTBEAT_FILE"
  if [ -f "$REQUEST_FILE" ] && mkdir "$LOCK_DIR" 2>/dev/null; then
    requested=$(head -n 1 "$REQUEST_FILE" | tr -d '[:space:]')
    rm -f "$REQUEST_FILE"
    if ! printf '%s' "$requested" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
      write_status error "$requested" "Release tag must be X.Y.Z"
      rmdir "$LOCK_DIR"
      sleep 5
      continue
    fi
    if [ ! -f "$ENV_FILE" ]; then
      write_status error "$requested" "Install directory has no .env"
      rmdir "$LOCK_DIR"
      sleep 5
      continue
    fi

    current=$(read_env IMAGE_TAG)
    old_revision=$(db_revision)
    if [ -z "$old_revision" ]; then
      write_status error "$requested" "Could not read the database migration revision"
      rmdir "$LOCK_DIR"
      sleep 5
      continue
    fi

    write_status running "$requested" "Backing up the database"
    if ! backup_path=$(backup_database "$requested"); then
      write_status error "$requested" "Database backup failed; update not started"
      rmdir "$LOCK_DIR"
      sleep 5
      continue
    fi

    write_status running "$requested" "Pulling $requested"
    cp "$ENV_FILE" "$ENV_BACKUP"
    chmod 600 "$ENV_BACKUP"

    grep -q '^IMAGE_TAG=' "$ENV_FILE" ||
      printf 'IMAGE_TAG=%s\n' "$current" >> "$ENV_FILE"
    grep -q '^APP_VERSION=' "$ENV_FILE" ||
      printf 'APP_VERSION=%s\n' "$current" >> "$ENV_FILE"
    if ! sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$requested/" "$ENV_FILE" ||
       ! sed -i "s/^APP_VERSION=.*/APP_VERSION=$requested/" "$ENV_FILE" ||
       ! grep -qx "IMAGE_TAG=$requested" "$ENV_FILE" ||
       ! grep -qx "APP_VERSION=$requested" "$ENV_FILE"; then
      cp "$ENV_BACKUP" "$ENV_FILE"
      chmod 600 "$ENV_FILE"
      write_status error "$requested" "Could not update .env"
      rm -f "$ENV_BACKUP"
      rmdir "$LOCK_DIR"
      sleep 5
      continue
    fi
    chmod 600 "$ENV_FILE"

    failed=0
    if ! compose pull backend frontend ||
       ! compose up -d --no-deps backend frontend ||
       ! wait_for_url "$HEALTH_URL" "$HEALTH_ATTEMPTS" ||
       ! wait_for_url "$FRONTEND_URL" "$HEALTH_ATTEMPTS"; then
      failed=1
    fi

    new_revision=$(db_revision)
    if [ "$failed" = 1 ]; then
      if [ -z "$new_revision" ]; then
        write_status error "$requested" \
          "Update failed and the database revision could not be verified. Automatic rollback skipped; restore $backup_path if needed."
      elif [ "$new_revision" != "$old_revision" ]; then
        write_status error "$requested" \
          "Update failed after a database migration. Automatic rollback skipped; restore $backup_path before downgrading."
      elif [ -n "$current" ]; then
        sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$current/" "$ENV_FILE"
        sed -i "s/^APP_VERSION=.*/APP_VERSION=$current/" "$ENV_FILE"
        chmod 600 "$ENV_FILE"
        if compose pull backend frontend >/dev/null 2>&1 &&
           compose up -d --no-deps backend frontend >/dev/null 2>&1 &&
           wait_for_url "$HEALTH_URL" "$HEALTH_ATTEMPTS" >/dev/null 2>&1 &&
           wait_for_url "$FRONTEND_URL" "$HEALTH_ATTEMPTS" >/dev/null 2>&1; then
          write_status error "$requested" "Update failed; previous version restored"
        else
          write_status error "$requested" \
            "Update and rollback failed; manual intervention required"
        fi
      else
        write_status error "$requested" "Update failed; no previous tag to restore"
      fi
    else
      write_status success "$requested" "Updated to $requested"
    fi
    rm -f "$ENV_BACKUP"
    rmdir "$LOCK_DIR"
  fi
  sleep 5
done
