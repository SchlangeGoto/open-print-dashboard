from pathlib import Path

from app.core.barcodes import ean13_check_digit, is_valid_ean13, normalize_barcode
from app.services.bambu_catalog import _catalog


def test_normalize_barcode_strips_gtin_wrappers() -> None:
    assert normalize_barcode("06975337032380") == "6975337032380"
    assert normalize_barcode("]E06975337032380") == "6975337032380"
    assert normalize_barcode(" 6975337032380 ") == "6975337032380"
    assert normalize_barcode("036000291452") == "0036000291452"


def test_ean13_check_digit() -> None:
    assert is_valid_ean13("6975337032380")
    assert is_valid_ean13("0036000291452")
    assert not is_valid_ean13("6975337032381")
    assert ean13_check_digit("697533703238") == 0


def test_catalog_ignores_a_non_object_root(
    tmp_path: Path, monkeypatch
) -> None:
    path = tmp_path / "catalog.json"
    path.write_text("[]")
    monkeypatch.setattr("app.services.bambu_catalog._CATALOG_PATH", path)
    _catalog.cache_clear()
    try:
        assert _catalog() == {}
    finally:
        _catalog.cache_clear()


def test_catalog_ignores_a_non_object_barcodes_map(
    tmp_path: Path, monkeypatch
) -> None:
    path = tmp_path / "catalog.json"
    path.write_text('{"barcodes": []}')
    monkeypatch.setattr("app.services.bambu_catalog._CATALOG_PATH", path)
    _catalog.cache_clear()
    try:
        assert _catalog() == {}
    finally:
        _catalog.cache_clear()
