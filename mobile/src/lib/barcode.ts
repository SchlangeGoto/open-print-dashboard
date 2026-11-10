import type { BarcodeType } from "expo-camera";

/**
 * Linear formats only. Bambu boxes may use Code128 for the product code,
 * while the square QR is just a short link and is intentionally ignored.
 */
export const LINEAR_BARCODE_TYPES: BarcodeType[] = [
  "ean13",
  "ean8",
  "upc_a",
  "upc_e",
  "code128",
  "code39",
  "code93",
  "itf14",
  "codabar",
];

/** Formats whose payload is a GTIN and may be padded/normalised. */
const GTIN_BARCODE_TYPES = new Set([
  "ean13",
  "ean8",
  "upc_a",
  "upc_e",
  "itf14",
]);

/**
 * ITF-14 carton codes often wrap an EAN-13 with a leading packaging zero.
 *
 * Only GTIN formats are rewritten. A 12-digit Code128 payload is not a UPC-A,
 * and padding it would turn it into an EAN-13 with a bad check digit.
 */
export function normalizeBarcode(
  raw: string,
  type?: string | null,
): string {
  const value = raw.trim();
  if (type && !GTIN_BARCODE_TYPES.has(type)) {
    return value;
  }
  if (/^\d{14}$/.test(value) && value.startsWith("0")) {
    return value.slice(1);
  }
  // UPC-A (12 digits) is the same product as EAN-13 with a leading zero.
  // iOS and Android report the two forms differently, so pad to one key.
  if (/^\d{12}$/.test(value)) {
    return `0${value}`;
  }
  return value;
}
