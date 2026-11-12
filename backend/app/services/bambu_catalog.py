"""Bambu Lab filament catalog entries used for barcode onboarding.

The EAN-13 on Bambu filament boxes encodes a product identifier. The printed
SKU next to it contains the series, colour code, diameter, and spool type.
Keep this catalog small and data-driven; unknown barcodes go through the
create-filament confirmation flow instead of guessing.
"""

import json
import logging
import re
from pathlib import Path
from typing import Any

from app.core.barcodes import normalize_barcode

logger = logging.getLogger("uvicorn.error")

_CATALOG_PATH = Path(__file__).resolve().parent.parent / "data/bambu_barcodes.json"

BAMBU_BARCODES: dict[str, dict[str, Any]] = {
    # PLA Matte - Mandarin Orange (11300)
    "6975337032380": {
        "sku": "A01-A2-1.75-1000-SPL",
        "brand": "Bambu Lab",
        "material": "PLA",
        "color_name": "Mandarin Orange",
        "color_hex": "#F99963",
        "bambu_info_idx": "GFA01",
        "spool_weight_g": 1000,
        "nozzle_temp_min": 190,
        "nozzle_temp_max": 230,
        "bed_temp": 45,
        "notes": "Bambu PLA Matte · product 11300",
    },
    # PLA Matte - Scarlet Red (11200)
    "6975337031376": {
        "sku": "A01-R1-1.75-1000-SPL",
        "brand": "Bambu Lab",
        "material": "PLA",
        "color_name": "Scarlet Red",
        "color_hex": "#DE4343",
        "bambu_info_idx": "GFA01",
        "spool_weight_g": 1000,
        "nozzle_temp_min": 190,
        "nozzle_temp_max": 230,
        "bed_temp": 45,
        "notes": "Bambu PLA Matte · product 11200",
    },
}

BAMBU_COLOR_NAMES: dict[str, str] = {
    "#f99963": "Mandarin Orange",
    "#de4343": "Scarlet Red",
}
BAMBU_COLOR_HEX = {name.lower(): color for color, name in BAMBU_COLOR_NAMES.items()}

MATERIAL_DEFAULTS: dict[str, tuple[int | None, int | None, int | None]] = {
    "PLA": (190, 230, 45),
    "PETG": (220, 260, 70),
    "ABS": (240, 270, 90),
    "ASA": (240, 270, 90),
    "TPU": (200, 250, 35),
    "PC": (250, 270, 90),
    "PA": (250, 280, 80),
    "PPS": (300, 340, 110),
    "PPA": (280, 320, 100),
    "PVA": (190, 220, 45),
    "HIPS": (230, 250, 90),
    "Support": (190, 230, 45),
}

BAMBU_SERIES: dict[str, str] = {
    "A00": "PLA Basic",
    "A01": "PLA Matte",
    "A02": "PLA Metal",
    "A05": "PLA Silk",
    "A07": "PLA Marble",
    "A08": "PLA Sparkle",
    "A09": "PLA Tough",
    "A11": "PLA Aero",
    "A12": "PLA Glow",
    "A13": "PLA Dynamic",
    "A15": "PLA Galaxy",
    "A50": "PLA-CF",
}

_SKU_RE = re.compile(
    r"^(?P<series>A\d{2})-(?P<color>[A-Z0-9]+)-"
    r"(?P<diameter>\d+(?:\.\d+)?)-(?P<weight>\d+)-(?P<kind>SPLFREE|SPL)$",
    re.IGNORECASE,
)


# Cache only successful loads: a transient read/parse failure must not
# disable barcode lookup for the lifetime of the process.
_CATALOG_CACHE: dict[str, dict[str, Any]] | None = None


