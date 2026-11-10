#!/usr/bin/env python3
"""Generate the Bambu barcode catalog from the community GTIN spreadsheet.

Usage:
    python scripts/import_bambu_gtins.py /path/to/bambu-products.csv

The source sheet is:
https://docs.google.com/spreadsheets/d/1Sd5G7rxpmxu3dANn1IJRvPyXcLwF7me2FMyZ0vcHboY/edit

The CSV export is not committed; the generated JSON snapshot is.
"""

import csv
import json
import re
import sys
from pathlib import Path
from typing import Any

OUT_PATH = Path(__file__).resolve().parent.parent / "app/data/bambu_barcodes.json"

SOURCE_URL = (
    "https://docs.google.com/spreadsheets/d/"
    "1Sd5G7rxpmxu3dANn1IJRvPyXcLwF7me2FMyZ0vcHboY/edit"
)

# Known series -> Bambu preset filament id (tray_info_idx).
SERIES_IDS = {
    "PLA Basic": "GFA00",
    "PLA Matte": "GFA01",
    "PLA Metal": "GFA02",
    "PLA Silk": "GFA05",
    "PLA Marble": "GFA07",
    "PLA Sparkle": "GFA08",
    "PLA Tough": "GFA09",
    "PLA Aero": "GFA11",
    "PLA Glow": "GFA12",
    "PLA Dynamic": "GFA13",
    "PLA Galaxy": "GFA15",
    "PLA-CF": "GFA50",
    "PETG Basic": "GFG00",
    "PETG Translucent": "GFG01",
    "PETG HF": "GFG02",
    "PETG-CF": "GFG50",
    "ABS": "GFB00",
    "ABS-GF": "GFB50",
    "ASA": "GFB01",
    "ASA-CF": "GFB51",
    "TPU 95A": "GFU01",
    "TPU for AMS": "GFU02",
    "PC": "GFC00",
    "PA-CF": "GFN03",
    "PAHT-CF": "GFN04",
    "PA6-CF": "GFN05",
    "PA6-GF": "GFN08",
    "PPA-CF": "GFN06",
    "PPS-CF": "GFT02",
}

# Longest first so "PLA Matte" wins over "PLA".
SERIES_PATTERNS = sorted(
    [
        ("PLA Matte", "PLA", "PLA Matte"),
        ("PLA Basic", "PLA", "PLA Basic"),
        ("PLA Metal", "PLA", "PLA Metal"),
        ("PLA Silk", "PLA", "PLA Silk"),
        ("PLA Marble", "PLA", "PLA Marble"),
        ("PLA Sparkle", "PLA", "PLA Sparkle"),
        ("PLA Tough", "PLA", "PLA Tough"),
        ("PLA Aero", "PLA", "PLA Aero"),
        ("PLA Glow", "PLA", "PLA Glow"),
        ("PLA Dynamic", "PLA", "PLA Dynamic"),
        ("PLA Galaxy", "PLA", "PLA Galaxy"),
        ("PLA Wood", "PLA", "PLA Wood"),
        ("PLA Translucent", "PLA", "PLA Translucent"),
        ("PLA-CF", "PLA", "PLA-CF"),
        ("PETG HF", "PETG", "PETG HF"),
        ("PETG Basic", "PETG", "PETG Basic"),
        ("PETG Translucent", "PETG", "PETG Translucent"),
        ("PETG-CF", "PETG", "PETG-CF"),
        ("ABS-GF", "ABS", "ABS-GF"),
        ("ASA-CF", "ASA", "ASA-CF"),
        ("ABS", "ABS", "ABS"),
        ("ASA", "ASA", "ASA"),
        ("TPU 95A", "TPU", "TPU 95A"),
        ("TPU for AMS", "TPU", "TPU for AMS"),
        ("TPU", "TPU", "TPU"),
        ("PAHT-CF", "PA", "PAHT-CF"),
        ("PA6-CF", "PA", "PA6-CF"),
        ("PA6-GF", "PA", "PA6-GF"),
        ("PA-CF", "PA", "PA-CF"),
        ("PC FR", "PC", "PC FR"),
        ("PC-CF", "PC", "PC-CF"),
        ("PC", "PC", "PC"),
        ("PPS-CF", "PPS", "PPS-CF"),
        ("PPA-CF", "PPA", "PPA-CF"),
        ("PVA", "PVA", "PVA"),
        ("HIPS", "HIPS", "HIPS"),
        ("Support W", "Support", "Support W"),
        ("Support G", "Support", "Support G"),
        ("Support for PLA/PETG", "Support", "Support for PLA/PETG"),
        ("Support for PLA", "Support", "Support for PLA"),
        ("Support for PA/PET", "Support", "Support for PA/PET"),
        ("Support for ABS", "Support", "Support for ABS"),
    ],
    key=lambda item: len(item[0]),
    reverse=True,
)

SUFFIX_RE = re.compile(
    r"[\(（]?\s*(?:with|without)\s+bamb[uo]?\s+reusable\s+spoo.*$",
    re.IGNORECASE,
)
NOISE_RE = re.compile(
    r"\s*(?:\((?:abolished|discarded)\)|\(with[^)]*spool\)|（with[^）]*spool）)",
    re.IGNORECASE,
)
WEIGHT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(kg|千克|g|克|grams?)\b", re.IGNORECASE)


