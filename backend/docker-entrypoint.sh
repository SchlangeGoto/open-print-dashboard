#!/bin/sh
set -e

# The named volume may have been created by an older root-running image.
mkdir -p /app/data
chown -R app:app /app/data

exec runuser -u app -- "$@"
