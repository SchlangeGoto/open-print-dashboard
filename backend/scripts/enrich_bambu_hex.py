#!/usr/bin/env python3
"""Enrich the Bambu barcode catalog with official/community hex colours.

Usage:
    python scripts/enrich_bambu_hex.py bambu-hex.xlsx

The colour workbook is:
https://www.dropbox.com/scl/fi/d6l3ylm58pr4tvpvd4ao0/Bambu-Filament-HEX-Colors.xlsx?rlkey=ncod1d51sw4espndqcv885hcw
"""

import json
import re
import sys
from pathlib import Path

import openpyxl

CATALOG_PATH = Path(__file__).resolve().parent.parent / "app/data/bambu_barcodes.json"

SERIES_ALIASES = {
    "pla basics": "pla basic",
    "pla silk+": "pla silk",
    "pla basic gradient": "pla basic",
    "tpu": "tpu 95a",
    "tpu 95a hf": "tpu 95a",
}

# Series that are not in the community workbook, filled from Bambu store /
# 3DFilamentProfiles colour tables.
MANUAL_HEX: dict[tuple[str, str], str] = {
    ("pla tough", "black"): "#000000",
    ("pla tough", "white"): "#FFFFFF",
    ("pla tough", "red"): "#D6001C",
    ("pla tough", "yellow"): "#FCE300",
    ("pla tough", "blue"): "#0069B1",
    ("pla tough", "orange"): "#FF671F",
    ("pla tough", "silver"): "#A6A9AA",
    ("pla tough", "light blue"): "#61B0FF",
    ("pla tough", "pine green"): "#034638",
    ("pla tough", "gray"): "#ADB1B2",
    ("pla tough", "lavender blue"): "#B8ACD6",
    ("pla tough", "vermilion red"): "#D6001C",
    ("petg basic", "black"): "#000000",
    ("petg basic", "blue"): "#001489",
    ("petg basic", "blue gray"): "#2E4F66",
    ("petg basic", "dark beige"): "#DBC8B6",
    ("petg basic", "dark brown"): "#4F2C1D",
    ("petg basic", "gold"): "#F6D86A",
    ("petg basic", "gray"): "#ADB1B2",
    ("petg basic", "green"): "#009639",
    ("petg basic", "lake blue"): "#0069B1",
    ("petg basic", "lime green"): "#7CD82B",
    ("petg basic", "misty blue"): "#688197",
    ("petg basic", "nature"): "#D7D7D7",
    ("petg basic", "navy blue"): "#0086D6",
    ("petg basic", "orange"): "#FF671F",
    ("petg basic", "pine green"): "#034638",
    ("petg basic", "purple"): "#9E007E",
    ("petg basic", "red"): "#D6001C",
    ("petg basic", "reflex blue"): "#001489",
    ("petg basic", "transparent"): "#FFFFFF",
    ("petg basic", "white"): "#EDF0F2",
    ("petg basic", "yellow"): "#FCE300",
    ("pla aero", "white"): "#FFFFFF",
    ("pla aero", "black"): "#000000",
    ("pla aero", "gray"): "#8E9089",
    ("ppa-cf", "black"): "#000000",
    ("pps-cf", "black"): "#000000",
    ("asa-cf", "black"): "#000000",
    ("pa-cf", "natural"): "#D7D7D7",
    ("pa-cf", "black"): "#000000",
    ("pc fr", "black"): "#000000",
    ("support w", "natural"): "#FFFFFF",
    ("support g", "natural"): "#FFFFFF",
    ("support for pla", "natural"): "#FFFFFF",
    ("support for pa/pet", "natural"): "#FFFFFF",
    ("support for abs", "white"): "#FFFFFF",
    ("pva", "clear"): "#FFFFFF",
    ("tpu for ams", "white"): "#FFFFFF",
    ("tpu for ams", "black"): "#000000",
    ("pla metal", "space gray"): "#565451",
    ("pc", "transparent black"): "#5A5161",
    ("pla basic", "ash white"): "#E5E4E2",
    ("pla dynamic", "heat color changing purple to pink"): "#9B59B6",
    ("pla dynamic", "uv color changing white to coral"): "#F88379",
    ("pla silk", "black yellow"): "#000000",
    ("asa", "aero white"): "#FFFAF2",
    ("tpu 95a", "high speed"): "#FFFFFF",
    ("tpu 95a hf", "red"): "#C8102E",
    ("tpu 95a hf", "white"): "#FFFFFF",
}

DISPLAY_COLOR_ALIASES = {
    ("tpu 95a", "high speed"): "White",
    ("tpu 95a hf", "red"): "Red",
    ("tpu 95a hf", "white"): "White",
    ("asa", "aero white"): "White",
    ("pc", "transparent black"): "Clear Black",
    ("pla metal", "space gray"): "Space Gray",
}

