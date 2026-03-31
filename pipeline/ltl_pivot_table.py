"""
LTL Pivot Table
Combines Google Drive quote data, SQL shipment data, and pricing CSV into
a single pivot table (one row per zip3 OD pair), sorted by total_quotes desc.

Output: pipeline/output/ltl_pivot_table.csv

Usage:
    uv run python ltl_pivot_table.py
"""

from __future__ import annotations

import csv
import re
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

import mysql.connector
import pandas as pd
from googleapiclient.discovery import build
from tqdm import tqdm

# Reuse auth + Drive + CSV helpers from run.py
sys.path.insert(0, str(Path(__file__).parent))
from run import (
    download_csv,
    find_column,
    folder_in_date_range,
    get_credentials,
    is_booked_value,
    list_csv_files_in_folder,
    list_drive_folders,
    parse_csv_bytes,
)

# ── Config ──────────────────────────────────────────────────────────────────────

OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_FILE = OUTPUT_DIR / "ltl_pivot_table.csv"
PRICING_CSV = Path("/Users/adamseri/Desktop/Code/wearewarp/LTL Quote Tool/top_lanes_quotes_output.csv")

START_DATE = date(2026, 1, 1)
END_DATE   = date(2026, 3, 30)

DB_HOST     = "datahub-mysql.wearewarp.link"
DB_PORT     = 3306
DB_USER     = "datahub-read"
DB_PASSWORD = "warpdbhub2"
DB_NAME     = "datahub"

WEEK_PATTERN = re.compile(r"^W\d{4} Quotes$")

# ── Google Drive ─────────────────────────────────────────────────────────────────

def fetch_drive_quotes() -> tuple[dict, dict, dict]:
    """Return (total_quotes, booked_quotes, booked_value_dist) keyed on (origin3, dest3)."""
    print("🔐 Authenticating with Google Drive…")
    creds = get_credentials()
    service = build("drive", "v3", credentials=creds)

    print(f"\n📅 Fetching week folders overlapping {START_DATE} → {END_DATE}…")
    all_folders = list_drive_folders(service, WEEK_PATTERN)
    matched = [f for f in all_folders if folder_in_date_range(f["name"], START_DATE, END_DATE)]
    matched.sort(key=lambda f: f["name"])

    if not matched:
        print("❌ No matching week folders found.")
        return {}, {}, {}

    print(f"   Found {len(matched)} folder(s): {[f['name'] for f in matched]}")

    total_quotes: dict[tuple, int]  = defaultdict(int)
    booked_quotes: dict[tuple, int] = defaultdict(int)
    booked_value_dist: dict[str, int] = defaultdict(int)

    for folder in matched:
        csv_files = list_csv_files_in_folder(service, folder["id"])
        if not csv_files:
            print(f"   ⚠️  No CSV files in '{folder['name']}'")
            continue
        print(f"\n📁 {folder['name']} — {len(csv_files)} file(s)")

        for csv_file in tqdm(csv_files, desc=f"  {folder['name']}", unit="file"):
            raw = download_csv(service, csv_file["id"])
            df  = parse_csv_bytes(raw, csv_file["name"])
            if df is None:
                continue

            origin_col = find_column(df.columns, "pickup Zip")
            dest_col   = find_column(df.columns, "dropoff Zip")
            booked_col = find_column(df.columns, "BOOKED")

            if origin_col is None or dest_col is None:
                tqdm.write(f"  ⚠️  {csv_file['name']}: missing origin/dest columns, skipping")
                continue

            df = df.copy()
            df["origin3"] = df[origin_col].astype(str).str.zfill(5).str[:3]
            df["dest3"]   = df[dest_col].astype(str).str.zfill(5).str[:3]

            valid = df[
                ~df["origin3"].isin(["", "nan", "000"]) &
                ~df["dest3"].isin(["", "nan", "000"])
            ]

            # Total quotes per OD pair
            for (o3, d3), cnt in valid.groupby(["origin3", "dest3"]).size().items():
                total_quotes[(o3, d3)] += cnt

            # Booked distribution + booked counts
            if booked_col is not None:
                raw_vals = valid[booked_col].astype(str).str.strip()
                for v, c in raw_vals.value_counts().items():
                    booked_value_dist[str(v)] += int(c)
                booked_mask = raw_vals.str.lower().isin({"true", "t", "1", "yes", "y"})
                booked_valid = valid[booked_mask]
                for (o3, d3), cnt in booked_valid.groupby(["origin3", "dest3"]).size().items():
                    booked_quotes[(o3, d3)] += cnt

    return dict(total_quotes), dict(booked_quotes), dict(booked_value_dist)

# ── SQL ──────────────────────────────────────────────────────────────────────────

