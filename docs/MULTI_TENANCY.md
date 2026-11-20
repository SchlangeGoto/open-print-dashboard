# Multi-tenancy

One deployment can host several independent dashboards. Every tenant has its
own printers, filament, spools, print history, Bambu Cloud account and settings.
Users are global: one login can be a member of several tenants.

## Data model

| Table | Scope | Notes |
| --- | --- | --- |
| `user` | global | Email is unique instance-wide |
| `tenant` | global | `slug` is unique, `is_active` gates access |
| `membership` | `(tenant_id, user_id)` | One role per user per tenant |
| `tenantinvite` | tenant | Token hash only; raw link is shown once |
| `auditlog` | tenant | Who changed what; actor is `SET NULL` on user delete |
| `printer`, `filament`, `spool`, `printjob`, `filamentbarcode`, `appsetting` | tenant | Every row carries `tenant_id` |

The migration creates a fixed `Default` tenant (`00000000-0000-0000-0000-000000000001`).
Existing rows are backfilled into it, the oldest superuser becomes its owner and
other existing accounts become operators. Do not delete the Default tenant: it
is the fallback used before a tenant is chosen and by model defaults.

## Tenant selection

Requests send either:

```http
X-Tenant-ID: <uuid>
```

or:

```http
X-Tenant-Slug: <slug>
```

Rules:

- One active membership and no header: that tenant is used.
- Several active memberships and no header: `400` with
  `{"code": "tenant_required", "tenants": [...]}`.
- Unknown tenant, inactive tenant, or a tenant the caller is not a member of:
  `404` (no tenant enumeration).
- Platform superusers may select any active tenant and receive owner rights
  without a membership.

`GET /api/v1/me/tenants` lists the caller's choices. The web and mobile clients
persist the selection and send the header on every request.

## Roles

| Permission | owner | admin | operator | viewer |
| --- | --- | --- | --- | --- |
| Read printers/filaments/spools/prints/settings | yes | yes | yes | yes |
| Write printers/filaments/spools, delete prints | yes | yes | yes | no |
| Settings write, Bambu manage, users, tenant settings | yes | yes | no | no |
| Delete the tenant | yes | no | no | no |

An owner is unique per tenant. Promoting another owner demotes the previous one
to admin. The last owner cannot be demoted or removed.

## Operations

### Health

```bash
curl -H "Authorization: Bearer $TOKEN" \
     -H "X-Tenant-ID: $TENANT_ID" \
     https://dashboard.example.com/api/v1/tenants/current/health
```

Returns the Bambu account state, configured printer count, MQTT connection state
and the age of the last report for each configured printer.

### Audit log

Owner and admin only:

```bash
GET /api/v1/tenants/current/audit?limit=100
```

Recorded actions include tenant settings, member role/removal, invites, printer
create/update/delete, filament/spool create/delete/activate, print deletion,
Bambu login/logout and setup skip.

### Export

Owner and admin only:

```bash
GET /api/v1/tenants/current/export
```

Returns tenant metadata, members, printers, filaments, spools, print jobs and
settings as JSON. Bambu credentials and printer access codes are omitted. This
is a convenience export, not a restorable backup.

### Delete

Platform superuser only, and the request must repeat the slug:

```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"slug": "customer-a"}' \
     https://dashboard.example.com/api/v1/tenants/<tenant-uuid>
```

The Default tenant cannot be deleted. Deleting a tenant cascades to its
printers, inventory, print history, settings, memberships, invites and audit
log.

### Quotas

Set in `.env`:

```dotenv
TENANT_MAX_PRINTERS=0   # 0 = unlimited
TENANT_MAX_USERS=0      # members + pending invites
TENANT_RATE_LIMIT_PER_MINUTE=0  # 0 = unlimited; keyed by tenant header
```

Printer creation and invite creation return `409` when the quota is reached.
Rate limiting returns `429` with `Retry-After` and is process-local, matching
the documented single-worker deployment.

## Backup and restore

All tenants share one PostgreSQL database. Prefer a full database backup:

```bash
docker compose -f compose.prod.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > openprint-$(date +%F).dump
```

Restore into a fresh, empty database before starting the backend:

```bash
docker compose -f compose.prod.yml stop backend
docker compose -f compose.prod.yml exec -T db \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < openprint-2026-11-20.dump
docker compose -f compose.prod.yml up -d backend
```

The backend runs `alembic upgrade head` on start, so a dump from an older
release is migrated forward. There is no per-tenant restore; restoring one
tenant means restoring the whole database and deleting the other tenants
afterwards, which requires the slug-confirmed delete above.

Keep the `data` volume: it contains `secret_key`, which decrypts the stored
Bambu credentials. A database restore without the matching key makes every
Bambu account look disconnected.

## Tests

`backend/tests/test_route_inventory.py` fails when a new API route is added
without being classified as global or tenant-scoped. Cross-tenant access and
role checks live in `backend/tests/api/routes/test_tenants.py`,
`test_invites.py` and `test_operations.py`.
