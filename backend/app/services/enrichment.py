"""Local KEV and EPSS enrichment from the checked-in data files.

Demo safety rule: the FinPay seed uses fictional CVEs of the form
CVE-2099-NNNN. Those are flagged ``data_source='demo'`` and their locally
uploaded KEV/EPSS values in the database are authoritative -- the real-world
KEV/EPSS files never claim anything about fictional CVEs, and lookups must
not silently "confirm" demo findings. Only CVEs with a real vintage year are
enriched from the local CISA-KEV-style and EPSS-style files (data source
from this repo's data directory; refresh those files to update the data).
"""

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
    return {cve.upper(): bool(add) for cve, add in data.items()}


@lru_cache(maxsize=1)
def load_epss_map(path: Path = EPSS_FILE) -> dict:
    if not path.exists():
        return {}
    result: dict = {}
    try:
        with path.open(newline='', encoding='utf-8') as handle:
            for row in csv.DictReader(handle):
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
    """Returns (kev_flag, data_source_kev). For fictional CVEs the DB value
    always wins and the source is 'demo'."""
    if is_fictional_cve(cve_id):
        return (bool(db_value), 'demo')
    flag = bool(db_value) or load_kev_index().get((cve_id or '').upper(), False)
    return (flag, SOURCE)


def get_epss_score(cve_id: str, db_value=None) -> tuple:
    """Returns (epss_score, data_source_epss). For fictional CVEs the DB value
    always wins. For real CVEs the richer of local-file and DB value is used."""
    if is_fictional_cve(cve_id):
        try:
            return (max(0.0, min(1.0, float(db_value or 0.0))), 'demo')
        except (TypeError, ValueError):
            return (0.0, 'demo')
    candidates = [0.0]
    try:
        if db_value is not None:
            candidates.append(max(0.0, min(1.0, float(db_value))))
    except (TypeError, ValueError):
        pass
    local = load_epss_map().get((cve_id or '').upper())
    if local is not None:
        candidates.append(local)
    return (max(candidates), SOURCE)


def enrich_finding(cve_id: str, db_kev, db_epss) -> dict:
    """One call returns the effective KEV/EPSS for scoring plus provenance."""
    kev_flag, kev_source = get_kev_status(cve_id, db_kev)
    epss_score, epss_source = get_epss_score(cve_id, db_epss)
    fictional = is_fictional_cve(cve_id)
    return {
        'kev': kev_flag,
        'epss': epss_score,
        'fictional': fictional,
        'data_source': 'demo' if fictional else 'local_sync',
        'kev_source': kev_source,
        'epss_source': epss_source,
    }
