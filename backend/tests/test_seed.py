"""FinPay seed script: correctness and idempotency."""

from sqlalchemy import func, select

from app import models
from app.scripts.seed import seed_database


def _counts(db):
    return {
        dataset: db.scalar(select(func.count()).select_from(model))
        for dataset, model in (
            ('assets', models.Asset),
            ('vulnerabilities', models.Vulnerability),
            ('controls', models.Control),
            ('risk_scenarios', models.RiskScenario),
            ('simulation_results', models.SimulationResult),
            ('remediation_tasks', models.RemediationTask),
            ('impact_assumptions', models.ImpactAssumption),
        )
    }


def test_seed_imports_all_three_datasets(db):
    reports = seed_database(db)
    assert set(reports) == {'assets', 'vulnerabilities', 'controls', 'risk_scenarios', 'remediations'}
    assert reports['assets'].created == 60
    # exact row counts come from the demo CSVs
    counts = _counts(db)
    assert counts['assets'] == 60
    assert counts['controls'] == 21
    assert counts['vulnerabilities'] > 100


def test_seed_preserves_external_asset_ids(db):
    seed_database(db)
    payment_db = db.query(models.Asset).filter_by(asset_id='A-001').one()
    assert payment_db.asset_name == 'Payment Processing Database'
    assert payment_db.criticality == 10
    assert payment_db.internet_facing is True


def test_seed_vulnerabilities_connect_to_assets_by_foreign_key(db):
    seed_database(db)
    payment_db = db.query(models.Asset).filter_by(asset_id='A-001').one()
    assert payment_db.vulnerabilities, 'A-001 must have imported findings'
    cves = {v.cve_id for v in payment_db.vulnerabilities}
    assert 'CVE-2099-0001' in cves
    # the FK really points at this asset row
    for vuln in payment_db.vulnerabilities:
        assert vuln.asset_row_id == payment_db.id
        assert vuln.asset.asset_id == 'A-001'


def test_repeated_seed_does_not_duplicate_anything(db):
    seed_database(db)
    counts_after_first = _counts(db)
    reports = seed_database(db)
    counts_after_second = _counts(db)

    assert counts_after_second == counts_after_first, 'repeat seed must be idempotent'
    for dataset, report in reports.items():
        assert report.created == 0, f'{dataset} should be all updates on re-seed'
        assert report.updated == report.rows_read
