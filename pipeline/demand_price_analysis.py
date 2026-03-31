"""
Demand-Price Analysis
Analyzes the relationship between price competitiveness and demand (quotes + LTL shipments).
Input:  pipeline/output/ltl_pivot_table.csv  (rows where price_gap is not null)
Output: pipeline/output/demand_price_analysis.csv  +  stdout summary
"""

import pathlib
import pandas as pd
from scipy import stats

# ── paths ────────────────────────────────────────────────────────────────────
HERE       = pathlib.Path(__file__).parent
INPUT_CSV  = HERE / "output" / "ltl_pivot_table.csv"
OUTPUT_CSV = HERE / "output" / "demand_price_analysis.csv"

# ── load & filter ─────────────────────────────────────────────────────────────
raw = pd.read_csv(INPUT_CSV, low_memory=False)
df  = raw[raw["price_gap"].notna() & (raw["price_gap"] != "")].copy()
df["price_gap"]        = pd.to_numeric(df["price_gap"],        errors="coerce")
df["competitor_rate"]  = pd.to_numeric(df["competitor_rate"],  errors="coerce")
df["warp_rate"]        = pd.to_numeric(df["warp_rate"],        errors="coerce")
df["total_quotes"]     = pd.to_numeric(df["total_quotes"],     errors="coerce").fillna(0)
df["ltl_shipments"]    = pd.to_numeric(df["ltl_shipments"],    errors="coerce").fillna(0)
df = df.dropna(subset=["price_gap", "competitor_rate"]).copy()

# ── derived columns ───────────────────────────────────────────────────────────
df["price_gap_pct"] = (df["price_gap"] / df["competitor_rate"] * 100).round(2)

quotes_median        = df["total_quotes"].median()
shipments_75th       = df[df["ltl_shipments"] > 0]["ltl_shipments"].quantile(0.75)
quotes_75th          = df["total_quotes"].quantile(0.75)

df["demand_tier"]    = df["total_quotes"].apply(lambda x: "High" if x >= quotes_median else "Low")
df["price_position"] = df["price_gap_pct"].apply(
    lambda x: "At Parity" if -2 <= x <= 2 else ("Warp Cheaper" if x < 0 else "More Expensive")
)
df["quadrant"] = df.apply(lambda r: (
    "Raise Price"     if r["demand_tier"] == "High" and r["price_position"] == "Warp Cheaper"   else
    "Losing Demand"   if r["demand_tier"] == "High" and r["price_position"] == "More Expensive" else
    "Hold or Raise"   if r["demand_tier"] == "Low"  and r["price_position"] == "Warp Cheaper"   else
    "Low Priority"
), axis=1)
df["demand_rank"] = df["total_quotes"].rank(ascending=False, method="min").astype(int)

# ── helpers ───────────────────────────────────────────────────────────────────
SEP  = "=" * 100
SEP2 = "-" * 100

def top3_carriers(series: pd.Series) -> str:
    counts = series.dropna().value_counts()
    return ", ".join(counts.head(3).index.tolist()) if len(counts) else "—"

def print_routes_table(sub: pd.DataFrame, cols=None):
    if cols is None:
        cols = ["origin3", "dest3", "total_quotes", "ltl_shipments",
                "price_gap_pct", "warp_rate", "competitor_rate", "competitor_carrier"]
    fmt = "{:<8} {:<8} {:>12} {:>14} {:>13} {:>11} {:>16} {}"
    print(fmt.format(*[c[:16] for c in cols]))
    print(SEP2)
    for _, r in sub.iterrows():
        print(fmt.format(
            str(r["origin3"]), str(r["dest3"]),
            f"{int(r['total_quotes']):,}", f"{int(r['ltl_shipments']):,}",
            f"{r['price_gap_pct']:+.1f}%",
            f"${r['warp_rate']:.0f}", f"${r['competitor_rate']:.0f}",
            str(r["competitor_carrier"])[:35],
        ))

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — Overall correlation
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + SEP)
print("  DEMAND–PRICE ANALYSIS")
print(SEP)

