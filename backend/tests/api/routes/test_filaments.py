from fastapi.testclient import TestClient

from app.core.config import settings
from tests.utils.utils import random_lower_string


def test_create_filament(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    data = {
        "brand": "Bambu Lab",
        "material": "PLA",
        "color_name": "Matte Black",
        "color_hex": "#000000",
        "nozzle_temp_min": 190,
        "nozzle_temp_max": 220,
        "bed_temp": 60,
    }
    r = client.post(
        f"{settings.API_V1_STR}/filaments/",
        headers=superuser_token_headers,
        json=data,
    )
    assert r.status_code == 200
    created = r.json()
    assert created["brand"] == "Bambu Lab"
    assert created["material"] == "PLA"

    r = client.get(f"{settings.API_V1_STR}/filaments/", headers=superuser_token_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 1
    assert any(f["id"] == created["id"] for f in body["data"])


def test_update_filament(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    data = {
        "brand": "Generic",
        "material": "PETG",
        "color_name": "Orange",
        "color_hex": "#ff8800",
    }
    created = client.post(
        f"{settings.API_V1_STR}/filaments/",
        headers=superuser_token_headers,
        json=data,
    ).json()

    r = client.put(
        f"{settings.API_V1_STR}/filaments/{created['id']}",
        headers=superuser_token_headers,
        json={"color_name": "Red"},
    )
    assert r.status_code == 200
    assert r.json()["color_name"] == "Red"
    assert r.json()["material"] == "PETG"


def test_delete_filament(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    data = {
        "brand": "Test",
        "material": "ABS",
        "color_name": random_lower_string(),
        "color_hex": "#123456",
    }
    created = client.post(
        f"{settings.API_V1_STR}/filaments/",
        headers=superuser_token_headers,
        json=data,
    ).json()

    r = client.delete(
        f"{settings.API_V1_STR}/filaments/{created['id']}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200

    r = client.get(
        f"{settings.API_V1_STR}/filaments/{created['id']}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 404
