"""Local values are authoritative by CVE key; missing keys use imported CSV values."""

import csv
import json
import re
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / 'data'
KEV_FILE = DATA_DIR / 'kev.json'
EPSS_FILE = DATA_DIR / 'epss.csv'

DEMO_CVE_YEAR = 2099  # FinPay demo year; real CVE vintages are lower today
CVE_PATTERN = re.compile(r'^CVE-(\d{4})-\d{4,7}$')

SOURCE = 'local_files'


def is_fictional_cve(cve_id: str) -> bool:
    """True for the FinPay demo CVEs (CVE-2099-NNNN). Never real data."""
    match = CVE_PATTERN.match((cve_id or '').upper())
    return bool(match and int(match.group(1)) >= DEMO_CVE_YEAR)


@lru_cache(maxsize=1)
def load_kev_index(path: Path = KEV_FILE) -> dict:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except (ValueError, OSError):
        return {}
    if not isinstance(data, dict):
        return {}
    vulnerabilities = data.get('vulnerabilities')
    if isinstance(vulnerabilities, list):
        # Real CISA KEV catalog export: {"vulnerabilities": [{"cveID": ...}, ...]}.
        result = {}
        for entry in vulnerabilities:
            if isinstance(entry, dict):
                cve = str(entry.get('cveID') or '').strip().upper()
                if cve:
                    result[cve] = True
        return result
    # Fixture format: flat {"CVE-....": true} mapping.
    return {cve.upper(): bool(add) for cve, add in data.items() if isinstance(cve, str)}


@lru_cache(maxsize=1)
def load_epss_map(path: Path = EPSS_FILE) -> dict:
    if not path.exists():
        return {}
    result: dict = {}
    try:
        with path.open(newline='', encoding='utf-8') as handle:
            # Real EPSS exports start with '#' metadata lines before the CSV
            # header; fixture files may omit them. Strip comments so
            # DictReader always sees `cve,epss[,percentile]` as the header.
            rows = (line for line in handle if line.strip() and not line.lstrip().startswith('#'))
            for row in csv.DictReader(rows):
                cve = (row.get('cve') or '').strip().upper()
                score = (row.get('epss') or '').strip()
                if cve and score:
                    try:
                        result[cve] = max(0.0, min(1.0, float(score)))
                    except ValueError:
                        continue
    except OSError:
        return {}
    return result


def get_kev_status(cve_id: str, db_value=None) -> tuple:
    key = (cve_id or '').strip().upper()
    local = load_kev_index()
    if key in local:
        return bool(local[key]), SOURCE
    return bool(db_value), 'demo' if is_fictional_cve(key) else 'csv_fallback'


def get_epss_score(cve_id: str, db_value=None) -> tuple:
    key = (cve_id or '').strip().upper()
    local = load_epss_map()
    if key in local:
        return local[key], SOURCE
    try:
        value = max(0.0, min(1.0, float(db_value or 0)))
    except (TypeError, ValueError):
        value = 0.0
    return value, 'demo' if is_fictional_cve(key) else 'csv_fallback'


def enrich_finding(cve_id: str, db_kev, db_epss) -> dict:
    kev, kev_source = get_kev_status(cve_id, db_kev)
    epss, epss_source = get_epss_score(cve_id, db_epss)
    fictional = is_fictional_cve(cve_id)
    return dict(kev=kev, epss=epss, fictional=fictional,
                data_source='local_sync' if SOURCE in (kev_source, epss_source) else ('demo' if fictional else 'csv_fallback'),
                kev_source=kev_source, epss_source=epss_source)
