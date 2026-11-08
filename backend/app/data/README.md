# Bambu barcode catalog

`bambu_barcodes.json` maps Bambu Lab EAN-13 packaging barcodes to the filament
data used by the barcode onboarding flow.

Source:
https://docs.google.com/spreadsheets/d/1Sd5G7rxpmxu3dANn1IJRvPyXcLwF7me2FMyZ0vcHboY/edit

The community sheet covers the `697533703000`–`697533703999` GS1 range and is
maintained by Bambu Lab users. The snapshot in this directory was generated on
2026-11-08 from the sheet's CSV export. Descriptions are parsed into material,
series, colour, and net spool weight.

Colour hex values come from the community Bambu filament hex workbook:
https://www.dropbox.com/scl/fi/d6l3ylm58pr4tvpvd4ao0/Bambu-Filament-HEX-Colors.xlsx?rlkey=ncod1d51sw4espndqcv885hcw

The workbook covers the main Bambu series; missing series (PETG Basic, PLA
Tough, supports, engineering materials, and a few special colours) are filled
from Bambu store / 3DFilamentProfiles colour tables in the enrichment script.

Regenerate it with:

```bash
cd backend
python scripts/import_bambu_gtins.py /path/to/bambu-products.csv
python scripts/enrich_bambu_hex.py /path/to/bambu-hex.xlsx
```

The current snapshot has 260 filament barcodes, all with a hex colour.

The two barcodes verified against physical PLA Matte boxes are included as
explicit overrides in `app/services/bambu_catalog.py`.
