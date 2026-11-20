from sqlmodel import Session

from app import crud
from app.models import Tenant, TenantHealth, TenantHealthPrinter
from app.services.printer_service import printer_service


def build_tenant_health(session: Session, tenant: Tenant) -> TenantHealth:
    printers = crud.get_printers(session=session, tenant_id=tenant.id)
    statuses = printer_service.get_statuses(tenant.id)
    health_printers = [
        TenantHealthPrinter(
            serial=printer.serial,
            name=printer.name,
            connected=bool((statuses.get(printer.serial) or {}).get("connected")),
            last_report_seconds_ago=(statuses.get(printer.serial) or {}).get(
                "last_report_seconds_ago"
            ),
        )
        for printer in printers
    ]
    return TenantHealth(
        tenant_id=tenant.id,
        name=tenant.name,
        is_active=tenant.is_active,
        bambu_connected=crud.get_cloud_token(session=session, tenant_id=tenant.id)
        is not None,
        printers_configured=len(printers),
        printers_connected=sum(1 for item in health_printers if item.connected),
        printers=health_printers,
    )
