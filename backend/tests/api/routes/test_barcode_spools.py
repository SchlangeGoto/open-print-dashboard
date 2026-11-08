from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import Filament, Printer, Spool
from app.services.bambu_client import BambuClient
from tests.utils.utils import random_lower_string


def test_scan_known_barcode_creates_spool(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/spools/scan/barcode",
        headers=superuser_token_headers,
        json={"code": "6975337032380"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["found"] is True
    assert data["filament"]["color_name"] == "Mandarin Orange"
    assert data["filament"]["spool_weight_g"] == 1000
    assert data["spool"]["total_weight_g"] == 1000
    assert data["spool"]["barcode"] == "6975337032380"


def test_barcode_lookup_and_duplicate_creation(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    code = "6975337031376"  # PLA Matte Scarlet Red

    # Start clean even if a previous run left this barcode behind.
    for existing in db.exec(select(Spool).where(Spool.barcode == code)).all():
        db.delete(existing)
    db.commit()

    r = client.post(
        f"{settings.API_V1_STR}/spools/scan/barcode",
        headers=superuser_token_headers,
        json={"code": code, "create": False},
    )
    assert r.status_code == 200
    lookup = r.json()
    assert lookup["found"] is True
    assert lookup["created"] is False
    assert lookup["spool"] is None
    assert lookup["existing_spools"] == []

    r = client.post(
        f"{settings.API_V1_STR}/spools/scan/barcode",
        headers=superuser_token_headers,
        json={"code": code, "create": True},
    )
    assert r.status_code == 200
    first = r.json()
    assert first["created"] is True
    assert first["spool"]["barcode"] == code

    r = client.post(
        f"{settings.API_V1_STR}/spools/scan/barcode",
        headers=superuser_token_headers,
        json={"code": code, "create": False},
    )
    assert r.status_code == 200
    duplicate = r.json()
    assert duplicate["created"] is False
    assert duplicate["spool"]["id"] == first["spool"]["id"]
    assert len(duplicate["existing_spools"]) == 1

    r = client.post(
        f"{settings.API_V1_STR}/spools/scan/barcode",
        headers=superuser_token_headers,
        json={"code": code, "create": True},
    )
    assert r.status_code == 200
    second = r.json()
    assert second["created"] is True
    assert second["spool"]["id"] != first["spool"]["id"]

    r = client.post(
        f"{settings.API_V1_STR}/spools/scan/barcode",
        headers=superuser_token_headers,
        json={"code": code, "create": False},
    )
    assert len(r.json()["existing_spools"]) == 2


def test_ams_links_barcode_spool_by_tag(
    client: TestClient, db: Session
) -> None:
    printer = Printer(
        name="AMS Link Test",
        serial=random_lower_string(),
        ip="127.0.0.1",
        access_code="12345678",
    )
    filament = Filament(
        brand="Bambu Lab",
        material="PLA",
        color_name="AMS Link Test",
        color_hex="#AABBCC",
        bambu_info_idx="GFL99",
        spool_weight_g=1000,
    )
    db.add(printer)
    db.add(filament)
    db.commit()
    db.refresh(printer)
    db.refresh(filament)

    spool = Spool(
        filament_id=filament.id,
        total_weight_g=1000,
        remaining_g=1000,
        barcode="TEST-AMS-LINK",
        source="barcode",
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)

    ams = {
        "ams": [
            {
                "id": "0",
                "tray": [
                    {
                        "id": "0",
                        "tag_uid": "AABBCCDD",
                        "tray_type": "PLA",
                        "tray_info_idx": "GFL99",
                        "tray_color": "AABBCC",
                        "tray_weight": "1000",
                        "remain": "80",
                        "tray_id_name": "AMS Link Test",
                    }
                ],
            }
        ]
    }
    ams_client = BambuClient()
    ams_client.serial = printer.serial
    ams_client._current_status = {"tray_now": 0, "ams": ams}
    ams_client._sync_ams_trays(ams)

    db.expire_all()
    linked = db.get(Spool, spool.id)
    assert linked
    assert linked.tag_uid == "AABBCCDD"
    assert linked.remaining_g == 800

    matches = db.exec(
        select(Spool).where(Spool.filament_id == filament.id)
    ).all()
    assert len(matches) == 1


def test_barcode_scan_adopts_unlinked_ams_spool(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    code = "6975337030287"  # PLA Metal Space Gray
    for existing in db.exec(select(Spool).where(Spool.barcode == code)).all():
        db.delete(existing)
    db.commit()

    filament = Filament(
        brand="Bambu Lab",
        material="PLA",
        color_name="Space Gray",
        color_hex="#565451",
        bambu_info_idx="GFA02",
        spool_weight_g=1000,
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)

    ams_spool = Spool(
        filament_id=filament.id,
        total_weight_g=1000,
        remaining_g=540,
        tag_uid="AMS-SPACE-GRAY",
        source="ams",
    )
    db.add(ams_spool)
    db.commit()
    db.refresh(ams_spool)

    r = client.post(
        f"{settings.API_V1_STR}/spools/scan/barcode",
        headers=superuser_token_headers,
        json={"code": code, "create": True},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["created"] is True
    assert data["spool"]["id"] == str(ams_spool.id)
    assert data["spool"]["barcode"] == code

    db.expire_all()
    matches = db.exec(
        select(Spool).where(Spool.filament_id == filament.id)
    ).all()
    assert len(matches) == 1


def test_unknown_barcode_can_create_filament_and_spool(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    code = "TEST-UNKNOWN-BARCODE"
    r = client.post(
        f"{settings.API_V1_STR}/spools/scan/barcode",
        headers=superuser_token_headers,
        json={"code": code},
    )
    assert r.status_code == 200
    assert r.json()["found"] is False

    r = client.post(
        f"{settings.API_V1_STR}/spools/scan/barcode/confirm",
        headers=superuser_token_headers,
        json={
            "code": code,
            "filament": {
                "brand": "Test Brand",
                "material": "PLA",
                "color_name": "Test Blue",
                "color_hex": "#123456",
                "spool_weight_g": 750,
            },
            "total_weight_g": 750,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["found"] is True
    assert data["filament"]["color_name"] == "Test Blue"
    assert data["spool"]["total_weight_g"] == 750
    assert data["spool"]["source"] == "barcode"


def test_scan_imported_catalog_barcode(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/spools/scan/barcode",
        headers=superuser_token_headers,
        json={"code": "6975337030164"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["found"] is True
    assert data["filament"]["color_name"] == "Jade White"
    assert data["filament"]["color_hex"] == "#FFFFFF"
    assert data["filament"]["material"] == "PLA"
    assert data["spool"]["barcode"] == "6975337030164"
