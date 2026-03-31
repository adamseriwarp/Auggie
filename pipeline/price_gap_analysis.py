"""
Price Gap Analysis
Analyzes the relationship between price competitiveness and booking rate.
Input:  pipeline/output/competitive_analysis_enriched.csv
Output: pipeline/output/price_gap_analysis.csv  +  stdout table
"""

import pathlib
import pandas as pd
from scipy import stats

# ── paths ────────────────────────────────────────────────────────────────────
HERE = pathlib.Path(__file__).parent
INPUT_CSV  = HERE / "output" / "competitive_analysis_enriched.csv"
OUTPUT_CSV = HERE / "output" / "price_gap_analysis.csv"

# ── load ─────────────────────────────────────────────────────────────────────
df = pd.read_csv(INPUT_CSV)

# ── bucket assignment ─────────────────────────────────────────────────────────
def assign_bucket(pct: float) -> str:
    if -2 <= pct <= 2:
        return "Roughly at parity"
    if pct < -20:
        return "Warp 20%+ cheaper"
    if pct < -10:
        return "Warp 10–20% cheaper"
    if pct < 0:
        return "Warp 0–10% cheaper"
    if pct <= 10:
        return "Competitor 0–10% cheaper"
    if pct <= 20:
        return "Competitor 10–20% cheaper"
    return "Competitor 20%+ cheaper"

BUCKET_ORDER = [
    "Warp 20%+ cheaper",
    "Warp 10–20% cheaper",
    "Warp 0–10% cheaper",
    "Roughly at parity",
    "Competitor 0–10% cheaper",
    "Competitor 10–20% cheaper",
    "Competitor 20%+ cheaper",
]

df["bucket"] = df["price_diff_pct"].apply(assign_bucket)
df["bucket"] = pd.Categorical(df["bucket"], categories=BUCKET_ORDER, ordered=True)

# ── 1. bucket summary ─────────────────────────────────────────────────────────
grp = df.groupby("bucket", observed=True)

summary = grp.agg(
    route_count            = ("price_diff_pct", "count"),
    total_quote_volume     = ("quote_volume",     "sum"),
    total_booked_shipments = ("booked_shipments", "sum"),
    routes_with_bookings   = ("booked_shipments", lambda s: (s > 0).sum()),
    avg_price_diff_pct     = ("price_diff_pct",   "mean"),
).reset_index()

summary["implied_win_rate_pct"] = (
    summary["total_booked_shipments"] / summary["total_quote_volume"] * 100
).round(2)
summary["avg_price_diff_pct"] = summary["avg_price_diff_pct"].round(2)

# ── 3. top competitor per bucket ──────────────────────────────────────────────
top_carrier = (
    df.groupby(["bucket", "competitor_carrier"], observed=True)
      .size()
      .reset_index(name="n")
      .sort_values("n", ascending=False)
      .groupby("bucket", observed=True)
      .first()["competitor_carrier"]
      .reset_index()
      .rename(columns={"competitor_carrier": "top_competitor"})
)

summary = summary.merge(top_carrier, on="bucket", how="left")

# ── 2. correlation ────────────────────────────────────────────────────────────
corr_df = df[df["quote_volume"] > 0].copy()
corr_df["win_rate"] = corr_df["booked_shipments"] / corr_df["quote_volume"]
corr_df = corr_df.dropna(subset=["price_diff_pct", "win_rate"])

pearson_r, pearson_p   = stats.pearsonr(corr_df["price_diff_pct"], corr_df["win_rate"])
spearman_r, spearman_p = stats.spearmanr(corr_df["price_diff_pct"], corr_df["win_rate"])

# ── print table ───────────────────────────────────────────────────────────────
print("\n" + "=" * 100)
print("  PRICE GAP ANALYSIS — Booking Rate by Price Competitiveness Bucket")
print("=" * 100)

col_fmt = "{:<26} {:>8} {:>12} {:>12} {:>10} {:>12} {:>12} {:<20}"
header = col_fmt.format(
    "Bucket", "Routes", "QuoteVol", "Booked", "WithBkgs",
    "WinRate%", "AvgGap%", "Top Competitor"
)
print(header)
print("-" * 100)

for _, row in summary.iterrows():
    print(col_fmt.format(
        row["bucket"],
        int(row["route_count"]),
        int(row["total_quote_volume"]),
        int(row["total_booked_shipments"]),
        int(row["routes_with_bookings"]),
        f"{row['implied_win_rate_pct']:.2f}",
        f"{row['avg_price_diff_pct']:+.1f}",
        str(row["top_competitor"]),
    ))

print("-" * 100)
print(f"\n  Correlation between price_diff_pct and per-route win rate (n={len(corr_df):,} routes):")
print(f"    Pearson  r = {pearson_r:+.4f}  (p={pearson_p:.4f})")
print(f"    Spearman r = {spearman_r:+.4f}  (p={spearman_p:.4f})")
print()

# ── write csv ─────────────────────────────────────────────────────────────────
summary.to_csv(OUTPUT_CSV, index=False)
print(f"  ✓  Saved {OUTPUT_CSV.relative_to(HERE.parent)}")
print()

