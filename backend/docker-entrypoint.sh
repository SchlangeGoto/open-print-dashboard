#!/bin/sh
set -e

# The named volume may have been created by an older root-running image. The
# backend may write only the request directory; status files stay root-owned.
mkdir -p /app/data /app/updater/request
chown -R app:app /app/data
chown root:1000 /app/updater
chmod 0755 /app/updater
chown -R app:app /app/updater/request
chmod 0700 /app/updater/request

exec runuser -u app -- "$@"
