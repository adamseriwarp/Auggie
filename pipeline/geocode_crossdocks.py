#!/usr/bin/env python3
"""Geocode Warp crossdock addresses using the free Census Geocoder API."""
import csv
import json
import time
import urllib.request
import urllib.parse
import sys

CSV_PATH = "/Users/adamseri/Downloads/warp crossdocks - Sheet1.csv"
OUT_PATH = "frontend/src/data/crossdocks.json"
BASE_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"

crossdocks = []
skipped = []
failed = []

with open(CSV_PATH, newline="", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    rows = list(reader)

for row in rows:
    dock = row["Dock"].strip()
    address = row["Address"].strip()

    if not address:
        print(f"SKIP  {dock}: empty address")
        skipped.append(dock)
        continue

    params = urllib.parse.urlencode({
        "address": address,
        "benchmark": "Public_AR_Current",
        "format": "json",
    })
    url = f"{BASE_URL}?{params}"

    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = json.loads(resp.read())
        matches = data["result"]["addressMatches"]
        if matches:
            coords = matches[0]["coordinates"]
            lat = round(coords["y"], 6)
            lng = round(coords["x"], 6)
            crossdocks.append({"id": dock, "address": address, "lat": lat, "lng": lng})
            print(f"OK    {dock}: {lat}, {lng}")
        else:
            print(f"FAIL  {dock}: no match for '{address}'")
            failed.append(dock)
    except Exception as e:
        print(f"ERROR {dock}: {e}")
        failed.append(dock)

    time.sleep(0.15)  # be polite to the free API

with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(crossdocks, f, indent=2)

print(f"\n=== Results ===")
print(f"Geocoded: {len(crossdocks)}")
print(f"Skipped (empty address): {len(skipped)} — {skipped}")
print(f"Failed (no match/error): {len(failed)} — {failed}")
print(f"Output written to {OUT_PATH}")

