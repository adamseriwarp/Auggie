# WARP LTL Demand Map — Data Pipeline

This pipeline pulls ~13 weeks of daily LTL quote CSV files from Google Drive
and aggregates them into two JSON files consumed by the demand-map React app.

## Outputs

| File | Contents |
|------|----------|
| `output/origin_counts.json` | `{ "90210": 1500, … }` — total quote count per origin ZIP |
| `output/od_matrix.json` | `{ "90210": { "10001": 45 }, … }` — per-origin destination counts |

---

## Step 1 — Create a Google Cloud Project

1. Go to <https://console.cloud.google.com/> and sign in with the Google account that owns the Drive.
2. Click **Select a project → New Project**. Name it e.g. `warp-demand-map`.
3. Click **Create**.

---

## Step 2 — Enable the Google Drive API

1. In the Cloud Console, open **APIs & Services → Library**.
2. Search for **Google Drive API** and click **Enable**.

---

## Step 3 — Create OAuth 2.0 Credentials

1. Go to **APIs & Services → Credentials**.
2. Click **Create Credentials → OAuth client ID**.
3. If prompted, configure the **OAuth consent screen** first:
   - User type: **Internal** (if using a Google Workspace account) or **External**.
   - App name: `WARP Demand Map Pipeline`.
   - Add your email as a test user if External.
4. Back on **Create OAuth client ID**:
   - Application type: **Desktop app**.
   - Name: `pipeline`.
   - Click **Create**.
5. Click **Download JSON** and save the file as `pipeline/credentials.json`.

> ⚠️ `credentials.json` is listed in `.gitignore` and must **never** be committed.

---

## Step 4 — Share the Drive Folder

Make sure the Google account used for OAuth has at least **Viewer** access to the
top-level folder containing the week folders (e.g. `Week 1 2026`, `Week 2 2026`, …).

The folder names must follow the pattern `Week N YYYY` (e.g. `Week 5 2026`).

---

## Step 5 — Install `uv`

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Or via Homebrew: `brew install uv`

---

## Step 6 — Run the Pipeline

```bash
cd pipeline
uv run python run.py
```

**First run:** a browser window opens for Google sign-in. After authorising,
a `token.json` file is cached locally. Subsequent runs skip the browser step.

---

## Expected Output

```
🔐 Authenticating with Google Drive…
✅ Credentials cached at …/token.json

📅 Looking for 13 week folders…
   Found 13 matching folder(s): ['Week 3 2026', 'Week 4 2026', …]

📁 Week 3 2026 — 5 file(s)
  Week 3 2026: 100%|████████████| 5/5 [00:12<00:00]
…

──────────────────────────────────────────────────
✅ Pipeline complete
   Files processed   : 65  (skipped: 0)
   Rows processed    : 48,320
   Unique origins    : 842
   Unique OD pairs   : 9,104
   origin_counts.json: 14.2 KB  → pipeline/output/origin_counts.json
   od_matrix.json    : 284.7 KB  → pipeline/output/od_matrix.json
──────────────────────────────────────────────────
```

---

## Files

```
pipeline/
├── run.py              ← pipeline entry point
├── pyproject.toml      ← uv / Python project config
├── README.md           ← this file
├── .gitignore
├── credentials.json    ← ⚠️  NOT committed (you create this)
├── token.json          ← ⚠️  NOT committed (auto-created on first run)
└── output/             ← ⚠️  NOT committed
    ├── origin_counts.json
    └── od_matrix.json
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `credentials.json not found` | Follow Step 3 above |
| `No matching week folders found` | Verify folder naming (`Week N YYYY`) and sharing permissions |
| `missing columns` warning | Check the CSV header row in Drive; column names must include `pickup Zip` and `dropoff Zip` |
| Token refresh error | Delete `token.json` and re-run to reauthenticate |

---

## Shapefile Download — ZCTA → TopoJSON

The `download_shapefile.sh` script downloads US Census ZCTA (ZIP Code Tabulation Area) boundary polygons and converts them to TopoJSON for the Deck.gl choropleth map.

**Output:** `frontend/public/zcta.topojson`

**Prerequisites:**
- `curl`, `unzip` (macOS built-ins)
- `mapshaper` — install once: `npm install -g mapshaper`
- `python3` (macOS built-in, used for validation)

**Run from repo root:**

```bash
bash pipeline/download_shapefile.sh
```

**What it does:**
1. Downloads `tl_2023_us_zcta520.zip` (~513 MB) from the US Census TIGER/Line server
2. Unzips to a temp directory (auto-cleaned up on completion)
3. Converts shapefile → TopoJSON with 10% simplification (`mapshaper`)
4. Outputs `frontend/public/zcta.topojson` and reports file size & feature count

**Expected output:** ~36 MB, ~33,791 ZCTA features, each with a `ZCTA5CE20` property (5-digit zip string).

**To update to a newer year:** edit the `ZCTA_URL` variable in `download_shapefile.sh`.