def _catalog() -> dict[str, dict[str, Any]]:
    global _CATALOG_CACHE
    if _CATALOG_CACHE is not None:
        return _CATALOG_CACHE
    try:
        payload = json.loads(_CATALOG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Could not load the barcode catalog: %s", exc)
        return {}
    if not isinstance(payload, dict):
        logger.warning("Barcode catalog root is not an object; ignoring it")
        return {}
    barcodes = payload.get("barcodes")
    if not isinstance(barcodes, dict):
        logger.warning("Barcode catalog has no barcodes object; ignoring it")
        return {}
    _CATALOG_CACHE = barcodes
    return barcodes


def _product_key(brand: Any, material: Any, color_hex: Any) -> tuple[str, str, str]:
    color = str(color_hex or "").strip().lower()
    if color and not color.startswith("#"):
        color = f"#{color}"
    return (
        str(brand or "").strip().lower(),
        str(material or "").strip().lower(),
        color,
    )


_SERIES_CACHE: dict[tuple[str, str, str], frozenset[str]] | None = None


def reset_catalog_cache() -> None:
    """Clear the catalog caches (tests patch the catalog path)."""
    global _CATALOG_CACHE, _SERIES_CACHE
    _CATALOG_CACHE = None
    _SERIES_CACHE = None


def _series_by_product() -> dict[tuple[str, str, str], frozenset[str]]:
    global _SERIES_CACHE
    if _SERIES_CACHE is not None:
        return _SERIES_CACHE
    groups: dict[tuple[str, str, str], set[str]] = {}
    entries = list(_catalog().values()) + list(BAMBU_BARCODES.values())
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        series = entry.get("series")
        if not series:
            continue
        key = _product_key(
            entry.get("brand") or "Bambu Lab",
            entry.get("material") or "PLA",
            entry.get("color_hex") or "",
        )
        groups.setdefault(key, set()).add(str(series))
    _SERIES_CACHE = {key: frozenset(values) for key, values in groups.items()}
    return _SERIES_CACHE


def catalog_series_for(brand: Any, material: Any, color_hex: Any) -> frozenset[str]:
    """Return every series known for one brand/material/colour group.

    ``Support W``, ``Support for ABS`` and the other white supports share a
    colour, so a legacy row without a series cannot be assigned one safely
    when this set has more than one entry.
    """
    return _series_by_product().get(
        _product_key(brand, material, color_hex), frozenset()
    )


def lookup_barcode(code: str) -> dict[str, Any] | None:
    """Return catalog data for a known Bambu packaging barcode."""
    cleaned = normalize_barcode(code)
    entry = _catalog().get(cleaned)
    override = BAMBU_BARCODES.get(cleaned)
    if not entry and not override:
        return None

    data = dict(entry or {})
    if override:
        data.update(override)

    material = str(data.get("material") or "PLA")
    defaults = MATERIAL_DEFAULTS.get(material, (None, None, None))
    data["brand"] = data.get("brand") or "Bambu Lab"
    data["material"] = data.get("material") or material
    data["color_name"] = data.get("color_name") or "Natural"
    data["color_hex"] = data.get("color_hex") or BAMBU_COLOR_HEX.get(
        data["color_name"].lower(), "#9ca3af"
    )
    data["spool_weight_g"] = data.get("spool_weight_g") or 1000
    data["nozzle_temp_min"] = data.get("nozzle_temp_min") or defaults[0]
    data["nozzle_temp_max"] = data.get("nozzle_temp_max") or defaults[1]
    data["bed_temp"] = data.get("bed_temp") or defaults[2]
    data["notes"] = data.get("notes") or f"Bambu {data.get('series') or material}"
    return data


def parse_bambu_sku(sku: str | None) -> dict[str, Any] | None:
    """Parse the printed Bambu SKU into the fields we can infer."""
    if not sku:
        return None
    match = _SKU_RE.match(sku.strip())
    if not match:
        return None
    series_code = match.group("series").upper()
    return {
        "sku": sku.strip(),
        "series_code": series_code,
        "series": BAMBU_SERIES.get(series_code),
        "color_code": match.group("color").upper(),
        "diameter": float(match.group("diameter")),
        "spool_weight_g": float(match.group("weight")),
        "refill": match.group("kind").upper() == "SPLFREE",
    }