def normalize(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^\(zh\)\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(
        r"^3d\s*print(?:ing)?\s*filament\s*[:\-]?\s*", "", text, flags=re.IGNORECASE
    )
    text = re.sub(r"^(?:bambu|bamboo)\s+lab\s+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^bamb[uo]?\s+", "", text, flags=re.IGNORECASE)
    return text.strip()


def parse_weight(text: str) -> float:
    matches = WEIGHT_RE.findall(text)
    if not matches:
        return 1000.0

    grams = []
    for value, unit in matches:
        amount = float(value)
        if unit.lower() in {"g", "克", "gram", "grams"}:
            grams.append(amount)
        else:
            grams.append(amount * 1000)

    for amount in grams:
        if 240 <= amount <= 260:
            return 250.0
        if 450 <= amount <= 520:
            return 500.0
        if 700 <= amount <= 800:
            return 750.0
        if 950 <= amount <= 1050:
            return 1000.0
        if 1100 <= amount <= 1600:
            return 1000.0
    return 1000.0


def parse_description(raw: str) -> dict[str, Any] | None:
    text = NOISE_RE.sub("", raw)
    text = SUFFIX_RE.sub("", text)
    text = normalize(text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return None

    matched = None
    for pattern, material, series in SERIES_PATTERNS:
        if text.lower().startswith(pattern.lower()):
            matched = (pattern, material, series)
            break
    if not matched:
        return None

    pattern, material, series = matched
    remainder = text[len(pattern) :].strip()
    remainder = re.sub(r"^\s*[-–—:]\s*", "", remainder)
    remainder = re.sub(r"^\s*[-–—]\s*", "", remainder)
    remainder = re.sub(r"\s*[-–—]\s*", " ", remainder)
    remainder = NOISE_RE.sub("", remainder).strip()
    remainder = re.sub(r"\s+", " ", remainder).strip()

    # Remove a trailing weight from the color name.
    remainder = WEIGHT_RE.sub("", remainder).strip(" ,;-–—")
    color = remainder or ("Natural" if material == "Support" else "")
    color = color.replace("lvory", "Ivory").replace("Bamboo", "Bambu")
    color = re.sub(r"\s+", " ", color).strip()

    weight = parse_weight(raw)
    refill = bool(
        re.search(r"\brefill\b|without\s+(?:bambu\s+)?(?:reusable\s+)?spool", raw, re.I)
    )
    info_idx = SERIES_IDS.get(series)
    if series == "PC" and color.lower().startswith("clear"):
        info_idx = "GFC00"

    return {
        "description": raw.strip(),
        "brand": "Bambu Lab",
        "material": material,
        "series": series,
        "color_name": color or "Natural",
        "color_hex": None,
        "spool_weight_g": weight,
        "bambu_info_idx": info_idx,
        "refill": refill,
    }


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: import_bambu_gtins.py <csv path>")

    rows = list(csv.reader(open(sys.argv[1], newline="", encoding="utf-8")))
    start = next(
        (index for index, row in enumerate(rows) if row and row[0] == "GTIN12"),
        None,
    )
    if start is None:
        raise SystemExit("GTIN12 header not found")

    existing_payload: dict[str, Any] = {}
    if OUT_PATH.exists():
        existing_payload = json.loads(OUT_PATH.read_text())
    existing_barcodes = existing_payload.get("barcodes", {})
    existing_meta = existing_payload.get("_meta", {})

    catalog: dict[str, dict[str, Any]] = {}
    for row in rows[start + 1 :]:
        if len(row) < 6:
            continue
        barcode = (row[1] or "").strip()
        if not re.fullmatch(r"\d{13}", barcode):
            continue
        description = (row[5] or row[4] or "").strip()
        parsed = parse_description(description)
        if not parsed:
            continue
        # Prefer the entry with a real colour over a generic/blank duplicate.
        previous = catalog.get(barcode)
        if previous and previous["color_name"] != "Natural":
            continue
        catalog[barcode] = parsed

    # The two verified packaging examples from the project.
    catalog["6975337032380"] = {
        "description": "Bambu PLA Matte - Mandarin Orange (with Bambu Reusable Spool) 1 kg",
        "brand": "Bambu Lab",
        "material": "PLA",
        "series": "PLA Matte",
        "color_name": "Mandarin Orange",
        "color_hex": "#F99963",
        "spool_weight_g": 1000,
        "bambu_info_idx": "GFA01",
        "refill": False,
    }
    catalog["6975337031376"] = {
        "description": "Bambu PLA Matte - Scarlet Red (with Bambu Reusable Spool) 1 kg",
        "brand": "Bambu Lab",
        "material": "PLA",
        "series": "PLA Matte",
        "color_name": "Scarlet Red",
        "color_hex": "#DE4343",
        "spool_weight_g": 1000,
        "bambu_info_idx": "GFA01",
        "refill": False,
    }

    # This script only imports GTINs. Keep hex colours and metadata from the
    # enrichment step instead of nulling them when it runs on its own.
    for barcode, entry in catalog.items():
        if not entry.get("color_hex"):
            entry["color_hex"] = existing_barcodes.get(barcode, {}).get("color_hex")

    payload = {
        "_meta": {
            **existing_meta,
            "source": SOURCE_URL,
            "snapshot": "2026-11-08",
            "count": len(catalog),
        },
        "barcodes": dict(sorted(catalog.items())),
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {len(catalog)} barcodes to {OUT_PATH}")


if __name__ == "__main__":
    main()
