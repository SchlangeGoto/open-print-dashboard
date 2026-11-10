from app.services.bambu_client import BambuClient


def test_tray_remaining_zero_is_empty() -> None:
    assert BambuClient._tray_remaining({"remain": 0}, 1000) == 0


def test_tray_remaining_negative_is_unknown() -> None:
    assert BambuClient._tray_remaining({"remain": -1}, 1000) == 1000


def test_tray_remaining_percentage() -> None:
    assert BambuClient._tray_remaining({"remain": 50}, 1000) == 500


def test_tray_remaining_is_capped_at_total() -> None:
    assert BambuClient._tray_remaining({"remain": 150}, 1000) == 1000


def test_parse_task_datetime_from_iso() -> None:
    from datetime import UTC, datetime

    from app.services.bambu_client import parse_task_datetime

    expected = datetime(2026, 11, 10, 12, 0, tzinfo=UTC)
    assert parse_task_datetime("2026-11-10T12:00:00Z") == expected
    assert parse_task_datetime("2026-11-10T12:00:00") == expected


def test_parse_task_datetime_from_epoch() -> None:
    from datetime import UTC, datetime

    from app.services.bambu_client import parse_task_datetime

    expected = datetime.fromtimestamp(1_700_000_000, tz=UTC)
    assert parse_task_datetime(1_700_000_000) == expected
    assert parse_task_datetime(1_700_000_000_000) == expected


def test_parse_task_datetime_invalid() -> None:
    from app.services.bambu_client import parse_task_datetime

    assert parse_task_datetime(None) is None
    assert parse_task_datetime("") is None
    assert parse_task_datetime("not a date") is None


def test_ams_signature_ignores_sensor_values() -> None:
    from app.services.bambu_client import BambuClient

    client = BambuClient()
    first = {
        "ams": [
            {
                "tray": [
                    {
                        "tag_uid": "TAG",
                        "remain": 50,
                        "tray_info_idx": "GFA01",
                        "temp": 25,
                        "humidity": 40,
                    }
                ]
            }
        ]
    }
    second = {
        "ams": [
            {
                "tray": [
                    {
                        "tag_uid": "TAG",
                        "remain": 50,
                        "tray_info_idx": "GFA01",
                        "temp": 31,
                        "humidity": 55,
                    }
                ]
            }
        ]
    }
    changed = {
        "ams": [
            {
                "tray": [
                    {
                        "tag_uid": "TAG",
                        "remain": 49,
                        "tray_info_idx": "GFA01",
                    }
                ]
            }
        ]
    }

    assert client._ams_signature_for(first) == client._ams_signature_for(second)
    assert client._ams_signature_for(first) != client._ams_signature_for(changed)


def test_on_disconnect_reads_a_version2_reason_code() -> None:
    from types import SimpleNamespace
    from unittest.mock import MagicMock

    from app.services.bambu_client import BambuClient

    client = BambuClient()
    mqtt = MagicMock()
    client.client = mqtt

    client._on_disconnect(mqtt, None, None, SimpleNamespace(value=5), None)

    assert client._auth_error is True
    mqtt.disconnect.assert_called_once()


def test_get_user_id_is_cached(monkeypatch) -> None:
    from app.services.bambu_cloud import BambuCloudClient

    client = BambuCloudClient()
    client.token = "token"

    class Response:
        status_code = 200

        def raise_for_status(self) -> None:
            pass

        def json(self) -> dict:
            return {"uid": "user-1"}

    calls = {"count": 0}

    def fake_get(*_args, **_kwargs):
        calls["count"] += 1
        return Response()

    monkeypatch.setattr("app.services.bambu_cloud.requests.get", fake_get)

    assert client.get_user_id() == "user-1"
    assert client.get_user_id() == "user-1"
    assert calls["count"] == 1
