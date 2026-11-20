"""Route inventory guard for tenant-scoped endpoints.

A new endpoint must be classified here. Data endpoints belong under the
tenant prefixes; authentication, account and platform-admin routes are global.
The cross-tenant tests live in `tests/api/routes/test_tenants.py` and
`tests/api/routes/test_operations.py`.
"""

from app.api.main import api_router
from app.core.config import settings

API = settings.API_V1_STR

GLOBAL_EXACT = {
    f"{API}/tenants",
    f"{API}/tenants/{{tenant_id}}",
    f"{API}/setup/status",
}

GLOBAL_PREFIXES = (
    f"{API}/login",
    f"{API}/users",
    f"{API}/utils",
    f"{API}/invites",
    f"{API}/internal",
    f"{API}/password-recovery",
    f"{API}/reset-password",
    f"{API}/me/tenants",
)

TENANT_PREFIXES = (
    f"{API}/printers",
    f"{API}/filaments",
    f"{API}/spools",
    f"{API}/prints",
    f"{API}/settings",
    f"{API}/bambu",
    f"{API}/tenants/current",
    f"{API}/setup/progress",
    f"{API}/setup/skip",
)


def _paths() -> set[str]:
    # `api_router` is lazy at this FastAPI version, so use the schema that the
    # app actually serves instead of walking `app.routes`.
    from app.main import app

    return set(app.openapi()["paths"])


def test_every_api_route_is_classified() -> None:
    unknown = sorted(
        path
        for path in _paths()
        if path not in GLOBAL_EXACT
        and not path.startswith(GLOBAL_PREFIXES)
        and not path.startswith(TENANT_PREFIXES)
    )

    assert not unknown, (
        "New API routes must be classified as global or tenant-scoped in "
        f"tests/test_route_inventory.py: {unknown}"
    )


def test_tenant_routes_do_not_sit_under_a_global_prefix() -> None:
    overlaps = sorted(
        path
        for path in _paths()
        if path.startswith(TENANT_PREFIXES) and path.startswith(GLOBAL_PREFIXES)
    )
    assert not overlaps, overlaps


def test_inventory_sees_the_router() -> None:
    # Guard against a future refactor that stops populating the schema.
    assert len(_paths()) > 40
    assert api_router.routes
