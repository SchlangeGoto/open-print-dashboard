from fastapi.testclient import TestClient

from app.core.config import settings


def _create_filament(client: TestClient, headers: dict[str, str]) -> str:
    data = {
        "brand": "Bambu Lab",
        "material": "PLA",
        "color_name": "Black",
        "color_hex": "#000000",
    }
    return client.post(
        f"{settings.API_V1_STR}/filaments/", headers=headers, json=data
    ).json()["id"]


def test_create_and_activate_spool(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    filament_id = _create_filament(client, superuser_token_headers)
    data = {
        "filament_id": filament_id,
        "total_weight_g": 1000,
        "remaining_g": 1000,
        "price_per_kg": 24.99,
    }
    r = client.post(
        f"{settings.API_V1_STR}/spools/",
        headers=superuser_token_headers,
        json=data,
    )
    assert r.status_code == 200
    spool = r.json()
    assert spool["filament_id"] == filament_id

    r = client.put(
        f"{settings.API_V1_STR}/spools/{spool['id']}/activate",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    assert r.json()["active"] is True

    r = client.get(
        f"{settings.API_V1_STR}/spools/active", headers=superuser_token_headers
    )
    assert r.status_code == 200
    assert r.json()["id"] == spool["id"]


def test_only_one_active_spool(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    filament_id = _create_filament(client, superuser_token_headers)
    base = {"filament_id": filament_id, "total_weight_g": 1000, "remaining_g": 1000}
    first = client.post(
        f"{settings.API_V1_STR}/spools/", headers=superuser_token_headers, json=base
    ).json()
    second = client.post(
        f"{settings.API_V1_STR}/spools/", headers=superuser_token_headers, json=base
    ).json()

    client.put(
        f"{settings.API_V1_STR}/spools/{first['id']}/activate",
        headers=superuser_token_headers,
    )
    client.put(
        f"{settings.API_V1_STR}/spools/{second['id']}/activate",
        headers=superuser_token_headers,
    )

    active = client.get(
        f"{settings.API_V1_STR}/spools/active", headers=superuser_token_headers
    ).json()
    assert active["id"] == second["id"]