print("\n── SECTION 1: Overall Correlation ─────────────────────────────────────────\n")

def corr_pair(x_series, y_series, x_label, y_label):
    valid = pd.concat([x_series, y_series], axis=1).dropna()
    x, y  = valid.iloc[:, 0], valid.iloc[:, 1]
    pr, pp = stats.pearsonr(x, y)
    sr, sp = stats.spearmanr(x, y)
    print(f"  {x_label}  ↔  {y_label}  (n={len(x):,})")
    print(f"    Pearson  r = {pr:+.4f}  p = {pp:.4f}" + ("  *significant*" if pp < 0.05 else ""))
    print(f"    Spearman r = {sr:+.4f}  p = {sp:.4f}" + ("  *significant*" if sp < 0.05 else ""))
    return pr, pp, sr, sp

pr1, pp1, sr1, sp1 = corr_pair(df["price_gap_pct"], df["total_quotes"],  "price_gap_pct", "total_quotes")
print()
pr2, pp2, sr2, sp2 = corr_pair(df["price_gap_pct"], df["ltl_shipments"], "price_gap_pct", "ltl_shipments")

print()
sig_q = "Yes — higher price gap associated with different quote demand." if pp1 < 0.05 or sp1 < 0.05 else "No significant correlation detected between price gap and quote demand."
sig_s = "Yes — higher price gap associated with different LTL shipment volume." if pp2 < 0.05 or sp2 < 0.05 else "No significant correlation detected between price gap and LTL shipments."
print(f"  Interpretation (quotes):    {sig_q}")
print(f"  Interpretation (shipments): {sig_s}")

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — Demand by price gap bucket
# ═══════════════════════════════════════════════════════════════════════════════
print("\n\n── SECTION 2: Demand by Price Gap Bucket ───────────────────────────────────\n")

BUCKET_ORDER = [
    "Warp 20%+ cheaper",
    "Warp 10–20% cheaper",
    "Warp 0–10% cheaper",
    "At parity (±2%)",
    "Competitor 0–10% cheaper",
    "Competitor 10–20% cheaper",
    "Competitor 20%+ cheaper",
]

def assign_bucket(pct):
    if -2 <= pct <= 2:   return "At parity (±2%)"
    if pct < -20:         return "Warp 20%+ cheaper"
    if pct < -10:         return "Warp 10–20% cheaper"
    if pct < 0:           return "Warp 0–10% cheaper"
    if pct <= 10:         return "Competitor 0–10% cheaper"
    if pct <= 20:         return "Competitor 10–20% cheaper"
    return "Competitor 20%+ cheaper"

df["bucket"] = pd.Categorical(
    df["price_gap_pct"].apply(assign_bucket),
    categories=BUCKET_ORDER, ordered=True,
)

grp = df.groupby("bucket", observed=True)
bkt = grp.agg(
    route_count    = ("price_gap_pct",   "count"),
    total_quotes   = ("total_quotes",    "sum"),
    avg_quotes     = ("total_quotes",    "mean"),
    total_shipments= ("ltl_shipments",   "sum"),
    avg_shipments  = ("ltl_shipments",   "mean"),
).reset_index()
bkt["top_carriers"] = [top3_carriers(grp.get_group(b)["competitor_carrier"]) for b in bkt["bucket"]]

hdr = "{:<28} {:>8} {:>12} {:>11} {:>13} {:>11}  {}"
print(hdr.format("Bucket", "Routes", "TotalQuotes", "AvgQuotes", "TotalShipmnts", "AvgShipmnts", "Top Carriers"))
print(SEP2)
for _, r in bkt.iterrows():
    print(hdr.format(
        r["bucket"], int(r["route_count"]),
        f"{int(r['total_quotes']):,}", f"{r['avg_quotes']:.1f}",
        f"{int(r['total_shipments']):,}", f"{r['avg_shipments']:.1f}",
        r["top_carriers"],
    ))

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — Quadrant analysis
# ═══════════════════════════════════════════════════════════════════════════════
print("\n\n── SECTION 3: Quadrant Analysis ────────────────────────────────────────────\n")
print(f"  Demand split at median total_quotes = {quotes_median:.0f}\n")

