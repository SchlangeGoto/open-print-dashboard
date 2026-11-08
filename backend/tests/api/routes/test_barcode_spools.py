from fastapi.testclient import TestClient

from app.core.config import settings


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
    assert data["filament"]["material"] == "PLA"
    assert data["spool"]["barcode"] == "6975337030164"
