"""
WARP LTL Quote Demand Pipeline
Fetches ~13 weeks of daily CSV files from Google Drive and aggregates
pickup/dropoff zip code data into JSON files for the demand map.

Usage:
    uv run python run.py

On first run: opens browser for Google OAuth. Caches token in token.json.
"""

from __future__ import annotations

import csv
import io
import json
import os
import re
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from tqdm import tqdm

# ── Config ─────────────────────────────────────────────────────────────────────

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
CREDENTIALS_FILE = Path(__file__).parent / "credentials.json"
TOKEN_FILE = Path(__file__).parent / "token.json"
OUTPUT_DIR = Path(__file__).parent / "output"
DASHBOARD_PUBLIC_DIR = Path(__file__).parent.parent / "competitive-rates-dashboard" / "public"

# How many past weeks of data to pull (inclusive of current partial week)
WEEKS_TO_FETCH = 13

# Columns we care about (case-insensitive match applied at read time)
ORIGIN_COL = "pickup Zip"
DEST_COL = "dropoff Zip"
BOOKED_COL = "BOOKED"
RATE_COL = "rate"


# ── Auth ───────────────────────────────────────────────────────────────────────

def get_credentials() -> Credentials:
    """Return valid OAuth2 credentials, running the auth flow if needed."""
    creds = None

    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CREDENTIALS_FILE.exists():
                raise FileNotFoundError(
                    f"credentials.json not found at {CREDENTIALS_FILE}.\n"
                    "See README.md for how to create OAuth credentials in Google Cloud Console."
                )
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_FILE), SCOPES)
            creds = flow.run_local_server(port=0)

        TOKEN_FILE.write_text(creds.to_json())
        print(f"✅ Credentials cached at {TOKEN_FILE}")

    return creds


# ── Drive helpers ───────────────────────────────────────────────────────────────

def list_drive_folders(service, name_pattern: re.Pattern) -> list[dict]:
    """Return all Drive folders whose name matches name_pattern."""
    results = []
    page_token = None
    query = "mimeType='application/vnd.google-apps.folder' and trashed=false"

    while True:
        resp = service.files().list(
            q=query,
            fields="nextPageToken, files(id, name)",
            pageSize=200,
            pageToken=page_token,
            includeItemsFromAllDrives=True,
            supportsAllDrives=True,
        ).execute()

        for f in resp.get("files", []):
            if name_pattern.match(f["name"]):
                results.append(f)

        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    return results


def list_csv_files_in_folder(service, folder_id: str) -> list[dict]:
    """Return all CSV files directly inside a Drive folder."""
    query = (
        f"'{folder_id}' in parents "
        "and mimeType='text/csv' "
        "and trashed=false"
    )
    resp = service.files().list(
        q=query,
        fields="files(id, name)",
        pageSize=100,
        includeItemsFromAllDrives=True,
        supportsAllDrives=True,
    ).execute()
    return resp.get("files", [])


def download_csv(service, file_id: str) -> bytes:
    """Download a Drive file and return its raw bytes."""
    request = service.files().get_media(fileId=file_id, supportsAllDrives=True)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return buf.getvalue()


# ── Week folder filtering ───────────────────────────────────────────────────────

def target_week_labels(num_weeks: int = WEEKS_TO_FETCH) -> set[str]:
    """
    Return a set of week folder name strings for the past `num_weeks` weeks.
    Folder format: W{WW}{YY} e.g. "W0126" = Week 1, 2026
    Uses ISO week numbers.
    """
    today = datetime.today()
    labels: set[str] = set()
    for delta in range(num_weeks):
        d = today - timedelta(weeks=delta)
        iso_week = d.isocalendar()[1]
        year = d.isocalendar()[0]
        labels.add(f"W{iso_week:02d}{str(year)[2:]} Quotes")
    return labels


# ── CSV parsing ─────────────────────────────────────────────────────────────────

