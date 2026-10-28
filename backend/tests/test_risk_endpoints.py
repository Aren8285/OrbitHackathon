"""Tests that /risk and /assumptions return real database-derived, scored data."""

import math

from sqlalchemy.orm import Session

from app import models
from app.services import risk_service, scoring
from app.scripts.seed import seed_database

from tests.conftest import db as _db_fixture  # noqa: F401  (fixtures are injected by pytest)


def _seed(db: Session):
    seed_database(db)
    return db


def test_summary_is_derived_from_seeded_database(db, client):
    _seed(db)
    body = client.get('/api/risk/summary').json()
    assert body['total_assets'] == 60
    assert body['total_vulnerabilities'] == 186
    expected_open = db.query(models.Vulnerability).filter_by(status='open').count()
    assert body['open_vulnerabilities'] == expected_open
    assert body['kev_vulnerabilities'] >= 1
    # money comes only from labeled assumptions, never fabricated
    expected_exposure = sum(
        int(round(risk_service.asset_criticality(a) * scoring.DEFAULT_FULL_IMPACT_INR))
        for a in db.query(models.Asset).all()
    )
    assert body['assumed_exposure_inr'] == expected_exposure
    assert 'assumption' in body['financial_note'].lower()
    assert len(body['top_risks']) == 5
    assert all({'asset_id', 'priority_label', 'expected_annual_loss_inr', 'p95_inr'} <= row.keys()
               for row in body['top_risks'])


def test_payment_asset_detail_includes_same_scenario_loss_range(client):
    seeded = client.post('/api/demo/seed')
    assert seeded.status_code == 200
    asset = client.get('/api/assets/A-001').json()
    assert asset['coverage'] == 'linked'
    assert asset['expected_annual_loss_inr'] > 0
    assert 0 <= asset['p50_inr'] <= asset['p95_inr']
    assert len(asset['scenario_losses']) == 1
    assert asset['scenario_losses'][0]['scenario_key'] == 'ransomware'
    listed = next(row for row in client.get('/api/risk/assets').json() if row['asset_id'] == 'A-001')
    assert listed['p50_inr'] == asset['p50_inr'] and listed['p95_inr'] == asset['p95_inr']


def test_asset_without_scenario_has_explicit_coverage_and_optimizer_warning(client):
    assert client.post('/api/demo/seed').status_code == 200
    asset = client.get('/api/assets/A-004').json()
    assert asset['coverage'] == 'none'
    assert asset['coverage_reason'] == 'No risk scenario is linked to this asset'
    assert asset['expected_annual_loss_inr'] is None
    response = client.get('/api/optimizer/recommend?asset_id=A-004&budget=1000000')
    assert response.status_code == 200
    assert response.json()['warning'] == asset['coverage_reason']


def test_payment_db_finding_row_is_scored_correctly(db, client):
    _seed(db)
    rows = client.get('/api/risk/rankings').json()
    target = next(
        r for r in rows if r['asset_id'] == 'A-001' and r['cve_id'] == 'CVE-2099-0001'
    )
    assert math.isclose(target['criticality'], 0.96, abs_tol=1e-9)
    assert math.isclose(target['exposure'], 0.864, abs_tol=1e-9)
    assert math.isclose(target['technical_risk'], 0.9392, abs_tol=1e-9)
    # priority = 0.3 KEV + 0.2*0.82 EPSS + 0.2 internet + 0.15*0.96 crit + 0.15*0.96 financial
    assert math.isclose(target['priority'], 0.3 + 0.164 + 0.2 + 0.144 + 0.144, abs_tol=1e-9)
    assert target['assumed_impact_inr'] == 9_600_000  # 0.96 x 1 crore reference (editable)
    assert target['fictional'] is True
    assert target['data_source'] == 'demo'


def test_rankings_sorted_by_priority_descending(db, client):
    _seed(db)
    rows = client.get('/api/risk/rankings').json()
    assert len(rows) > 50  # whole demo dataset, open findings only
    priorities = [r['priority'] for r in rows]
    assert priorities == sorted(priorities, reverse=True)
    assert rows[0]['asset_id'] == 'A-001'  # demo story: payment DB ransomware tops the list


def test_open_only_filter(db, client):
    _seed(db)
    closed_total = db.query(models.Vulnerability).filter(models.Vulnerability.status != 'open').count()
    assert closed_total > 0
    open_rows = client.get('/api/risk/rankings').json()
    all_rows = client.get('/api/risk/rankings?open_only=false').json()
    assert len(all_rows) == len(open_rows) + closed_total


def test_asset_rankings_are_db_derived_and_descending(db, client):
    _seed(db)
    rows = client.get('/api/risk/assets').json()
    assert len(rows) == 60
    priorities = [r['max_priority'] for r in rows]
    assert priorities == sorted(priorities, reverse=True)
    top = rows[0]
    assert top['asset_id'] == 'A-001'
    assert top['kev_findings'] == 1
    assert math.isclose(top['criticality'], 0.96, abs_tol=1e-9)


def test_impact_assumption_defaults_are_visible_and_labeled(db, client):
    _seed(db)
    body = client.get('/api/assumptions/impact/A-001').json()
    assert body['is_assumption'] is True
    assert body['basis'] == 'default'
    assert body['assumed_impact_inr'] == 9_600_000
    assert body['default_impact_inr'] == 9_600_000
    listing = client.get('/api/assumptions/impact').json()
    assert len(listing) == 60
    assert all(i['is_assumption'] for i in listing)


def test_impact_assumption_edit_propagates_into_rankings(db, client):
    _seed(db)
    updated = client.put('/api/assumptions/impact/A-001', json={'assumed_impact_inr': 50_000_000})
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body['basis'] == 'edited'
    assert body['assumed_impact_inr'] == 50_000_000
    assert body['default_impact_inr'] == 9_600_000  # documented default stays visible

    target = next(
        r for r in client.get('/api/risk/rankings').json()
        if r['asset_id'] == 'A-001' and r['cve_id'] == 'CVE-2099-0001'
    )
    assert math.isclose(target['financial_impact'], 1.0, abs_tol=1e-9)  # 50M > 1 crore reference, capped
    assert math.isclose(target['priority'], 0.3 + 0.164 + 0.2 + 0.144 + 0.15, abs_tol=1e-9)


def test_negative_or_missing_assets_are_rejected(db, client):
    _seed(db)
    response = client.put('/api/assumptions/impact/A-001', json={'assumed_impact_inr': -10})
    assert response.status_code == 422
    response = client.put('/api/assumptions/impact/A-999', json={'assumed_impact_inr': 10_000})
    assert response.status_code == 404
    response = client.get('/api/assumptions/impact/A-999')
    assert response.status_code == 404


def test_summary_reflects_edited_assumption(db, client):
    _seed(db)
    before = client.get('/api/risk/summary').json()['assumed_exposure_inr']
    client.put('/api/assumptions/impact/A-001', json={'assumed_impact_inr': 50_000_000})
    after = client.get('/api/risk/summary').json()['assumed_exposure_inr']
    assert after == before - 9_600_000 + 50_000_000
