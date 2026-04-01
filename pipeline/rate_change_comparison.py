"""
rate_change_comparison.py
Compares Warp and competitor rates between January and current quoting datasets.
Run from pipeline/ with: uv run python rate_change_comparison.py
"""

import pandas as pd
from pathlib import Path

# ── paths ──────────────────────────────────────────────────────────────────────
JAN_CSV = Path("../competitive-rates-dashboard/public/pivot_table_with_airports.csv")
NOW_CSV = Path("/Users/adamseri/Desktop/Code/wearewarp/LTL Quote Tool/top_lanes_quotes_output.csv")
OUT_DIR = Path("output")
OUT_CSV = OUT_DIR / "rate_change_comparison.csv"

# ── load & clean January data ──────────────────────────────────────────────────
jan = pd.read_csv(JAN_CSV)

# Parse origin3 / dest3 from zip3_route ("606-941")
jan[["origin3", "dest3"]] = jan["zip3_route"].str.split("-", expand=True)

# Drop rows missing Warp or competitor rate
jan = jan.dropna(subset=["min_warp_rate", "min_competitor_rate"])
jan["min_warp_rate"] = pd.to_numeric(jan["min_warp_rate"], errors="coerce")
jan["min_competitor_rate"] = pd.to_numeric(jan["min_competitor_rate"], errors="coerce")
jan = jan.dropna(subset=["min_warp_rate", "min_competitor_rate"])

jan_clean = jan[["origin3", "dest3", "min_warp_rate", "min_competitor_rate",
                 "competitor_carrier_name", "pct_difference"]].copy()
jan_clean.columns = ["origin3", "dest3", "warp_rate_jan", "competitor_rate_jan",
                     "carrier_jan", "pct_diff_jan"]

# ── load & clean current data ──────────────────────────────────────────────────
now = pd.read_csv(NOW_CSV)

# Strip $ and convert to float
def strip_dollar(series):
    return pd.to_numeric(series.astype(str).str.replace("$", "", regex=False).str.strip(), errors="coerce")

now["warp_rate_now"] = strip_dollar(now["Warp Rate"])
now["competitor_rate_now"] = strip_dollar(now["Cheapest Non-Warp Rate"])
now["origin3"] = now["Origin 3-Digit"].astype(str).str.strip()
now["dest3"] = now["Dest 3-Digit"].astype(str).str.strip()

now_clean = now[["origin3", "dest3", "warp_rate_now", "competitor_rate_now",
                 "Cheapest Non-Warp Carrier"]].copy()
now_clean.columns = ["origin3", "dest3", "warp_rate_now", "competitor_rate_now", "carrier_now"]
now_clean = now_clean.dropna(subset=["warp_rate_now", "competitor_rate_now"])

# ── inner join ─────────────────────────────────────────────────────────────────
merged = jan_clean.merge(now_clean, on=["origin3", "dest3"], how="inner")

# ── computed columns ───────────────────────────────────────────────────────────
merged["warp_rate_change"] = merged["warp_rate_now"] - merged["warp_rate_jan"]
merged["warp_rate_change_pct"] = merged["warp_rate_change"] / merged["warp_rate_jan"] * 100

merged["competitor_rate_change"] = merged["competitor_rate_now"] - merged["competitor_rate_jan"]
merged["competitor_rate_change_pct"] = merged["competitor_rate_change"] / merged["competitor_rate_jan"] * 100

merged["pct_diff_now"] = (merged["warp_rate_now"] - merged["competitor_rate_now"]) / merged["competitor_rate_now"] * 100
merged["competitiveness_change"] = merged["pct_diff_now"] - merged["pct_diff_jan"]

merged["carrier_changed"] = merged["carrier_jan"].str.strip() != merged["carrier_now"].str.strip()

# ── sort & write output ────────────────────────────────────────────────────────
merged["_abs_comp_change"] = merged["competitiveness_change"].abs()
merged = merged.sort_values("_abs_comp_change", ascending=False).drop(columns=["_abs_comp_change"])

col_order = [
    "origin3", "dest3",
    "warp_rate_jan", "warp_rate_now", "warp_rate_change", "warp_rate_change_pct",
    "competitor_rate_jan", "competitor_rate_now", "competitor_rate_change", "competitor_rate_change_pct",
    "pct_diff_jan", "pct_diff_now", "competitiveness_change",
    "carrier_jan", "carrier_now", "carrier_changed",
]
merged = merged[col_order]

OUT_DIR.mkdir(exist_ok=True)
merged.to_csv(OUT_CSV, index=False)

# ── summary ────────────────────────────────────────────────────────────────────
n = len(merged)
more_competitive = (merged["competitiveness_change"] < 0).sum()
less_competitive = (merged["competitiveness_change"] > 0).sum()
carrier_changes = merged["carrier_changed"].sum()

print(f"\n{'='*60}")
print(f"  RATE CHANGE COMPARISON SUMMARY")
print(f"{'='*60}")
print(f"Routes matched (inner join):        {n}")
print(f"")
print(f"Avg Warp rate change:               ${merged['warp_rate_change'].mean():+.2f}  ({merged['warp_rate_change_pct'].mean():+.2f}%)")
print(f"Avg competitor rate change:         ${merged['competitor_rate_change'].mean():+.2f}  ({merged['competitor_rate_change_pct'].mean():+.2f}%)")
print(f"")
print(f"More competitive (comp_change < 0): {more_competitive} routes")
print(f"Less competitive (comp_change > 0): {less_competitive} routes")
print(f"Carrier changed:                    {carrier_changes} routes")

def fmt_row(row):
    return (f"  {row['origin3']}-{row['dest3']:>3}  "
            f"Warp: ${row['warp_rate_jan']:.0f}→${row['warp_rate_now']:.0f}  "
            f"Comp: ${row['competitor_rate_jan']:.0f}→${row['competitor_rate_now']:.0f}  "
            f"CompChange: {row['competitiveness_change']:+.2f}%")

print(f"\nTop 10 LESS competitive routes (competitiveness_change most positive):")
for _, row in merged.nlargest(10, "competitiveness_change").iterrows():
    print(fmt_row(row))

print(f"\nTop 10 MORE competitive routes (competitiveness_change most negative):")
for _, row in merged.nsmallest(10, "competitiveness_change").iterrows():
    print(fmt_row(row))

print(f"\nOutput written to: {OUT_CSV.resolve()}")
print(f"{'='*60}\n")

