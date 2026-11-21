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
ENV_BACKUP="$DATA_DIR/env.backup"
JOURNAL_FILE="$DATA_DIR/journal"

mkdir -p "$DATA_DIR"
rm -rf "$LOCK_DIR"
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
  # The backend runs as a non-root user and must be able to read this. Set the
  # mode before the rename so readers never observe a 0600 file.
  chmod 0644 "$tmp"
  mv "$tmp" "$STATE_FILE"
}

read_env() {
  sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null | head -n1 | \
    sed -e "s/^'//" -e "s/'$//" -e 's/^"//' -e 's/"$//'
}

journal_get() {
  sed -n "s/^$1=//p" "$JOURNAL_FILE" 2>/dev/null | head -n1
}

journal_phase() {
  sed -n 's/^phase=//p' "$JOURNAL_FILE" 2>/dev/null | tail -n1
}

write_journal() {
  # previous old_revision backup requested
  {
    printf 'previous=%s\n' "$1"
    printf 'old_revision=%s\n' "$2"
    printf 'backup=%s\n' "$3"
    printf 'requested=%s\n' "$4"
    printf 'phase=updating\n'
  } > "$JOURNAL_FILE"
  chmod 600 "$JOURNAL_FILE"
}

mark_journal_healthy() {
  printf 'phase=healthy\n' >> "$JOURNAL_FILE"
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
  backup="$DATA_DIR/pre-update-$1-$(date -u +%Y%m%dT%H%M%SZ)-$$.sql.gz"
  raw="$DATA_DIR/.pre-update-$1-$$.sql"
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

reconcile_interrupted() {
  [ -f "$JOURNAL_FILE" ] || return 0
  previous=$(journal_get previous)
  old_revision=$(journal_get old_revision)
  backup=$(journal_get backup)
  requested=$(journal_get requested)
  phase=$(journal_phase)
  current_revision=$(db_revision)

  if [ "$phase" = "healthy" ] && [ -n "$requested" ]; then
    write_status success "$requested" "Updated to $requested"
    rm -f "$JOURNAL_FILE" "$ENV_BACKUP"
    return 0
  fi
  if [ -z "$previous" ] || [ -z "$old_revision" ] || [ -z "$current_revision" ]; then
    write_status error "$requested" \
      "An update was interrupted. Check the running version and restore $backup if needed."
    rm -f "$JOURNAL_FILE"
    return 0
  fi
  if [ "$current_revision" != "$old_revision" ]; then
    write_status error "$requested" \
      "An update was interrupted after a database migration. Restore $backup before downgrading."
    rm -f "$JOURNAL_FILE"
    return 0
  fi
  if [ ! -f "$ENV_BACKUP" ]; then
    write_status error "$requested" \
      "An update was interrupted and its .env backup is missing. Check the running version."
    rm -f "$JOURNAL_FILE"
    return 0
  fi

  cp "$ENV_BACKUP" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  if compose pull backend frontend >/dev/null 2>&1 &&
     compose up -d --no-deps backend frontend >/dev/null 2>&1 &&
     wait_for_url "$HEALTH_URL" "$HEALTH_ATTEMPTS" >/dev/null 2>&1 &&
     wait_for_url "$FRONTEND_URL" "$HEALTH_ATTEMPTS" >/dev/null 2>&1; then
    write_status error "$requested" \
      "Interrupted update recovered; previous version restored"
  else
    write_status error "$requested" \
      "Interrupted update could not be recovered automatically. Manual intervention required."
  fi
  rm -f "$JOURNAL_FILE" "$ENV_BACKUP"
}

if [ -f "$JOURNAL_FILE" ]; then
  reconcile_interrupted
else
  write_status idle "" "Waiting for an update request"
fi
touch "$READY_FILE" "$HEARTBEAT_FILE"
chmod 0644 "$READY_FILE" "$HEARTBEAT_FILE"
[ -f "$JOURNAL_FILE" ] || rm -f "$ENV_BACKUP"
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
    write_journal "$current" "$old_revision" "$backup_path" "$requested"

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
      rm -f "$ENV_BACKUP" "$JOURNAL_FILE"
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

    if [ "$failed" = 1 ]; then
      # Stop the new backend before reading the revision. An unfinished
      # migration transaction is rolled back when its connection closes;
      # rolling back while it still runs could put old code on a new schema.
      if ! compose stop backend >/dev/null 2>&1; then
        write_status error "$requested" \
          "Update failed and the new backend could not be stopped. Manual intervention required."
        rm -f "$ENV_BACKUP" "$JOURNAL_FILE"
        rmdir "$LOCK_DIR"
        sleep 5
        continue
      fi
    fi
    new_revision=$(db_revision)
    if [ "$failed" = 1 ]; then
      if [ -z "$new_revision" ]; then
        compose up -d --no-deps backend frontend >/dev/null 2>&1 || true
        write_status error "$requested" \
          "Update failed and the database revision could not be verified. Automatic rollback skipped; restore $backup_path if needed."
      elif [ "$new_revision" != "$old_revision" ]; then
        compose up -d --no-deps backend frontend >/dev/null 2>&1 || true
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
        compose up -d --no-deps backend frontend >/dev/null 2>&1 || true
        write_status error "$requested" "Update failed; no previous tag to restore"
      fi
    else
      mark_journal_healthy
      write_status success "$requested" "Updated to $requested"
    fi
    rm -f "$ENV_BACKUP" "$JOURNAL_FILE"
    rmdir "$LOCK_DIR"
  fi
  sleep 5
done
