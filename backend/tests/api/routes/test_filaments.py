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


def test_stats_returns_404_for_a_missing_filament(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    import uuid

    r = client.get(
        f"{settings.API_V1_STR}/filaments/stats/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 404


def test_spools_endpoint_returns_404_for_a_missing_filament(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    import uuid

    r = client.get(
        f"{settings.API_V1_STR}/filaments/{uuid.uuid4()}/spools",
        headers=superuser_token_headers,
    )
    assert r.status_code == 404


def test_list_uses_the_five_most_recent_prices(
    client: TestClient,
    db,
    superuser_token_headers: dict[str, str],
) -> None:
    from datetime import UTC, datetime, timedelta

    from app.models import Filament, Spool

    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Five prices",
        color_hex="#2468ac",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)

    base = datetime(2026, 1, 1, tzinfo=UTC)
    for index, price in enumerate([10, 20, 30, 40, 50, 60]):
        db.add(
            Spool(
                filament_id=filament.id,
                total_weight_g=1000,
                remaining_g=100,
                price_per_kg=price,
                created_at=base + timedelta(days=index),
            )
        )
    db.add(
        Spool(
            filament_id=filament.id,
            total_weight_g=1000,
            remaining_g=999,
            remaining_unknown=True,
            source="ams",
            created_at=base + timedelta(days=10),
        )
    )
    db.commit()

    r = client.get(f"{settings.API_V1_STR}/filaments/", headers=superuser_token_headers)
    assert r.status_code == 200
    row = next(item for item in r.json()["data"] if item["id"] == str(filament.id))

    # The oldest price (10) falls outside the last five; the unknown spool
    # does not contribute to remaining stock.
    assert row["avg_price_per_kg"] == 40.0
    assert row["total_remaining_g"] == 600.0
