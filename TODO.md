# TODO

Last updated: 2026-11-11.

This is the single backlog for the project. It combines the human review
comments from PRs #4–#10, the CodeRabbit findings from those PRs, and product
decisions made while consolidating into PR #20.

**Source legend**

| Tag | Meaning |
| --- | --- |
| `Human #N` | Review comment by SchlangeGoto on PR #N, posted 2026-11-09 ~20:18 UTC |
| `CR #N` | CodeRabbit inline finding on PR #N, posted 2026-11-10 09:19–09:26 UTC |
| `Human #N + CR #N` | Both found the same issue |
| `Product` | Decision from the user, not a review finding |

Issues already fixed on `feat/marketing-site` are listed in
[Done](#5-done-for-reference) so they are not re-litigated.

---

## 1. Multi-tenancy (epic)

**Goal:** one deployment hosts independent dashboards for multiple customers.
Each tenant has its own printers, inventory, print history, Bambu account,
settings and users. A platform admin creates tenants; every tenant has its own
admins, who create users and assign permissions.

**Why:** the current app is multi-login but single-tenant. `Printer`, `Filament`,
`Spool` and `PrintJob` have no owner, Bambu credentials live in one global
`AppSetting` table, and `printer_service.clients` is keyed by serial only. Two
customers on one instance would see and control each other's printers.

**Out of scope for the first cut:** billing, per-tenant custom domains,
per-tenant themes.

### Phases and tasks

#### T-01 — Tenant and membership schema

- `Tenant`: `id`, `name`, `slug` (unique), `is_active`, `created_at`,
  `updated_at`.
- `Membership`: `id`, `tenant_id`, `user_id`, `role`, `created_at`,
  unique `(tenant_id, user_id)`.
- `TenantInvite`: `id`, `tenant_id`, `email`, `role`, `token_hash`,
  `expires_at`, `invited_by`, `accepted_at`.
- Keep `User` global (email unique instance-wide). One login can belong to
  several tenants; the tenant is chosen per request, not baked into the user.
- Roles: `owner`, `admin`, `operator`, `viewer`. `owner` is unique per tenant
  and can delete it; `admin` manages users and settings; `operator` edits
  printers and inventory; `viewer` is read-only.
- Migration: create `tenant` and `membership`, create a `Default` tenant,
  make the existing superuser its `owner`, backfill every row.

**Acceptance:** existing installs migrate to `Default` with no data loss; a
user can be a member of two tenants with different roles.

#### T-02 — Permissions

- Fixed permission set, checked per route:
  `printers.read`, `printers.write`, `filaments.read`, `filaments.write`,
  `spools.read`, `spools.write`, `prints.read`, `prints.delete`,
  `settings.read`, `settings.write`, `bambu.manage`, `users.read`,
  `users.write`, `tenant.manage`.
- `require_permission("spools.write")` dependency, plus
  `require_tenant_admin()`.
- Role → permission matrix in one module; tests for every role.
- Custom roles are a later extension (a `role_permission` table), not phase 1.

**Acceptance:** a `viewer` cannot mutate anything; an `operator` cannot manage
users or Bambu credentials; a tenant admin cannot touch another tenant.

#### T-03 — Tenant-scope the data model

- Add `tenant_id` (FK, indexed, non-null after backfill) to `Printer`,
  `Filament`, `Spool`, `PrintJob`, `FilamentBarcode`, and the settings table.
- Per-tenant unique indexes: `printer.serial`, `filamentbarcode.code`,
  `(tenant_id, ...)` as appropriate. Drop the global ones.
- Introduce `TenantSessionDep` and make every query start from the tenant.
  No repository call should be reachable without a tenant id.
- `PrintJob` can be reached through printer/spool, but carry `tenant_id` for
  direct queries and for deleting a tenant.
- IDOR tests: a user in tenant A cannot read, update or delete any object from
  tenant B by guessing a UUID.

**Acceptance:** cross-tenant access always returns 404/403, never data.

#### T-04 — Tenant resolution

- `GET /api/v1/me/tenants` returns the caller's memberships.
- Requests carry `X-Tenant-ID` (UUID) or `X-Tenant-Slug`. A `CurrentTenant`
  dependency validates the membership and rejects unknown/inactive tenants.
- Platform superusers can switch to any tenant. Everyone else only to their
  memberships.
- For one release, a request without the header falls back to the caller's
  only membership. If they have several, return 400 with a list.
- 403 (not 404) when the tenant exists but the user is not a member? Use 404
  to avoid tenant enumeration. Decide once and test it.

**Acceptance:** every existing endpoint works unchanged for a single-tenant
user; a multi-tenant user gets the right data per header.

#### T-05 — Per-tenant settings and Bambu credentials

- Replace the global `AppSetting` rows for `bambu_cloud_*` with a
  `TenantSetting(tenant_id, key, value)` table (or add `tenant_id` to
  `AppSetting`).
- `BambuCloudClient` becomes per tenant; `PrinterService` keeps a registry
  `tenant_id -> BambuCloudClient`.
- `printer_service.clients` becomes `dict[(tenant_id, serial), BambuClient]`.
  Serial collisions across tenants are expected and must not clash.
- `DELETE /bambu/session` clears only the current tenant's credentials.
- Migration: move the existing Bambu account to `Default`.

**Acceptance:** two tenants can connect two different Bambu accounts at the
same time; logging out of one does not disconnect the other.

#### T-06 — Background services per tenant

- Startup iterates active tenants, loads their credentials and printers, and
  starts their MQTT clients.
- Reconnect/reload endpoints only touch the current tenant.
- One account-level cloud MQTT client per tenant (see P-05), dispatching by
  serial, instead of one client per printer.
- Watchdog and AMS sync threads are tenant-aware; logs include `tenant_id`.

**Acceptance:** a tenant with a broken token does not slow down or block the
others.

#### T-07 — Invites and onboarding

- `POST /tenants/{id}/invites` (tenant admin) creates a token and emails a
  link. If email is disabled, return the link to the admin once.
- `POST /invites/accept` adds the membership for the logged-in user. New users
  set a password first (reuse the reset-password flow).
- Expiry and revoke; resend; prevent duplicate pending invites.
- First run: the setup wizard creates the tenant and its `owner`.

**Acceptance:** an invited user lands in the right tenant with the right role.

#### T-08 — User management screen

- New dashboard section, visible to tenant admins only.
- Members table: name, email, role, status, last active.
- Invite dialog (email + role), role change, remove member, resend invite.
- Tenant settings: name, slug, Bambu account, default printer.
- Platform admin view: list/create/deactivate tenants.
- Permission-aware UI: hide actions the current role cannot perform; the API
  is still the gate.

**Acceptance:** a tenant admin can invite, promote and remove users without
touching the database or the API.

#### T-09 — Tenant switcher

- Dropdown in the sidebar/header showing the current tenant and the others.
- Persist the choice; reload data on switch; clear tenant-scoped caches.
- Show the tenant name next to the logo so screenshots are unambiguous.
- Mobile: same, after login if the user has more than one membership.

#### T-10 — Mobile tenant selection

- After login, call `/me/tenants`; if there is more than one, show a picker.
- Store the active tenant in secure storage and send the header on every
  request. Handle a revoked membership (403 → back to the picker).

#### T-11 — Operations

- Audit log: who changed what, per tenant (`tenant_id`, `user_id`, `action`,
  `target`, `created_at`).
- Per-tenant quotas and rate limits (printers, users, API calls).
- Tenant export and delete (delete requires typing the slug).
- Health endpoint per tenant (MQTT connections, last report).
- Document the backup/restore story for a shared database.

#### T-12 — Isolation test suite

- Fixtures for two tenants with overlapping serials, barcodes and colors.
- Every route gets a cross-tenant attempt in tests.
- A CI job that fails if a new route is added without a tenant-scoped test
  (route inventory check).

### Sequencing

1. **T-01 → T-04** — schema, permissions, scoping, tenant resolution. This is
   the risky part; land it behind a feature flag if needed.
2. **T-05 → T-06** — settings, credentials, MQTT registry.
3. **T-07 → T-09** — invites, user management UI, switcher.
4. **T-10** — mobile.
5. **T-11 → T-12** — operations and the isolation suite (T-12 should start
   alongside T-03, not at the end).

### What multi-tenancy absorbs

These open issues should be solved as part of the epic, not separately:

- **P-05** (one MQTT session per cloud printer) — only if eviction is observed
  (D-08); the registry still has to be keyed by tenant.
- **P-08** (uid lookup per printer) — cache per tenant.
- **S-02/S-03** (token storage and revocation) — revisit while adding tenant
  context to the session.
- **S-06** (deactivation does not revoke) — add membership-level revocation.

---

## 2. Open issues

### 2.1 Security and authentication

| ID | Where | Issue | Fix | Found |
| --- | --- | --- | --- | --- |
| S-06 | `backend/app/api/routes/users.py` (`update_user`) | Deactivating a user does not revoke refresh tokens; re-activating resurrects every 30-day session. | Deferred to multi-tenancy (D-11): enforce at the membership level there. | Human #7 · 09 Nov 20:18 UTC |

### 2.2 Printer and cloud backend

| ID | Where | Issue | Fix | Found |
| --- | --- | --- | --- | --- |
| P-05 | `backend/app/services/printer_service.py` | Each cloud printer gets its own MQTT session with the same `u_<uid>`/token. The review worried about a per-account limit, but there is no evidence of one (D-08); the REST fallback was removed. | Keep one client per printer for now. If printers start evicting each other, switch to one account-level client on `device/+/report`. | Human #9 · 09 Nov 20:18 UTC |

### 2.3 Spools, barcodes and filaments

| ID | Where | Issue | Fix | Found |
| --- | --- | --- | --- | --- |

### 2.4 Frontend

| ID | Where | Issue | Fix | Found |
| --- | --- | --- | --- | --- |

### 2.5 Mobile

| ID | Where | Issue | Fix | Found |
| --- | --- | --- | --- | --- |

### 2.6 CI, demo and infrastructure

| ID | Where | Issue | Fix | Found |
| --- | --- | --- | --- | --- |

---

## 3. Decisions (answered 2026-11-10)

| ID | Decision | Affects |
| --- | --- | --- |
| D-01 | “Last 12 months” means the trailing **365 days**, not calendar months. | F-05 |
| D-02 | `color_name` is the display name (“Black”, “Green Mate”). Duplicates across brands are expected — a Sunlu green and a Bambu green are different filaments. Label by brand + color_name, key by id. | F-08 |
| D-03 | `PrintJob.status == 4` is the “running” code and is used in `/prints/active` and the print-job sync. Document it; no code change. | I-03 |
| D-04 | Jobs without a `spool_id` **do** count toward “Filament Used”. | F-09 |
| D-05 | Only two identifiers matter: the packaging barcode and the AMS RFID (`tag_uid`). `nfc_uid` and the NFC/UID scan endpoints were experiments and are retired; the column stays for one release. | B-13 |
| D-06 | Every barcode scan adds a spool. `create=true` must always insert; the mobile lookup-first flow is the duplicate guard. No server-side dedupe. | B-02, B-03, M-02 |
| D-07 | No production data with 14-digit or UPC-A mappings. No backfill; validate new codes. | B-05, M-03 |
| D-08 | No known Bambu per-account session cap. Keep one client per printer for now; revisit only if printers evict each other. | P-05 |
| D-09 | No documented Bambu token refresh endpoint. Keep the explicit sign-out/sign-in recovery. | Bambu session |
| D-10 | “Log out” ends **this device** only. Per-token revocation is correct; a stolen access token stays valid for up to 60 minutes. | S-03, S-08 |
| D-11 | Deactivation semantics are deferred to the multi-tenancy work. | S-06, T-02 |
| D-12 | The backend runs **one worker** on purpose (documented in `scripts/start.sh`). Multi-worker is out of scope; the in-process registry is safe within one process, but its threads still need a lock. | P-01, T-06, I-04 |
| D-14 | Scan and confirm accept a client-generated `request_id` for retry idempotency. This is not content dedupe (D-06): two different requests still add two spools. | Barcode scan/confirm |
| D-13 | AMS adoption is weight-aware: a partial tray never adopts a full spool; only untagged spools on no printer whose remaining weight is within max(50 g, 15 %) are candidates, FIFO breaks ties. A tray with no percentage creates a `remaining_unknown` spool (nominal capacity as placeholder), never 0 g or a fake full weight. Entering the remaining grams clears the flag. | AMS sync, spool UI |

---

## 4. Done (for reference)

These were found and fixed while consolidating PR #20. Kept here so they are not
re-opened.

| Issue | Commit | Found |
| --- | --- | --- |
| Deleting a spool or filament wiped print history (`cascade_delete`) | `5fe00aa` | Human #4 + CR #4 |
| Fernet key derived from `SECRET_KEY` | `942c9aa` | Human #4 + CR #4 |
| Expired Bambu token was a permanent dead end; no logout route | `2c950bd` | Human #9 |
| SSRF on the cover proxy | `2c950bd` | Human #4 + CR #4 |
| `/prints/stats` returned the running job | `d4b0a30` | Human #4 + CR #4 |
| Plaintext password in the new-account email | `62335af` | CR #4 |
| Printer access codes returned to every user | `153f496` + LAN removal | CR #5 |
| Printer serial create race returned 500 | `153f496` | CR #5 |
| Concurrent `FilamentBarcode` insert returned 500 | `45255dc` | CR #6 |
| AMS colours compared case-sensitively | cloud-first merge | Human #6 |
| AMS and barcode spools were not reconciled | `a8439bf` | Human #6 + CR #6 |
| Web barcode scanner + `@zxing` dependency retired | `8351c9b` | Human #6 |
| Refresh-token reuse grace window | branch | Human #7 |
| Admin password reset did not revoke sessions | `02afa1f` | Human #7 |
| Local/LAN MQTT mode | `53a017d` | Product decision, 2026-11-10 |
| CodeRabbit reviewed vendored `.agents` files | `825e95f` | CR #10 |
| `certifi` compromised-CA advisory | `94109a9` | CI dependency review |
| Client registry race and 5 s disconnect | `4627c44` | Human #5 |
| Explicit barcode scan adopted an AMS spool | `e0e1d1c` | CR #8 |
| `remain == 0` reset an empty spool | `e8a9c88` | Human #6 + CR #6 |
| `SECRET_KEY` placeholder/short key (now auto-generates) | `37dfc6a` + `4d44452` | CR #4 |
| Postgres published on `0.0.0.0` | `37dfc6a` | Human #4 + CR #4 |
| Login accepted without an access token | `7b5be2b` | Human #4 |
| Biased trend windows, chart keys, unassigned jobs | `162b203` | Human #10 + CR #10 |
| Settings printer form (moot after LAN removal) | `53a017d` | Human #4 |
| Brand/null-safe filament matching | `bf0c792` | Human #6 + CR #6/#8 |
| Accent flash before hydration | `8322dcf` | Human #4 |
| CoverImage object URL leak | `531a01b` | Human #4 |
| Cloud failures distinguished from an empty account | `25c5a10` | Human #9 |
| Barcode normalization/validation and catalog guard | `99034c3` | Human #6 + CR #6 |
| Unique `spool.tag_uid` | `c9322ab` | Human #6 |
| Session kept on transient `getMe` failures | `39cb10c` | Human #7 + CR #7 |
| DST day and full print history | `1a81ab9` | Human #10 |
| Mobile server URL and login hardening | `1b9da35` | Human #8 + CR #8 |
| Bambu timestamps, AMS lock/retry/signature | `af21c83` | Human #6 + CR #4/#6 |
| Optional SKU for unknown barcodes | `e7c2744` | Human #6 |
| Purchased date drift | `567a36e` | Human #10 |
| Analytics refresh on focus | `5a612bf` | Human #10 |
| Mobile restore epoch, probe timeout, server setup, spool targets | `1aa16fe` | Human #8 + CR #8 |
| NFC/UID retired; spool lifecycle invariants | `dfaba16` | Product D-05 + Human #4/#5 |
| Logout race and failure reporting | `1f6462c` | Human #7 + CR #7 |
| UPC-A normalization (server) | `545d050` | Human #8 + CR #8 |
| Mobile scan throttle and UPC-A | `3bc3b41` | Human #8 + CR #8 |
| `setServerUrl` mutation ordering | `6e134b3` | Human #8 |
| Atomic password change + revocation; revocation checked first | `4655308` | Human #7 |
| MQTT-based online state, paho v2 callback, cached Bambu uid | `bcebf4c` | Human #9 + CR #9 |
| Print status and single-worker docs | `c0c25d0` | Product D-03/D-12 |
| Maskable icon safe zone | `8d4a005` | Human #6 |
| Mobile Node/build-tag docs; CI route types | `5ce724f` | Human #8 + CR #8/#9 |
| Access tokens rejected after a session revocation | `a78136b` | Human #7 |
| Refresh lifetime shortened; localStorage risk documented | `4faf8da` | Human #7 |
| Printer modal freshness; demo storage hardening | `36632a5` | CR #5 + Human #5 |
| Mobile logout waits for the in-flight refresh | `8f45e05` | Human #8 |
| Lossy migration downgrades documented | `9edf618` | Human #5/#9 |
| One scan = one spool (by design) | D-06 | Human #6 + CR #6 |
| Production stack in the install instructions; dev key bypass removed | `cd1e34b` | Human #20 |
| Setup guide lives at docs/SETUP.md | `21b2a2f` | Human #20 |
| AMS switch flush; automatic Bambu re-login with visible state | `879878c` | Human #20 |
| Finish updates bound to the task id; filament deducted once | `98733f0` | Human #20 |
| Password-reset links single-use (`type`/`jti`, 1 h) | `99f5a4f` | Human #20 |
| AMS adoption keeps the scanned spool total; foreign spools excluded | `c657ac5` | Human #20 |
| Active spool selection requires `active = true` | `c657ac5` | Human #20 |
| Every Bambu Cloud request has a timeout | `ea507ce` | Human #20 |
| Filament stats survive spool deletion (`PrintJob.filament_id`) | `0b21e68` | Human #20 |
| Public setup status hides Bambu/printer state behind auth | `66b09df` | Human #20 |
| Non-GTIN barcodes skip EAN padding and check-digit validation | `0b116ed` | Human #20 |
| Dashboard polling is sequenced and surfaces load errors | `ffd6666` | Human #20 |
| Analytics previous window uses the same day count | `1bc2c58` | Human #20 |
| First-signup advisory lock; fixed Bambu error messages | `1a69208` | Human #20 |
| Retired LAN settings removed from docs, compose and `.env.example` | `f2aff4d` | Human #20 |
| Mobile rejects any 4xx session; audio permission and token docs fixed | `426a594` | Human #20 |
| Printer screenshot refreshed to the current copy | `40c189c` | Human #20 |
| AMS adoption matched by remaining weight; unknown percentages tracked | `9224ba5` | Product D-13 |
| Unknown spool weight shown as unknown on web and mobile | `1b709f5` | Product D-13 |
| Unknown-weight edit keeps the flag; scan create passes the symbology; mobile 4xx narrowed | `84652f7`, `8198400` | Human #20 |
| Test DB requires a `_test` name; rows cleared between tests | `cf1f249` | Human #20 |
| Alembic metadata matches migrations; `alembic check` clean | `faa44f8` | Human #20 |
| Exactly-once filament deduction (unique key + atomic claim) | `faa44f8` | Human #20 |
| `filament_id` exposed; deterministic active-spool query | `84d3a51` | Human #20 |
| Browser request timeouts; list-page error states; filaments N+1 | `371fd66` | Human #20 |
| Email off by default; SMTP/MQTT forwarded; `.env` docs first | `ae5de40` | Human #20 |
| AMS backoff, slot ordering, print ordering, atomic key, script fixes | `ffd7e1e` | Human #20 |
| Web card accessibility, demo scan, dead-code cleanup | `1e81949` | Human #20 |
| Mobile error screens, haptics, SecureStore, dev client | `7c75858` | Human #20 |
| Site security contact, install copy, 404, screenshots | `78b9e82` | Human #20 |
| Support SKUs separated by series; idempotent scan/confirm; slot-accurate deduction | `223ed50` | Human #20 |
| First-run no-printer escape; analytics range/banner; demo weight edit; Progress name | `94a2516` | Human #20 |
| Mobile unknown readout, scan guards, deep-link return, retry backoff | `7d5e772` | Human #20 |
| Latest gated to main; images unprivileged/slim/digest-pinned; Dependabot dirs | `15e9143` | Human #20 |
| Client request ids; slot exclusion/tag/preset/ratio; series backfill | `79249b1`, `5de89c1` | Human #20 |
| Setup skip persisted; replay 409; repair-safe invariant; progress labels | `79249b1`, `d519562`, `306c8c6` | Human #20 |
| Release guard for all tags; latest concurrency + highest semver | `a3201fd` | Human #20 |
| AMS untagged trays, duplicate slots; restart finish; attribution and slow-cloud close | `a5befa6` | Human #20 |
| Series product reused across weights in barcode and AMS lookup; scanned box weight used for the spool | `63add5c`, `3126190` | Human #20 |
| Filaments list N+1 removed; unknown filament spools 404 | `ca71295` | Human #20 |
| Setup wizard can be reopened with `?force=1` | `dc035fa` | Human #20 |
| Backfill-only server defaults removed | `f9c5164` | Human #20 |
| Unique progress-bar accessible names | `401dc87` | Human #20 |
| Mobile add-another request id reused on retry | `b8ec24f` | Human #20 |
| Feature carousel lazy mounts; committed image variant tooling | `e0a792d` | Human #20 |
| Release tags must be the main tip; merged-tag comparison | `8254cfa` | Human #20 |
| Finish only updates an open job; missing tasks retry; AMS-dependent finishes defer; timeout leaves the deduction unclaimed | `2e11325` | Human #20 |
| Ambiguous series groups are not relabelled; reused series reconcile the package weight | `af24071` | Human #20 |
| `spool.filament_id` index; filaments list query shape pinned | `0d3e3dc` | Human #20 |
| Release ancestry guard restored; skipped latest warns instead of failing | `c6b07bc` | Human #20 |
| Visited feature slides stay mounted; native-width masters checked | `d434adf` | Human #20 |
| Setup first paint, unique progress labels, demo filament-spools 404 | `27aab49` | Human #20 |
