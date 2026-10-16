#! /usr/bin/env bash

set -e
set -x

# Run migrations and initial data, then start the server.
# A single worker is required: the printer connection and the pending Bambu
# login are kept in process memory.
bash scripts/prestart.sh

exec fastapi run --host 0.0.0.0 --port 8000
