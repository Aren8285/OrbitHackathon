"""Rebuild only the authorized demo company's data, with atomic rollback."""
from dataclasses import asdict
import threading

from fastapi import HTTPException
from sqlalchemy import func, select

from app import models
from app.database import Base
from app.scripts import seed
from app.services import csv_import, risk_service

_rebuild_lock = threading.Lock()


def validate_demo_files():
    for path, name, columns, row_model in [
        (seed.ASSETS_CSV, 'assets', csv_import.ASSET_COLUMNS, csv_import.AssetRow),
        (seed.VULNS_CSV, 'vulnerabilities', csv_import.VULNERABILITY_COLUMNS, csv_import.VulnerabilityRow),
        (seed.CONTROLS_CSV, 'controls', csv_import.CONTROL_COLUMNS, csv_import.ControlRow),
    ]:
        parsed = csv_import.parse_csv_bytes(path.read_bytes(), name, columns)
        _, errors = csv_import.validate_rows(parsed.rows, row_model)
        csv_import.reject_errors(name, errors)


def rebuild_demo(db):
    if db.info.get('company_id', models.FINPAY_COMPANY_ID) != models.FINPAY_COMPANY_ID:
        raise HTTPException(status_code=403, detail='Company access denied')
    with _rebuild_lock:
        try:
            validate_demo_files()
            mapped = {mapper.local_table: mapper.class_ for mapper in Base.registry.mappers}
            # Delete children before parents through scoped ORM operations. Never
            # drop global tables or delete another company's data from an API call.
            for table in reversed(Base.metadata.sorted_tables):
                model = mapped.get(table)
                if model is not None and issubclass(model, models.CompanyOwned):
                    for row in db.scalars(select(model).where(model.company_id == models.FINPAY_COMPANY_ID)).all():
                        db.delete(row)
                    db.flush()
            reports = seed.seed_database(db, commit=False)
            summary = risk_service.calculate(db, commit=False)
            counts = {
                name: db.scalar(select(func.count()).select_from(model))
                for name, model in [
                    ('assets', models.Asset), ('vulnerabilities', models.Vulnerability),
                    ('controls', models.Control), ('risk_scenarios', models.RiskScenario),
                    ('simulation_results', models.SimulationResult), ('remediations', models.RemediationTask),
                ]
            }
            db.commit()
            return {**{name: asdict(report) for name, report in reports.items()},
                    'rebuilt': True, 'counts': counts, 'summary': summary}
        except Exception:
            db.rollback()
            raise
