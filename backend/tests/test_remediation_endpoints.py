"""Integration tests for the remediation plan endpoints.

Regression coverage for the /remediation/plan 500: the router previously
referenced model columns that do not exist (control.control_id, finding.priority,
finding.category, control.cost_inr, asset.category).
"""

from app.scripts.seed import seed_database

from tests.conftest import db as _db_fixture  # noqa: F401  (fixtures are injected by pytest)


def test_plan_returns_200_with_items(db, client):
    seed_database(db)
    response = client.get('/remediation/plan')
    assert response.status_code == 200
    body = response.json()
    assert len(body['plan']) > 0
    assert body['total_cost'] > 0


def test_plan_items_have_complete_finding_and_control_payloads(db, client):
    seed_database(db)
    body = client.get('/remediation/plan').json()
    for item in body['plan']:
        finding = item['finding']
        assert finding['finding_id'] > 0
        assert finding['cve_id'].startswith('CVE-')
        assert finding['asset_asset_id'].startswith('A-')
        assert 0.0 <= finding['priority'] <= 1.0

        control = item['control']
        assert control['control_id']
        assert control['control_name']
        assert control['category']
        assert control['cost_inr'] >= 0
        assert 0.0 <= control['effectiveness'] <= 1.0


def test_plan_is_ordered_by_descending_priority(db, client):
    seed_database(db)
    priorities = [i['finding']['priority'] for i in client.get('/remediation/plan').json()['plan']]
    assert priorities == sorted(priorities, reverse=True)


def test_plan_controls_are_unique(db, client):
    """The UI keys rows by control_id, so each control appears at most once."""
    seed_database(db)
    body = client.get('/remediation/plan').json()
    control_ids = [i['control']['control_id'] for i in body['plan']]
    assert len(control_ids) == len(set(control_ids))


def test_costs_endpoint_returns_control_catalog(db, client):
    seed_database(db)
    response = client.get('/remediation/costs')
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) > 0
    for row in rows:
        assert row['control_id']
        assert row['cost_inr'] >= 0
