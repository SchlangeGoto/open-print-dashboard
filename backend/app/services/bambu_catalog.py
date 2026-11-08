"""Bambu Lab filament catalog entries used for barcode onboarding.

The EAN-13 on Bambu filament boxes encodes a product identifier. The printed
SKU next to it contains the series, colour code, diameter, and spool type.
Keep this catalog small and data-driven; unknown barcodes go through the
create-filament confirmation flow instead of guessing.
"""

import re
from typing import Any

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


def lookup_barcode(code: str) -> dict[str, Any] | None:
    """Return catalog data for a known Bambu packaging barcode."""
    return BAMBU_BARCODES.get(code.strip())


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
