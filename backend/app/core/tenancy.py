"""Tenant identifiers and the fixed role/permission matrix.

The permission strings are checked per route. Roles are intentionally coarse
for the first cut: custom roles would need a role_permission table, which is
out of scope until the fixed set proves insufficient.
"""

import uuid

# Existing installs migrate to this tenant. The fixed id makes the backfill and
# the fallback for code that runs before a tenant exists deterministic.
DEFAULT_TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
DEFAULT_TENANT_NAME = "Default"
DEFAULT_TENANT_SLUG = "default"

ROLES = ("owner", "admin", "operator", "viewer")

READ_PERMISSIONS = frozenset(
    {
        "printers.read",
        "filaments.read",
        "spools.read",
        "prints.read",
        "settings.read",
    }
)

OPERATOR_PERMISSIONS = READ_PERMISSIONS | {
    "printers.write",
    "filaments.write",
    "spools.write",
    "prints.delete",
}

ADMIN_PERMISSIONS = OPERATOR_PERMISSIONS | {
    "settings.write",
    "bambu.manage",
    "users.read",
    "users.write",
    "tenant.manage",
}

OWNER_PERMISSIONS = ADMIN_PERMISSIONS | {"tenant.delete"}

ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    "owner": frozenset(OWNER_PERMISSIONS),
    "admin": frozenset(ADMIN_PERMISSIONS),
    "operator": frozenset(OPERATOR_PERMISSIONS),
    "viewer": frozenset(READ_PERMISSIONS),
}

ALL_PERMISSIONS = frozenset().union(*ROLE_PERMISSIONS.values())


def has_permission(role: str, permission: str) -> bool:
    """Return whether a role grants a permission.

    Platform superusers are handled by the dependency: they resolve to the
    owner role for any tenant, including tenants they are not a member of.
    """
    return permission in ROLE_PERMISSIONS.get(role, frozenset())


def is_valid_role(role: str) -> bool:
    return role in ROLE_PERMISSIONS


def tenant_admin_roles() -> frozenset[str]:
    return frozenset({"owner", "admin"})
