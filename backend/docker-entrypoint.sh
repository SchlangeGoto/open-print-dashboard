#!/bin/sh
set -e

# The named volume may have been created by an older root-running image.
mkdir -p /app/data /app/updater
chown -R app:app /app/data /app/updater

exec runuser -u app -- "$@"
