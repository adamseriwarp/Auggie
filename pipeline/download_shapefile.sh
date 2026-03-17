#!/usr/bin/env bash
# download_shapefile.sh
# Downloads the US Census ZCTA shapefile, dissolves it into 3-digit ZIP prefix zones, and converts to TopoJSON.
# Output: frontend/public/scf.topojson
#
# Usage: bash pipeline/download_shapefile.sh
#   Run from the repo root.

set -euo pipefail

ZCTA_URL="https://www2.census.gov/geo/tiger/TIGER2023/ZCTA520/tl_2023_us_zcta520.zip"
TMP_DIR="$(mktemp -d)"
ZIP_FILE="$TMP_DIR/zcta.zip"
EXTRACT_DIR="$TMP_DIR/zcta_shp"
OUTPUT_DIR="frontend/public"
OUTPUT_FILE="$OUTPUT_DIR/scf.topojson"

echo "=== ZCTA Shapefile Downloader ==="
echo "Temp dir: $TMP_DIR"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Check that mapshaper is available
if ! command -v mapshaper &>/dev/null; then
  echo "ERROR: mapshaper not found. Install with: npm install -g mapshaper"
  exit 1
fi

# 1. Download
echo ""
echo "[1/4] Downloading ZCTA shapefile..."
curl -L --progress-bar -o "$ZIP_FILE" "$ZCTA_URL"
echo "  Downloaded: $(du -sh "$ZIP_FILE" | cut -f1)"

# 2. Unzip
echo ""
echo "[2/4] Unzipping..."
mkdir -p "$EXTRACT_DIR"
unzip -q "$ZIP_FILE" -d "$EXTRACT_DIR"
SHP_FILE="$(find "$EXTRACT_DIR" -name "*.shp" | head -1)"
echo "  Shapefile: $SHP_FILE"

# 3. Convert to TopoJSON with simplification and dissolve to 3-digit ZIP zones
echo ""
echo "[3/4] Converting to TopoJSON, dissolving to 3-digit ZIP zones..."
mapshaper "$SHP_FILE" \
  -simplify 10% keep-shapes \
  -each 'ZIP3=ZCTA5CE20.substring(0,3)' \
  -dissolve2 ZIP3 \
  -o format=topojson "$OUTPUT_FILE"

# 4. Report
echo ""
echo "[4/4] Done!"
SIZE=$(du -sh "$OUTPUT_FILE" | cut -f1)
echo "  Output:    $OUTPUT_FILE"
echo "  File size: $SIZE"

# Validate and report feature count (use python3 — file too large for node require())
FEATURE_COUNT=$(python3 -c "
import json, sys
with open('$OUTPUT_FILE') as f:
    d = json.load(f)
obj = d['objects'][list(d['objects'].keys())[0]]
print(len(obj['geometries']))
" 2>/dev/null || echo "unknown")
echo "  Features:  $FEATURE_COUNT"

# Cleanup
rm -rf "$TMP_DIR"
echo ""
echo "=== Complete ==="

