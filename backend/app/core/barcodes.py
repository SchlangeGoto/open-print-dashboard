"""Barcode normalization shared by the API and the catalog.

Bambu boxes carry an EAN-13. Scanners sometimes report a GTIN-14 with a
leading packaging zero, or prefix the value with the AIM identifier ``]E0``.
Normalising in one place keeps the barcode key space consistent.
"""

import re

GTIN_PREFIX = "]E0"
_EAN13_RE = re.compile(r"^\d{13}$")


def normalize_barcode(code: str) -> str:
    value = code.strip()
    if value.startswith(GTIN_PREFIX):
        value = value[len(GTIN_PREFIX) :]
    if len(value) == 14 and value.startswith("0") and value.isdigit():
        value = value[1:]
    # UPC-A (12 digits) is the same product as EAN-13 with a leading zero.
    if len(value) == 12 and value.isdigit():
        value = f"0{value}"
    return value


def ean13_check_digit(first_twelve: str) -> int:
    total = sum(
        int(digit) * (1 if index % 2 == 0 else 3)
        for index, digit in enumerate(first_twelve)
    )
    return (10 - total % 10) % 10


def is_valid_ean13(code: str) -> bool:
    if not _EAN13_RE.match(code):
        return False
    return int(code[12]) == ean13_check_digit(code[:12])
