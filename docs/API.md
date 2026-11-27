# API

Base path: `/api/v1`. All routes except `GET /setup/status`, the login routes
and password recovery require a bearer token.

## Authentication

Access tokens last 60 minutes. Refresh tokens are single-use, rotate on every
use and stay valid for 30 days of inactivity. The web client stores the refresh
token in `localStorage`; that is an accepted risk for a self-hosted install.
Moving it to an httpOnly cookie is a follow-up.

## Print jobs

`PrintJob.status` is Bambu's `gcode_state` value. `4` means **running**:
`GET /prints/active` filters on it and the print-job sync uses it to decide
when a print has started or finished.

## Updates

`GET /system/update` reports the running version, the latest stable GitHub
release and the updater sidecar state. `POST /system/update` with
`{"tag": "X.Y.Z"}` queues that release. Both routes require a superuser.

The sidecar pulls the tag, recreates only the backend and frontend containers,
and waits for the backend and frontend health checks. `state` is one of `idle`,
`queued`, `running`, `success`, `error`, `blocked`, `stale` or `unavailable`. A
`blocked` updater needs a manual restore: it rejects new requests and drops any
request that was queued before the journal got stuck. It takes a
`pg_dump` backup first, one file per attempt. If the new backend already
migrated the database, it does not roll back automatically; the status points
at the backup for a manual restore. A sidecar restart during an update restores
the previous tag when the migration revision did not change. Database and
upload volumes are never recreated.
