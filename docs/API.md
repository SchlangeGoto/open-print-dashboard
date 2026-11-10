# API

Base path: `/api/v1`. All routes except `GET /setup/status`, the login routes
and password recovery require a bearer token.

## Print jobs

`PrintJob.status` is Bambu's `gcode_state` value. `4` means **running**:
`GET /prints/active` filters on it and the print-job sync uses it to decide
when a print has started or finished.
