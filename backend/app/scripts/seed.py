"""Repeatable FinPay seed script.

Import the three demo CSVs (assets, vulnerabilities, controls) using the same
validated import service that backs the API, so seeding and uploads share one
code path. Safe to run any number of times: every row is upserted by its
external key and duplicate asset-CVE findings are skipped.

Usage (from backend/):
    python -m app.scripts.seed            # seed the FinPay demo data
    python -m app.scripts.seed --reset    # drop and recreate the database first
"""

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DIR = REPO_ROOT / 'demo-data'

ASSETS_CSV = DEMO_DIR / 'finpay_assets.csv'
VULNS_CSV = DEMO_DIR / 'finpay_vulns.csv'
CONTROLS_CSV = DEMO_DIR / 'finpay_controls.csv'


def seed_database(db) -> dict:
    """Seed all three FinPay datasets; returns a summary report."""
    from app.services import csv_import

    missing = [path for path in (ASSETS_CSV, VULNS_CSV, CONTROLS_CSV) if not path.exists()]
    if missing:
        raise FileNotFoundError(f'Demo CSVs not found (looked in {DEMO_DIR}): {[p.name for p in missing]}')

    report = {}
    report['assets'] = csv_import.import_assets(db, ASSETS_CSV.read_bytes())
    report['vulnerabilities'] = csv_import.import_vulnerabilities(db, VULNS_CSV.read_bytes())
    report['controls'] = csv_import.import_controls(db, CONTROLS_CSV.read_bytes())
    return report


def reset_database() -> None:
    from app.database import Base, engine

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def main() -> int:
    parser = argparse.ArgumentParser(description='Seed the RiskOps database with the FinPay demo data.')
    parser.add_argument('--reset', action='store_true', help='drop and recreate all tables before seeding')
    args = parser.parse_args()

    if args.reset:
        reset_database()

    from app.database import SessionLocal

    db = SessionLocal()
    try:
        reports = seed_database(db)
        for dataset, report in reports.items():
            print(
                f'{dataset}: read={report.rows_read} created={report.created} '
                f'updated={report.updated} skipped={report.skipped}'
            )
        print('Seed complete.')
    finally:
        db.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