def parse_csv_bytes(data: bytes, filename: str) -> pd.DataFrame | None:
    """Parse CSV bytes into a DataFrame. Returns None on failure."""
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            df = pd.read_csv(io.BytesIO(data), encoding=encoding, dtype=str, low_memory=False)
            # Normalize column names (strip whitespace)
            df.columns = [c.strip() for c in df.columns]
            return df
        except UnicodeDecodeError:
            continue
        except Exception as exc:
            print(f"  ⚠️  Could not parse {filename}: {exc}")
            return None
    print(f"  ⚠️  Encoding failure on {filename}, skipping.")
    return None


def find_column(columns, target: str) -> str | None:
    """Return the actual column name matching target, case-insensitively."""
    normalized = {str(col).strip().lower(): col for col in columns}
    return normalized.get(target.strip().lower())


def is_booked_value(value) -> bool:
    """Interpret common truthy BOOKED values from Drive CSV exports."""
    return str(value).strip().lower() in {"true", "t", "1", "yes", "y"}


# ── Main ────────────────────────────────────────────────────────────────────────

def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    DASHBOARD_PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    print("🔐 Authenticating with Google Drive…")
    creds = get_credentials()
    service = build("drive", "v3", credentials=creds)

    # Find target week folders
    target_labels = target_week_labels(WEEKS_TO_FETCH)
    week_pattern = re.compile(r"^W\d{4} Quotes$")

    print(f"\n📅 Looking for {WEEKS_TO_FETCH} week folders…")
    all_folders = list_drive_folders(service, week_pattern)
    matched = [f for f in all_folders if f["name"] in target_labels]
    matched.sort(key=lambda f: f["name"])

    if not matched:
        print("❌ No matching week folders found in Drive. Check sharing permissions.")
        return

    print(f"   Found {len(matched)} matching folder(s): {[f['name'] for f in matched]}")

    # Aggregate
    origin_counts: dict[str, int] = defaultdict(int)
    od_matrix: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    route_booking_stats: dict[str, dict[str, int]] = defaultdict(lambda: {
        "quote_count": 0,
        "booked_count": 0,
    })

    # 5-digit ZIP service coverage aggregations
    serviced_origin_zip5: dict[str, int] = defaultdict(int)
    unserviced_origin_zip5: dict[str, int] = defaultdict(int)
    serviced_dest_zip5: dict[str, int] = defaultdict(int)
    unserviced_dest_zip5: dict[str, int] = defaultdict(int)
    od_serviced: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    od_unserviced: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    # 3-digit SCF-level service coverage (parallel to od_serviced but keyed on 3-digit prefix)
    od_serviced_3digit: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    total_rows = 0
    total_files = 0
    skipped_files = 0

    for folder in matched:
        csv_files = list_csv_files_in_folder(service, folder["id"])
        if not csv_files:
            print(f"   ⚠️  No CSV files in '{folder['name']}'")
            continue

        print(f"\n📁 {folder['name']} — {len(csv_files)} file(s)")

        for csv_file in tqdm(csv_files, desc=f"  {folder['name']}", unit="file"):
            raw = download_csv(service, csv_file["id"])
            df = parse_csv_bytes(raw, csv_file["name"])

            if df is None:
                skipped_files += 1
                continue

            origin_col = find_column(df.columns, ORIGIN_COL)
            dest_col = find_column(df.columns, DEST_COL)
            booked_col = find_column(df.columns, BOOKED_COL)
            rate_col = find_column(df.columns, RATE_COL)

            if origin_col is None or dest_col is None:
                tqdm.write(
                    f"  ⚠️  {csv_file['name']}: missing columns "
                    f"(found: {list(df.columns)[:6]}…)"
                )
                skipped_files += 1
                continue

            if booked_col is None:
                tqdm.write(
                    f"  ⚠️  {csv_file['name']}: missing BOOKED column; booked counts will default to false."
                )

            if rate_col is None:
                tqdm.write(
                    f"  ⚠️  {csv_file['name']}: missing rate column; all rows will be treated as unserviced."
                )

            # Use 3-digit ZIP prefix (SCF zones)
            df['origin3'] = df[origin_col].astype(str).str.zfill(5).str[:3]
            df['dest3'] = df[dest_col].astype(str).str.zfill(5).str[:3]
            # Use full 5-digit ZIP (zero-padded)
            df['origin5'] = df[origin_col].astype(str).str.zfill(5).str[:5]
            df['dest5'] = df[dest_col].astype(str).str.zfill(5).str[:5]

            for _, row in df.iterrows():
                origin3 = str(row['origin3']).strip()
                dest3 = str(row['dest3']).strip()

                if origin3 in ("", "nan", "000") or dest3 in ("", "nan", "000"):
                    continue

                origin_counts[origin3] += 1
                od_matrix[origin3][dest3] += 1
                route_key = f"{origin3}-{dest3}"
                route_booking_stats[route_key]["quote_count"] += 1
                if booked_col is not None and is_booked_value(row[booked_col]):
                    route_booking_stats[route_key]["booked_count"] += 1
                total_rows += 1

                # 5-digit ZIP service coverage (US ZIPs only: all digits)
                origin5 = str(row['origin5']).strip()
                dest5 = str(row['dest5']).strip()
                if origin5.isdigit() and dest5.isdigit() and origin5 != "00000" and dest5 != "00000":
                    rate_val = row[rate_col] if rate_col is not None else None
                    is_serviced = (
                        rate_col is not None
                        and rate_val is not None
                        and str(rate_val).strip() not in ("", "nan")
                    )
                    if is_serviced:
                        serviced_origin_zip5[origin5] += 1
                        serviced_dest_zip5[dest5] += 1
                        od_serviced[origin5][dest5] += 1
                        od_serviced_3digit[origin3][dest3] += 1
                    else:
                        unserviced_origin_zip5[origin5] += 1
                        unserviced_dest_zip5[dest5] += 1
                        od_unserviced[origin5][dest5] += 1

            total_files += 1

    # Write outputs
    origin_out = OUTPUT_DIR / "origin_counts.json"
    od_out = OUTPUT_DIR / "od_matrix.json"
    booking_out = OUTPUT_DIR / "route_booking_stats.json"
    dashboard_booking_out = DASHBOARD_PUBLIC_DIR / "route_booking_stats.json"

    # Convert defaultdicts to plain dicts for JSON serialisation
    plain_od = {o: dict(dests) for o, dests in od_matrix.items()}
    plain_route_booking = {
        route: {
            "quote_count": stats["quote_count"],
            "booked_count": stats["booked_count"],
            "book_rate": (stats["booked_count"] / stats["quote_count"]) if stats["quote_count"] else 0,
        }
        for route, stats in sorted(route_booking_stats.items())
    }
    total_quotes = sum(stats["quote_count"] for stats in plain_route_booking.values())
    total_booked = sum(stats["booked_count"] for stats in plain_route_booking.values())
    booking_payload = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "weeks": [f["name"] for f in matched],
        "totals": {
            "quote_count": total_quotes,
            "booked_count": total_booked,
            "book_rate": (total_booked / total_quotes) if total_quotes else 0,
        },
        "routes": plain_route_booking,
    }

    origin_out.write_text(json.dumps(dict(origin_counts), indent=2))
    od_out.write_text(json.dumps(plain_od, indent=2))
    booking_out.write_text(json.dumps(booking_payload, indent=2))
    dashboard_booking_out.write_text(json.dumps(booking_payload, indent=2))

    # Write 6 new 5-digit ZIP service coverage files
    serviced_origin_out = OUTPUT_DIR / "serviced_origin_zips.json"
    unserviced_origin_out = OUTPUT_DIR / "unserviced_origin_zips.json"
    serviced_dest_out = OUTPUT_DIR / "serviced_dest_zips.json"
    unserviced_dest_out = OUTPUT_DIR / "unserviced_dest_zips.json"
    od_serviced_out = OUTPUT_DIR / "od_serviced.json"
    od_unserviced_out = OUTPUT_DIR / "od_unserviced.json"

    serviced_origin_out.write_text(json.dumps(dict(serviced_origin_zip5), indent=2))
    unserviced_origin_out.write_text(json.dumps(dict(unserviced_origin_zip5), indent=2))
    serviced_dest_out.write_text(json.dumps(dict(serviced_dest_zip5), indent=2))
    unserviced_dest_out.write_text(json.dumps(dict(unserviced_dest_zip5), indent=2))
    od_serviced_out.write_text(json.dumps({o: list(d.keys()) for o, d in od_serviced.items()}, indent=2))
    od_unserviced_out.write_text(json.dumps({o: list(d.keys()) for o, d in od_unserviced.items()}, indent=2))

    # Write top serviced lanes at 3-digit SCF level, sorted by count descending
    top_serviced_lanes_out = OUTPUT_DIR / "top_serviced_lanes.csv"
    top_serviced_rows = sorted(
        (
            (origin3, dest3, count)
            for origin3, dests in od_serviced_3digit.items()
            for dest3, count in dests.items()
        ),
        key=lambda r: r[2],
        reverse=True,
    )
    with top_serviced_lanes_out.open("w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["origin3", "dest3", "count"])
        writer.writerows(top_serviced_rows)

    unique_od = sum(len(dests) for dests in plain_od.values())

    # Summary
    print("\n" + "─" * 50)
    print("✅ Pipeline complete")
    print(f"   Files processed   : {total_files:,}  (skipped: {skipped_files})")
    print(f"   Rows processed    : {total_rows:,}")
    print(f"   Unique origins    : {len(origin_counts):,}")
    print(f"   Unique OD pairs   : {unique_od:,}")
    print(f"   origin_counts.json: {origin_out.stat().st_size / 1024:.1f} KB  → {origin_out}")
    print(f"   od_matrix.json    : {od_out.stat().st_size / 1024:.1f} KB  → {od_out}")
    print(
        f"   route_booking_stats.json: {booking_out.stat().st_size / 1024:.1f} KB  → {booking_out}"
    )
    print(
        f"   dashboard booking stats : {dashboard_booking_out.stat().st_size / 1024:.1f} KB  → {dashboard_booking_out}"
    )
    print(f"   Unique serviced origin zips   : {len(serviced_origin_zip5):,}")
    print(f"   Unique unserviced origin zips : {len(unserviced_origin_zip5):,}")
    print(f"   Unique serviced dest zips     : {len(serviced_dest_zip5):,}")
    print(f"   Unique unserviced dest zips   : {len(unserviced_dest_zip5):,}")
    print(f"   serviced_origin_zips.json : {serviced_origin_out.stat().st_size / 1024:.1f} KB  → {serviced_origin_out}")
    print(f"   unserviced_origin_zips.json: {unserviced_origin_out.stat().st_size / 1024:.1f} KB  → {unserviced_origin_out}")
    print(f"   serviced_dest_zips.json   : {serviced_dest_out.stat().st_size / 1024:.1f} KB  → {serviced_dest_out}")
    print(f"   unserviced_dest_zips.json : {unserviced_dest_out.stat().st_size / 1024:.1f} KB  → {unserviced_dest_out}")
    print(f"   od_serviced.json          : {od_serviced_out.stat().st_size / 1024:.1f} KB  → {od_serviced_out}")
    print(f"   od_unserviced.json        : {od_unserviced_out.stat().st_size / 1024:.1f} KB  → {od_unserviced_out}")
    print(f"   top_serviced_lanes.csv    : {top_serviced_lanes_out.stat().st_size / 1024:.1f} KB  ({len(top_serviced_rows):,} rows)  → {top_serviced_lanes_out}")
    print("─" * 50)


if __name__ == "__main__":
    main()

