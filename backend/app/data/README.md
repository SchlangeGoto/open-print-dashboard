# Bambu barcode catalog

`bambu_barcodes.json` maps Bambu Lab EAN-13 packaging barcodes to the filament
data used by the barcode onboarding flow.

Source:
https://docs.google.com/spreadsheets/d/1Sd5G7rxpmxu3dANn1IJRvPyXcLwF7me2FMyZ0vcHboY/edit

The community sheet covers the `697533703000`–`697533703999` GS1 range and is
maintained by Bambu Lab users. The snapshot in this directory was generated on
2026-11-08 from the sheet's CSV export. Descriptions are parsed into material,
series, colour, and net spool weight; missing colour hex values fall back to a
neutral swatch in the app.

Regenerate it with:

```bash
cd backend
python scripts/import_bambu_gtins.py /path/to/bambu-products.csv
```

The two barcodes verified against physical PLA Matte boxes are included as
explicit overrides in `app/services/bambu_catalog.py`.
