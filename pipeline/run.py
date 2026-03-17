"""
WARP LTL Quote Demand Pipeline
Fetches ~13 weeks of daily CSV files from Google Drive and aggregates
pickup/dropoff zip code data into JSON files for the demand map.

Usage:
    uv run python run.py

On first run: opens browser for Google OAuth. Caches token in token.json.
"""

from __future__ import annotations

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

# How many past weeks of data to pull (inclusive of current partial week)
WEEKS_TO_FETCH = 13

# Columns we care about (case-insensitive match applied at read time)
ORIGIN_COL = "pickup Zip"
DEST_COL = "dropoff Zip"


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


# ── Main ────────────────────────────────────────────────────────────────────────

def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

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

    total_rows = 0
    total_files = 0
    skipped_files = 0
    total_excluded_rate = 0

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

            if ORIGIN_COL not in df.columns or DEST_COL not in df.columns:
                tqdm.write(
                    f"  ⚠️  {csv_file['name']}: missing columns "
                    f"(found: {list(df.columns)[:6]}…)"
                )
                skipped_files += 1
                continue

            # Only count quotes with WARP services (non-empty rate)
            rows_before_filter = len(df)
            df = df[df['rate'].notna() & (df['rate'].astype(str).str.strip() != '')]
            rows_excluded = rows_before_filter - len(df)
            total_excluded_rate += rows_excluded

            # Use 3-digit ZIP prefix (SCF zones)
            df['origin3'] = df[ORIGIN_COL].astype(str).str.zfill(5).str[:3]
            df['dest3'] = df[DEST_COL].astype(str).str.zfill(5).str[:3]

            rows_before = total_rows
            for _, row in df.iterrows():
                origin3 = str(row['origin3']).strip()
                dest3 = str(row['dest3']).strip()

                if origin3 in ("", "nan", "000") or dest3 in ("", "nan", "000"):
                    continue

                origin_counts[origin3] += 1
                od_matrix[origin3][dest3] += 1
                total_rows += 1

            total_files += 1

    # Write outputs
    origin_out = OUTPUT_DIR / "origin_counts.json"
    od_out = OUTPUT_DIR / "od_matrix.json"

    # Convert defaultdicts to plain dicts for JSON serialisation
    plain_od = {o: dict(dests) for o, dests in od_matrix.items()}

    origin_out.write_text(json.dumps(dict(origin_counts), indent=2))
    od_out.write_text(json.dumps(plain_od, indent=2))

    unique_od = sum(len(dests) for dests in plain_od.values())

    # Summary
    print("\n" + "─" * 50)
    print("✅ Pipeline complete")
    print(f"   Files processed   : {total_files:,}  (skipped: {skipped_files})")
    print(f"   Rows processed    : {total_rows:,}")
    print(f"   Rows excluded     : {total_excluded_rate:,}  (empty rate)")
    print(f"   Unique origins    : {len(origin_counts):,}")
    print(f"   Unique OD pairs   : {unique_od:,}")
    print(f"   origin_counts.json: {origin_out.stat().st_size / 1024:.1f} KB  → {origin_out}")
    print(f"   od_matrix.json    : {od_out.stat().st_size / 1024:.1f} KB  → {od_out}")
    print("─" * 50)


if __name__ == "__main__":
    main()

