import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import Filament, FilamentBarcode, Printer, Spool
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
    db: Session,
) -> None:
    printer = Printer(
        name="AMS Link Test",
        serial=random_lower_string(),
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

    # A scanned 750 g refill: the AMS tray still reports 1000 g because it
    # omits tray_weight. Adopting the spool must not overwrite the user's
    # total; the percentage is applied to 750 g instead.
    spool = Spool(
        filament_id=filament.id,
        total_weight_g=750,
        remaining_g=750,
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
    ams_client._sync_ams_trays(ams, "test")

    db.expire_all()
    linked = db.get(Spool, spool.id)
    assert linked
    assert linked.tag_uid == "AABBCCDD"
    assert linked.total_weight_g == 750
    assert linked.remaining_g == 600

    matches = db.exec(select(Spool).where(Spool.filament_id == filament.id)).all()
    assert len(matches) == 1


def test_ams_links_oldest_barcode_spool_when_multiple(
    db: Session,
) -> None:
    printer = Printer(
        name="AMS FIFO Test",
        serial=random_lower_string(),
    )
    filament = Filament(
        brand="Bambu Lab",
        material="PLA",
        color_name="Green Mate",
        color_hex="#00AE42",
        bambu_info_idx="GFL99",
        spool_weight_g=1000,
    )
    db.add(printer)
    db.add(filament)
    db.commit()
    db.refresh(printer)
    db.refresh(filament)

    other_printer = Printer(name="Other printer", serial=random_lower_string())
    db.add(other_printer)
    db.commit()
    db.refresh(other_printer)

    base = datetime(2026, 1, 1, tzinfo=UTC)
    spools = []
    for index in range(4):
        spool = Spool(
            filament_id=filament.id,
            total_weight_g=1000,
            remaining_g=1000,
            barcode="TEST-FIFO-BARCODE",
            source="barcode",
            created_at=base + timedelta(minutes=index),
        )
        if index == 1:
            # Loaded in another printer: it must not be re-tagged or moved.
            spool.printer_id = other_printer.id
            spool.active = True
        db.add(spool)
        spools.append(spool)
    db.commit()

    ams = {
        "ams": [
            {
                "id": "0",
                "tray": [
                    {
                        "id": "0",
                        "tag_uid": "FIFO1234",
                        "tray_type": "PLA",
                        "tray_info_idx": "GFL99",
                        "tray_color": "00AE42",
                        "tray_weight": "1000",
                        "remain": "40",
                        "tray_id_name": "Green Mate",
                    }
                ],
            }
        ]
    }
    ams_client = BambuClient()
    ams_client.serial = printer.serial
    ams_client._current_status = {"tray_now": 0, "ams": ams}
    ams_client._sync_ams_trays(ams, "test")

    db.expire_all()
    rows = db.exec(
        select(Spool)
        .where(Spool.filament_id == filament.id)
        .order_by(Spool.created_at.asc())
    ).all()
    assert len(rows) == 4

    oldest = db.get(Spool, spools[0].id)
    assert oldest is not None
    assert oldest.tag_uid == "FIFO1234"
    assert oldest.remaining_g == 400
    assert oldest.active is True
    assert oldest.printer_id == printer.id

    assert [row.tag_uid for row in rows].count("FIFO1234") == 1
    assert all(row.tag_uid is None for row in rows if row.id != oldest.id)

    untouched = db.get(Spool, spools[1].id)
    assert untouched is not None
    assert untouched.tag_uid is None
    assert untouched.printer_id == other_printer.id


def test_barcode_scan_does_not_adopt_an_ams_spool(
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

    # One scan adds one spool (D-06). It must not attach the barcode to the
    # AMS spool that happens to use the same filament.
    r = client.post(
        f"{settings.API_V1_STR}/spools/scan/barcode",
        headers=superuser_token_headers,
        json={"code": code, "create": True},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["created"] is True
    assert data["spool"]["id"] != str(ams_spool.id)
    assert data["spool"]["barcode"] == code

    db.expire_all()
    matches = db.exec(select(Spool).where(Spool.filament_id == filament.id)).all()
    assert len(matches) == 2

    untouched = db.get(Spool, ams_spool.id)
    assert untouched is not None
    assert untouched.barcode is None
    assert untouched.tag_uid == "AMS-SPACE-GRAY"


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


def test_link_barcode_tolerates_a_concurrent_insert(db: Session) -> None:
    from app.api.routes.spools import _link_barcode

    code = f"race-{random_lower_string()}"
    winner = Filament(
        brand="Race", material="PLA", color_name="Race", color_hex="#123456"
    )
    loser = Filament(
        brand="Race", material="PLA", color_name="Race", color_hex="#123456"
    )
    db.add(winner)
    db.add(loser)
    db.commit()
    db.refresh(winner)
    db.refresh(loser)
    db.add(FilamentBarcode(code=code, filament_id=winner.id))
    db.commit()

    # The loser's insert hits the unique index; it must fall back to the
    # committed mapping instead of raising.
    result = _link_barcode(session=db, code=code, filament=loser)
    db.commit()

    assert result.id == winner.id
    mapping = db.exec(
        select(FilamentBarcode).where(FilamentBarcode.code == code)
    ).first()
    assert mapping is not None
    assert mapping.filament_id == winner.id


def test_catalog_match_does_not_cross_brands(db: Session) -> None:
    from app.api.routes.spools import _find_or_create_catalog_filament

    color = f"#{uuid.uuid4().hex[:6]}"
    sunlu = Filament(
        brand="Sunlu",
        material="PLA",
        color_name="Green",
        color_hex=color,
        bambu_info_idx=None,
    )
    db.add(sunlu)
    db.commit()
    db.refresh(sunlu)

    filament = _find_or_create_catalog_filament(
        session=db,
        data={
            "brand": "Bambu Lab",
            "material": "PLA",
            "color_name": "Green",
            "color_hex": color,
            "bambu_info_idx": None,
            "spool_weight_g": 1000,
        },
    )

    assert filament.id != sunlu.id
    assert filament.brand == "Bambu Lab"


def test_catalog_fallback_matches_the_same_brand(db: Session) -> None:
    from app.api.routes.spools import _find_or_create_catalog_filament

    color = f"#{uuid.uuid4().hex[:6]}"
    bambu = Filament(
        brand="Bambu Lab",
        material="PLA",
        color_name="Green",
        color_hex=color,
        bambu_info_idx=None,
    )
    db.add(bambu)
    db.commit()
    db.refresh(bambu)

    filament = _find_or_create_catalog_filament(
        session=db,
        data={
            "brand": "Bambu Lab",
            "material": "PLA",
            "color_name": "Green",
            "color_hex": color,
            "bambu_info_idx": None,
            "spool_weight_g": 1000,
        },
    )

    assert filament.id == bambu.id


def test_scan_rejects_an_invalid_ean13_check_digit(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/spools/scan/barcode",
        headers=superuser_token_headers,
        json={"code": "6975337032381"},
    )

    assert r.status_code == 422


def test_scan_normalizes_a_gtin14(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/spools/scan/barcode",
        headers=superuser_token_headers,
        json={"code": "06975337032380", "create": False},
    )

    assert r.status_code == 200, r.text
    assert r.json()["found"] is True


def test_unknown_barcode_uses_the_optional_sku(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/spools/scan/barcode",
        headers=superuser_token_headers,
        json={
            "code": "TEST-UNKNOWN-SKU",
            "sku": "A01-A2-1.75-1000-SPL",
        },
    )

    assert r.status_code == 200, r.text
    data = r.json()
    assert data["found"] is False
    assert data["suggested_filament"]["series"] == "PLA Matte"
    assert data["suggested_filament"]["spool_weight_g"] == 1000


def test_scan_accepts_a_twelve_digit_code128_payload(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # A 12-digit Code128 payload is not a UPC-A. Padding it would produce an
    # EAN-13 with a bad check digit and a 422.
    r = client.post(
        f"{settings.API_V1_STR}/spools/scan/barcode",
        headers=superuser_token_headers,
        json={"code": "123456789012", "create": False, "type": "code128"},
    )

    assert r.status_code == 200, r.text
    assert r.json()["code"] == "123456789012"
    assert r.json()["found"] is False


def test_scan_without_a_type_keeps_ean13_validation(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/spools/scan/barcode",
        headers=superuser_token_headers,
        json={"code": "6975337032381", "create": False},
    )

    assert r.status_code == 422
