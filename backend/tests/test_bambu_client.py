from app.services.bambu_client import BambuClient


def test_tray_remaining_zero_is_empty() -> None:
    assert BambuClient._tray_remaining({"remain": 0}, 1000) == 0


def test_tray_remaining_negative_is_unknown() -> None:
    assert BambuClient._tray_remaining({"remain": -1}, 1000) == 1000


def test_tray_remaining_percentage() -> None:
    assert BambuClient._tray_remaining({"remain": 50}, 1000) == 500


def test_tray_remaining_is_capped_at_total() -> None:
    assert BambuClient._tray_remaining({"remain": 150}, 1000) == 1000
