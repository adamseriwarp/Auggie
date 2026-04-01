"""
Recommended Pricing
Computes a recommended price for every route in the pricing CSV.

Input:
  ~/Desktop/Code/wearewarp/LTL Quote Tool/top_lanes_quotes_output.csv
  pipeline/output/demand_price_analysis.csv  (left-joined)

Output:
  pipeline/output/recommended_pricing.csv  +  stdout summary
"""

import pathlib
import pandas as pd

# ── paths ─────────────────────────────────────────────────────────────────────
HERE        = pathlib.Path(__file__).parent
QUOTES_CSV  = pathlib.Path.home() / "Desktop/Code/wearewarp/LTL Quote Tool/top_lanes_quotes_output.csv"
DEMAND_CSV  = HERE / "output" / "demand_price_analysis.csv"
PIVOT_CSV   = HERE / "output" / "ltl_pivot_table.csv"
JAN_CSV     = HERE / "output" / "rate_change_comparison.csv"
OUTPUT_CSV  = HERE / "output" / "recommended_pricing.csv"

# ── load ──────────────────────────────────────────────────────────────────────
quotes = pd.read_csv(QUOTES_CSV, dtype=str)
demand = pd.read_csv(DEMAND_CSV, dtype=str)
pivot  = pd.read_csv(PIVOT_CSV, dtype=str)
jan    = pd.read_csv(JAN_CSV, dtype=str)

# ── clean & parse ─────────────────────────────────────────────────────────────
def strip_dollar(series: pd.Series) -> pd.Series:
    return series.str.replace("$", "", regex=False).str.strip().astype(float)

quotes["warp_rate"]       = strip_dollar(quotes["Warp Rate"])
quotes["competitor_rate"] = strip_dollar(quotes["Cheapest Non-Warp Rate"])

quotes["origin3"] = quotes["Origin 3-Digit"].str.strip()
quotes["dest3"]   = quotes["Dest 3-Digit"].str.strip()

# keep only first 5 chars of zip (already 5-digit strings, just be safe)
quotes["origin_zip5"] = quotes["Origin Zip"].str.strip().str[:5]
quotes["dest_zip5"]   = quotes["Dest Zip"].str.strip().str[:5]

quotes["competitor_carrier"] = quotes["Cheapest Non-Warp Carrier"].str.strip()

# ── left-join demand data ─────────────────────────────────────────────────────
demand["origin3"] = demand["origin3"].str.strip()
demand["dest3"]   = demand["dest3"].str.strip()

demand_cols = ["origin3", "dest3", "total_quotes", "ltl_shipments", "quadrant"]
demand_slim = demand[demand_cols].copy()

df = quotes.merge(demand_slim, on=["origin3", "dest3"], how="left")

# ── left-join booked_quotes from pivot table ──────────────────────────────────
pivot["origin3"] = pivot["origin3"].str.strip()
pivot["dest3"]   = pivot["dest3"].str.strip()

pivot_slim = pivot[["origin3", "dest3", "booked_quotes"]].copy()

df = df.merge(pivot_slim, on=["origin3", "dest3"], how="left")
df["booked_quotes"] = pd.to_numeric(df["booked_quotes"], errors="coerce").fillna(0).astype(int)

# ── left-join January rates ───────────────────────────────────────────────────
jan["origin3"] = jan["origin3"].str.strip()
jan["dest3"]   = jan["dest3"].str.strip()

jan_slim = jan[["origin3", "dest3", "warp_rate_jan", "competitor_rate_jan"]].copy()
jan_slim["warp_rate_jan"]       = pd.to_numeric(jan_slim["warp_rate_jan"],       errors="coerce")
jan_slim["competitor_rate_jan"] = pd.to_numeric(jan_slim["competitor_rate_jan"], errors="coerce")

df = df.merge(jan_slim, on=["origin3", "dest3"], how="left")