def fetch_sql_shipments() -> dict[tuple, int]:
    """Return {(origin3, dest3): ltl_shipments} from datahub MySQL."""
    print("\n🗄️  Connecting to MySQL datahub…")
    conn = mysql.connector.connect(
        host=DB_HOST, port=DB_PORT,
        user=DB_USER, password=DB_PASSWORD,
        database=DB_NAME, connection_timeout=30,
    )
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
          LEFT(pickZipCode, 3)  AS origin3,
          LEFT(dropZipCode, 3)  AS dest3,
          COUNT(*)              AS ltl_shipments
        FROM otp_reports
        WHERE mainShipment   = 'YES'
          AND shipmentType   = 'Less Than Truckload'
          AND shipmentStatus = 'Complete'
          AND (equipment != 'Storage' OR equipment IS NULL)
          AND STR_TO_DATE(pickWindowFrom, '%m/%d/%Y %H:%i:%s') >= '2026-01-01'
          AND STR_TO_DATE(pickWindowFrom, '%m/%d/%Y %H:%i:%s') <  '2026-03-31'
        GROUP BY origin3, dest3
    """)
    results = {
        (str(o3), str(d3)): int(cnt)
        for o3, d3, cnt in cursor.fetchall()
        if o3 and d3
    }
    cursor.close()
    conn.close()
    print(f"   Got {len(results):,} SQL OD pairs")
    return results

# ── Pricing CSV ──────────────────────────────────────────────────────────────────

def load_pricing() -> dict[tuple, dict]:
    """Return {(origin3, dest3): {warp_rate, competitor_rate, competitor_carrier, price_gap}}."""
    print(f"\n💰 Loading pricing CSV…")
    if not PRICING_CSV.exists():
        print(f"   ⚠️  Not found: {PRICING_CSV}")
        return {}
    df = pd.read_csv(PRICING_CSV, dtype=str)
    df.columns = [c.strip() for c in df.columns]
    pricing: dict[tuple, dict] = {}
    for _, row in df.iterrows():
        o3 = str(row.get("Origin 3-Digit", "")).strip().zfill(3)
        d3 = str(row.get("Dest 3-Digit",   "")).strip().zfill(3)
        if not o3 or not d3 or o3 in ("nan", "000") or d3 in ("nan", "000"):
            continue

        def parse_rate(s: str) -> float | None:
            s = str(s).strip().replace("$", "").replace(",", "")
            try:
                return float(s) if s else None
            except ValueError:
                return None

        warp = parse_rate(row.get("Warp Rate", ""))
        comp = parse_rate(row.get("Cheapest Non-Warp Rate", ""))
        gap  = (warp - comp) if (warp is not None and comp is not None) else None
        carrier = str(row.get("Cheapest Non-Warp Carrier", "")).strip() or None
        if carrier == "nan":
            carrier = None
        pricing[(o3, d3)] = {
            "warp_rate": warp, "competitor_rate": comp,
            "competitor_carrier": carrier, "price_gap": gap,
        }
    print(f"   Loaded {len(pricing):,} pricing rows")
    return pricing

# ── Build + write pivot ───────────────────────────────────────────────────────────

def build_and_write(total_quotes, booked_quotes, sql_shipments, pricing) -> list[dict]:
    rows = []
    for (o3, d3), tq in total_quotes.items():
        bq   = booked_quotes.get((o3, d3), 0)
        brp  = round(bq / tq * 100, 2) if tq else 0.0
        ltl  = sql_shipments.get((o3, d3), 0)
        pd_  = pricing.get((o3, d3), {})
        rows.append({
            "origin3":            o3,
            "dest3":              d3,
            "total_quotes":       tq,
            "booked_quotes":      bq,
            "book_rate_pct":      brp,
            "ltl_shipments":      ltl,
            "price_gap":          pd_.get("price_gap"),
            "warp_rate":          pd_.get("warp_rate"),
            "competitor_rate":    pd_.get("competitor_rate"),
            "competitor_carrier": pd_.get("competitor_carrier"),
        })
    rows.sort(key=lambda r: r["total_quotes"], reverse=True)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "origin3", "dest3", "total_quotes", "booked_quotes", "book_rate_pct",
        "ltl_shipments", "price_gap", "warp_rate", "competitor_rate", "competitor_carrier",
    ]
    with OUTPUT_FILE.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n✅ Written {len(rows):,} rows → {OUTPUT_FILE}")
    return rows

# ── Summary ───────────────────────────────────────────────────────────────────────

def print_summary(rows: list[dict], booked_value_dist: dict) -> None:
    has_pricing   = sum(1 for r in rows if r["warp_rate"] is not None)
    has_shipments = sum(1 for r in rows if r["ltl_shipments"] > 0)

    print("\n" + "─" * 68)
    print(f"  Total zip3 OD routes        : {len(rows):,}")
    print(f"  Routes with pricing data    : {has_pricing:,}")
    print(f"  Routes with SQL shipments>0 : {has_shipments:,}")

    print(f"\n  Top 10 routes by total_quotes:")
    hdr = f"  {'orig':>5} {'dest':>5} {'total_q':>9} {'booked_q':>9} {'book%':>7} {'ltl_ship':>9} {'price_gap':>10}"
    print(hdr)
    for r in rows[:10]:
        pg = f"{r['price_gap']:+.2f}" if r["price_gap"] is not None else "NULL"
        print(
            f"  {r['origin3']:>5} {r['dest3']:>5} {r['total_quotes']:>9,} "
            f"{r['booked_quotes']:>9,} {r['book_rate_pct']:>6.2f}% "
            f"{r['ltl_shipments']:>9,} {pg:>10}"
        )

    print(f"\n  BOOKED column value distribution (top 20 by frequency):")
    for val, cnt in sorted(booked_value_dist.items(), key=lambda x: -x[1])[:20]:
        print(f"    {repr(val):>20}: {cnt:,}")
    print("─" * 68)

# ── Main ──────────────────────────────────────────────────────────────────────────

def main() -> None:
    total_quotes, booked_quotes, booked_value_dist = fetch_drive_quotes()
    sql_shipments = fetch_sql_shipments()
    pricing       = load_pricing()
    rows          = build_and_write(total_quotes, booked_quotes, sql_shipments, pricing)
    print_summary(rows, booked_value_dist)


if __name__ == "__main__":
    main()

