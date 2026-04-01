"""
Task F: Competitive Pricing Analysis Script
Merges competitive pricing CSV with actual LTL shipment data from datahub MySQL DB.
Classifies each route by pricing opportunity and outputs an enriched CSV.
"""

import os
import math
import pandas as pd
import mysql.connector

# ── Config ────────────────────────────────────────────────────────────────────

INPUT_CSV = os.path.join(os.path.dirname(__file__), "data", "top_lanes_quotes_combined.csv")
OUTPUT_CSV = os.path.join(os.path.dirname(__file__), "output", "competitive_analysis_enriched.csv")

DB_CONFIG = {
    "host": "datahub-mysql.wearewarp.link",
    "port": 3306,
    "user": "datahub-read",
    "password": "warpdbhub2",
    "database": "datahub",
    "connection_timeout": 30,
}

# ── Load input CSV ─────────────────────────────────────────────────────────────

def load_input_csv(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df.rename(columns={
        "Origin 3-Digit": "origin3",
        "Dest 3-Digit": "dest3",
        "Origin Zip": "origin_zip5",
        "Dest Zip": "dest_zip5",
        "Lane Volume": "quote_volume",
        "Warp Rate": "warp_rate",
        "Cheapest Non-Warp Rate": "competitor_rate",
        "Cheapest Non-Warp Carrier": "competitor_carrier",
    })
    # Normalize zip3 to zero-padded 3-char strings
    df["origin3"] = df["origin3"].astype(str).str.zfill(3)
    df["dest3"] = df["dest3"].astype(str).str.zfill(3)
    # Strip dollar signs and convert to float
    df["warp_rate"] = df["warp_rate"].astype(str).str.replace("$", "", regex=False).str.strip().astype(float)
    df["competitor_rate"] = df["competitor_rate"].astype(str).str.replace("$", "", regex=False).str.strip().astype(float)
    return df

# ── Query MySQL ────────────────────────────────────────────────────────────────
# Pull all rows (no correlated subquery) — deduplicate YES/NO logic in Python.

SQL = """
SELECT
    LEFT(pickZipCode, 3)   AS origin3,
    LEFT(dropZipCode, 3)   AS dest3,
    orderCode,
    mainShipment,
    revenueAllocationNumber,
    costAllocationNumber
FROM otp_reports
WHERE shipmentStatus = 'Complete'
  AND shipmentType = 'Less Than Truckload'
  AND (equipment != 'Storage' OR equipment IS NULL)
  AND STR_TO_DATE(pickWindowFrom, '%m/%d/%Y %H:%i:%s') >= '2026-01-01'
  AND STR_TO_DATE(pickWindowFrom, '%m/%d/%Y %H:%i:%s') < '2026-03-31'
"""

def query_db() -> pd.DataFrame:
    print("Connecting to datahub MySQL...")
    conn = mysql.connector.connect(**DB_CONFIG)
    try:
        print("Running SQL query (pulling all rows, deduplication in Python)...")
        cursor = conn.cursor(dictionary=True)
        cursor.execute(SQL)
        rows = cursor.fetchall()
        cursor.close()
    finally:
        conn.close()

    df = pd.DataFrame(rows)
    print(f"  → {len(df)} raw rows fetched from DB")

    if df.empty:
        return pd.DataFrame(columns=["origin3", "dest3", "booked_shipments", "total_revenue", "total_cost"])

    df["origin3"] = df["origin3"].astype(str).str.zfill(3)
    df["dest3"] = df["dest3"].astype(str).str.zfill(3)
    df["revenueAllocationNumber"] = pd.to_numeric(df["revenueAllocationNumber"], errors="coerce").fillna(0)
    df["costAllocationNumber"] = pd.to_numeric(df["costAllocationNumber"], errors="coerce").fillna(0)

    # YES/NO deduplication:
    # - Keep all NO rows
    # - Keep YES rows only for orders that have ZERO NO rows
    orders_with_no = set(df[df["mainShipment"] == "NO"]["orderCode"].unique())
    keep = df[(df["mainShipment"] == "NO") |
              ((df["mainShipment"] == "YES") & (~df["orderCode"].isin(orders_with_no)))]

    grouped = keep.groupby(["origin3", "dest3"], as_index=False).agg(
        booked_shipments=("orderCode", "nunique"),
        total_revenue=("revenueAllocationNumber", "sum"),
        total_cost=("costAllocationNumber", "sum"),
    )
    print(f"  → {len(grouped)} zip3 OD pairs after deduplication")
    return grouped

# ── Classify ───────────────────────────────────────────────────────────────────

def classify(row, high_vol_thresh, high_book_thresh):
    pdiff = row["price_diff_pct"]
    vol_high = row["quote_volume"] >= high_vol_thresh
    book_high = row["booked_shipments"] >= high_book_thresh and row["booked_shipments"] > 0

    if pdiff < -2:
        if book_high:
            return "Raise Price — High Priority"
        if vol_high:
            return "Raise Price — Medium Priority"
        return "Raise Price — Low Priority"
    if pdiff > 2:
        if book_high:
            return "At Risk — Investigate"
        if vol_high:
            return "Lower Price — High Priority"
        return "Lower Price — Low Priority"
    return "Competitive — Maintain"

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)

    quotes = load_input_csv(INPUT_CSV)
    print(f"Loaded {len(quotes)} routes from input CSV")

    sql_df = query_db()

    # Filter SQL results to only the input routes (in Python)
    route_keys = set(zip(quotes["origin3"], quotes["dest3"]))
    if not sql_df.empty and "origin3" in sql_df.columns:
        sql_filtered = sql_df[sql_df.apply(lambda r: (r["origin3"], r["dest3"]) in route_keys, axis=1)]
    else:
        sql_filtered = pd.DataFrame(columns=["origin3", "dest3", "booked_shipments", "total_revenue", "total_cost"])
    print(f"  → {len(sql_filtered)} of those pairs matched in SQL results")

    merged = quotes.merge(sql_filtered, on=["origin3", "dest3"], how="left")
    merged["booked_shipments"] = merged["booked_shipments"].fillna(0).astype(int)
    merged["total_revenue"] = merged["total_revenue"].fillna(0).astype(float)
    merged["total_cost"] = merged["total_cost"].fillna(0).astype(float)

    merged["price_diff_pct"] = (merged["warp_rate"] - merged["competitor_rate"]) / merged["competitor_rate"] * 100
    merged["margin_pct"] = merged.apply(
        lambda r: (r["total_revenue"] - r["total_cost"]) / r["total_revenue"] * 100
        if r["total_revenue"] > 0 else None, axis=1
    )

    # Compute thresholds (top 33%)
    vol_thresh = quotes["quote_volume"].quantile(0.67)
    booked_nonzero = merged[merged["booked_shipments"] > 0]["booked_shipments"]
    book_thresh = booked_nonzero.quantile(0.67) if len(booked_nonzero) > 0 else float("inf")

    merged["pricing_action"] = merged.apply(
        lambda r: classify(r, vol_thresh, book_thresh), axis=1
    )
    merged["priority_score"] = merged.apply(
        lambda r: abs(r["price_diff_pct"]) * math.log1p(r["quote_volume"] + r["booked_shipments"]), axis=1
    )

    out_cols = [
        "origin3", "dest3", "origin_zip5", "dest_zip5",
        "quote_volume", "warp_rate", "competitor_rate", "competitor_carrier",
        "price_diff_pct", "booked_shipments", "total_revenue", "total_cost",
        "margin_pct", "pricing_action", "priority_score",
    ]
    result = merged[out_cols].sort_values("priority_score", ascending=False)
    result.to_csv(OUTPUT_CSV, index=False)

    # Summary
    matched = merged[merged["booked_shipments"] > 0].shape[0]
    print(f"\n{'='*60}")
    print(f"COMPETITIVE PRICING ANALYSIS SUMMARY")
    print(f"{'='*60}")
    print(f"Total routes analyzed:   {len(result)}")
    print(f"Routes with SQL match:   {matched}")
    print(f"Routes without match:    {len(result) - matched}")
    print(f"\nPricing Action Distribution:")
    for action, count in result["pricing_action"].value_counts().items():
        print(f"  {action:<35} {count:>4}")
    print(f"\nOutput written to: {OUTPUT_CSV}")

if __name__ == "__main__":
    main()