# ── compute recommended pricing ───────────────────────────────────────────────
df["recommended_price"] = (df["competitor_rate"] * 0.95).round(2)
df["price_change"]      = (df["recommended_price"] - df["warp_rate"]).round(2)
df["price_change_pct"]  = (df["price_change"] / df["warp_rate"] * 100).round(2)

def assign_action(delta: float) -> str:
    if delta < -1:
        return "Lower Price"
    if delta > 1:
        return "Raise Price"
    return "At Target"

df["action"] = df["price_change"].apply(assign_action)

# ── select & sort output columns ──────────────────────────────────────────────
out_cols = [
    "origin3", "dest3", "origin_zip5", "dest_zip5",
    "warp_rate", "warp_rate_jan", "competitor_rate", "competitor_rate_jan", "competitor_carrier",
    "recommended_price", "price_change", "price_change_pct", "action",
    "total_quotes", "booked_quotes", "ltl_shipments", "quadrant",
]
df = df[out_cols].copy()
df["abs_price_change"] = df["price_change"].abs()
df = df.sort_values("abs_price_change", ascending=False).drop(columns="abs_price_change")

# ── write csv ─────────────────────────────────────────────────────────────────
df.to_csv(OUTPUT_CSV, index=False)

# ── print summary ─────────────────────────────────────────────────────────────
lower = df[df["action"] == "Lower Price"]
raise_ = df[df["action"] == "Raise Price"]

print("\n" + "=" * 70)
print("  RECOMMENDED PRICING SUMMARY")
print("=" * 70)

print(f"\n  Routes needing a price DECREASE:  {len(lower):>4} routes")
if len(lower):
    print(f"    Avg price_change:      ${lower['price_change'].mean():>8.2f}")
    print(f"    Avg price_change_pct:   {lower['price_change_pct'].mean():>7.2f}%")

print(f"\n  Routes that CAN RAISE price:       {len(raise_):>4} routes")
if len(raise_):
    print(f"    Avg price_change:      ${raise_['price_change'].mean():>8.2f}")
    print(f"    Avg price_change_pct:   {raise_['price_change_pct'].mean():>7.2f}%")

at_target = df[df["action"] == "At Target"]
print(f"\n  Routes already At Target:          {len(at_target):>4} routes")

print("\n" + "-" * 70)
print("  TOP 10 ROUTES BY ABS(PRICE CHANGE):")
print("-" * 70)

top10 = df.head(10)
hdr = f"  {'O3':>4} {'D3':>4}  {'Warp':>8}  {'Comp':>8}  {'Rec':>8}  {'Chg':>8}  {'Chg%':>7}  {'Action':<12}  Carrier"
print(hdr)
print("  " + "-" * 65)
for _, r in top10.iterrows():
    print(
        f"  {r['origin3']:>4} {r['dest3']:>4}  "
        f"${r['warp_rate']:>7.2f}  ${r['competitor_rate']:>7.2f}  "
        f"${r['recommended_price']:>7.2f}  "
        f"{r['price_change']:>+8.2f}  {r['price_change_pct']:>+6.1f}%  "
        f"{r['action']:<12}  {r['competitor_carrier']}"
    )

print("\n" + "=" * 70)
print(f"  ✓  Saved {OUTPUT_CSV.relative_to(HERE.parent)}")
print("=" * 70 + "\n")

# ── sample: 5 rows showing booked_quotes ──────────────────────────────────────
print("  SAMPLE (5 rows) — booked_quotes column:")
print(df[["origin3", "dest3", "total_quotes", "booked_quotes", "action"]].head(5).to_string(index=False))
print()

# ── sample: 5 rows showing Jan rate columns ───────────────────────────────────
print("  SAMPLE (5 rows) — Jan rate columns:")
print(df[["origin3", "dest3", "warp_rate", "warp_rate_jan", "competitor_rate", "competitor_rate_jan"]].head(5).to_string(index=False))
print()