QUADRANT_ORDER = ["Raise Price", "Losing Demand", "Hold or Raise", "Low Priority"]
qhdr = "{:<18} {:>8} {:>12} {:>14} {:>14}  {}"
print(qhdr.format("Quadrant", "Routes", "TotalQuotes", "TotalShipmnts", "AvgGapPct%", "Top 3 Routes (by quotes)"))
print(SEP2)

for quad in QUADRANT_ORDER:
    sub = df[df["quadrant"] == quad]
    if sub.empty:
        print(qhdr.format(quad, 0, 0, 0, "—", "—"))
        continue
    top3 = sub.nlargest(3, "total_quotes")
    routes_str = " | ".join(f"{r.origin3}→{r.dest3}({int(r.total_quotes):,}q)" for _, r in top3.iterrows())
    print(qhdr.format(
        quad, len(sub),
        f"{int(sub['total_quotes'].sum()):,}",
        f"{int(sub['ltl_shipments'].sum()):,}",
        f"{sub['price_gap_pct'].mean():+.1f}",
        routes_str,
    ))

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — Top 15 "losing demand to price"
# ═══════════════════════════════════════════════════════════════════════════════
print("\n\n── SECTION 4: Top 15 'Losing Demand to Price' Routes ───────────────────────")
print(f"   Filter: price_gap_pct > 5%  AND  total_quotes >= 75th pct ({quotes_75th:.0f})\n")

losing = (df[(df["price_gap_pct"] > 5) & (df["total_quotes"] >= quotes_75th)]
          .nlargest(15, "total_quotes"))
print_routes_table(losing)
print(f"\n  {len(losing)} routes shown.")

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 5 — Top 15 "leaving money on the table"
# ═══════════════════════════════════════════════════════════════════════════════
print("\n\n── SECTION 5: Top 15 'Leaving Money on the Table' Routes ──────────────────")
print(f"   Filter: price_gap_pct < -5%  AND  ltl_shipments >= 75th pct of routes with >0 shipments ({shipments_75th:.0f})\n")

money = (df[(df["price_gap_pct"] < -5) & (df["ltl_shipments"] >= shipments_75th)]
         .nlargest(15, "ltl_shipments"))
print_routes_table(money)
print(f"\n  {len(money)} routes shown.")

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 6 — High demand, Warp cheaper, zero bookings
# ═══════════════════════════════════════════════════════════════════════════════
print("\n\n── SECTION 6: Top 15 'High Demand, Warp Cheaper, Zero Bookings' ───────────")
print(f"   Filter: price_gap_pct < -5%  AND  total_quotes >= 75th pct ({quotes_75th:.0f})  AND  ltl_shipments == 0\n")

zero_booking = (df[
    (df["price_gap_pct"] < -5) &
    (df["total_quotes"] >= quotes_75th) &
    (df["ltl_shipments"] == 0)
].nlargest(15, "total_quotes"))
print_routes_table(zero_booking)
print(f"\n  {len(zero_booking)} routes shown.")

# ═══════════════════════════════════════════════════════════════════════════════
# OUTPUT CSV
# ═══════════════════════════════════════════════════════════════════════════════
out_cols = [
    "origin3", "dest3", "total_quotes", "ltl_shipments",
    "price_gap", "price_gap_pct", "warp_rate", "competitor_rate", "competitor_carrier",
    "demand_tier", "price_position", "quadrant", "demand_rank", "bucket",
]
df[out_cols].sort_values("demand_rank").to_csv(OUTPUT_CSV, index=False)

print("\n\n" + SEP)
print(f"  ✓  Saved {OUTPUT_CSV.relative_to(HERE.parent)}")
print(f"  ✓  {len(df):,} routes with price data  |  "
      f"median quotes = {quotes_median:.0f}  |  "
      f"75th pct shipments (>0) = {shipments_75th:.1f}")
print(SEP + "\n")


