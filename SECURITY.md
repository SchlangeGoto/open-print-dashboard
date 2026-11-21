# Security policy

## Supported versions

Security fixes are applied to the `main` branch and the latest release. Older
releases may not receive fixes.

## Reporting a vulnerability

Please do **not** open a public issue for security problems.

Use GitHub's private vulnerability reporting:

1. Open the [private vulnerability report form](https://github.com/SchlangeGoto/open-print-dashboard/security/advisories/new).
2. Describe the issue and its impact. The report stays private until it is resolved.

If private reporting is unavailable, contact the maintainer through the
repository's security contact rather than posting details publicly.

Include:

- A description of the issue and its impact.
- Steps to reproduce, or a proof of concept.
- Affected version or commit.
- Any suggested fix or mitigation.

## Scope

Security-relevant areas include:

- Authentication, session handling, refresh tokens, and password recovery.
- Secrets, API keys, printer access codes, and serial numbers.
- SQL injection, command injection, path traversal, and unsafe deserialization.
- Docker/Compose deployment defaults, exposed services, and permissions.
- Dependency vulnerabilities in backend, frontend, mobile, and site packages.
- Cross-site scripting or request forgery in the dashboard.
- Mobile credential storage and local-network communication.

## Please remove secrets

Before posting logs or screenshots, remove:

- `.env` values
- Bambu Lab access codes and serial numbers
- API keys and tokens
- Database passwords
- Personal or network-identifying information

## Response

This is a small, self-hosted project maintained on a best-effort basis. Reports
will be acknowledged as soon as possible, and fixes will be released when they
are ready.


## Updater trust boundary

The optional `updater` sidecar mounts `/var/run/docker.sock`, which is
root-equivalent on the host. A dashboard superuser can queue only a validated
release tag, and the sidecar runs a fixed Compose command, but the socket means
a compromised sidecar image or host checkout is host-root. Disable the
`updater` profile if that trade-off is not acceptable, and update manually.

The backend mounts only the request directory of the status volume. Status,
heartbeat and the recovery journal are root-owned, so a compromised backend
cannot rewrite `.env` or point the updater at another image registry.