GENERIC_HEX = {
    "black": "#000000",
    "white": "#FFFFFF",
    "gray": "#8E9089",
    "red": "#D6001C",
    "blue": "#0069B1",
    "green": "#00AE42",
    "yellow": "#FCE300",
    "orange": "#FF671F",
    "purple": "#9E007E",
    "pink": "#EEB1C1",
    "brown": "#9D432C",
    "silver": "#A6A9AA",
    "gold": "#E4BD68",
    "natural": "#F5F5DC",
    "transparent": "#FFFFFF",
    "clear": "#FFFFFF",
}

NOISE_WORDS = (
    "2 pack",
    "cmyk",
    "connector",
    "cable pack",
    "fan",
    "replacement",
    "printing panel",
    "build plate",
    "glue",
)


def normalize_series(value: str) -> str:
    series = re.sub(r"\s+", " ", value.strip().lower())
    return SERIES_ALIASES.get(series, series)


def normalize_color(value: str) -> str:
    color = re.sub(r"\([^)]*\)", "", value)
    color = re.sub(r"\s+", " ", color).strip().lower()
    color = color.replace("grey", "gray")
    color = color.replace("bamboo", "bambu")
    color = re.sub(r"^bambu\s+", "", color)
    color = re.sub(r"\s*0?1$", "", color) if color.endswith(" 01") else color
    color = color.replace("orange", "orange")  # keeps alias explicit
    color = color.replace("transparent", "transparent")
    color = color.replace("clear", "transparent")
    color = color.replace("space gray", "space gray")
    return color


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: enrich_bambu_hex.py <xlsx path>")

    workbook = openpyxl.load_workbook(sys.argv[1], data_only=True)
    sheet = workbook["Bambu HEX Codes"]

    series_hex: dict[tuple[str, str], str] = {}
    global_hex: dict[str, str] = {}
    for column in range(1, sheet.max_column + 1, 4):
        series = sheet.cell(1, column).value
        if not series:
            continue
        series_key = normalize_series(str(series))
        for row in range(2, sheet.max_row + 1):
            name = sheet.cell(row, column).value
            value = sheet.cell(row, column + 1).value
            if not name or not value:
                continue
            color = normalize_color(str(name))
            hex_value = str(value).split(";")[0].strip()
            if not hex_value.startswith("#"):
                continue
            series_hex[(series_key, color)] = hex_value
            global_hex.setdefault(color, hex_value)

    payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    catalog = payload["barcodes"]
    cleaned: dict[str, dict] = {}
    unmatched: list[tuple[str, str, str]] = []

    for barcode, entry in catalog.items():
        description = str(entry.get("description", "")).lower()
        if any(word in description for word in NOISE_WORDS):
            continue

        series = normalize_series(str(entry.get("series", "")))
        color = normalize_color(str(entry.get("color_name", "")))
        color = color.replace("\u200b", "").strip()
        if not color or color in {"(2 pack)", "2 pack"}:
            continue

        if series == "tpu 95a" and color.startswith("hf "):
            series = "tpu 95a hf"
            color = color[3:].strip()

        hex_value = series_hex.get((series, color))
        if not hex_value:
            hex_value = MANUAL_HEX.get((series, color))
        if not hex_value:
            hex_value = global_hex.get(color)
        if not hex_value:
            hex_value = GENERIC_HEX.get(color)
        if not hex_value:
            unmatched.append((barcode, series, color))
            continue
        if not re.fullmatch(r"#[0-9A-Fa-f]{6}", hex_value):
            hex_value = (
                global_hex.get(color)
                or GENERIC_HEX.get(color)
                or "#9CA3AF"
            )

        entry["color_hex"] = hex_value
        entry["series"] = entry.get("series") or series
        display_name = re.sub(
            r"\s*\((?:Amazon Japan Exclusive|Exclusively for Amazon Japan)\)",
            "",
            str(entry.get("color_name") or color),
        )
        display_name = display_name.replace("\u200b", "")
        display_name = display_name.replace("Grey", "Gray")
        display_name = re.sub(r"\s+", " ", display_name).strip()
        entry["color_name"] = DISPLAY_COLOR_ALIASES.get(
            (series, color), display_name
        )
        cleaned[barcode] = entry

    payload["barcodes"] = dict(sorted(cleaned.items()))
    payload["_meta"]["count"] = len(cleaned)
    payload["_meta"]["hex_source"] = (
        "https://www.dropbox.com/scl/fi/d6l3ylm58pr4tvpvd4ao0/"
        "Bambu-Filament-HEX-Colors.xlsx?rlkey=ncod1d51sw4espndqcv885hcw"
    )
    CATALOG_PATH.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"enriched {len(cleaned)} barcodes; unmatched {len(unmatched)}")
    for item in unmatched:
        print("UNMATCHED", item)


if __name__ == "__main__":
    main()
