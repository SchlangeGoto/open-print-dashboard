#! /usr/bin/env bash

set -e
set -x

# Run migrations and initial data, then start the server.
# A single worker is required: the printer connection and the pending Bambu
# login are kept in process memory.
bash scripts/prestart.sh

if [ "${WEB_CONCURRENCY:-1}" -gt 1 ]; then
  echo "WEB_CONCURRENCY must be 1: the printer connection registry is in process memory." >&2
  exit 1
fi

exec fastapi run --host 0.0.0.0 --port 8000
