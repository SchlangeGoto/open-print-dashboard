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
