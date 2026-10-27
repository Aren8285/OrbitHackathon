from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, StatementError

from app import models
from app.database import CompanySession
from app.scripts.seed import seed_database
from app.services.demo_scenarios import DEMO_SCENARIOS, SCENARIO_CONTROLS
from app.services.remediation_tasks import DUE_DAYS, priority_band
from tests.conftest import csv_upload


def all_counts(db):
    return {model.__tablename__: db.scalar(select(func.count()).select_from(model))
            for mapper in models.Base.registry.mappers for model in [mapper.class_]}


def test_seed_endpoint_twice_rebuilds_all_data_with_stable_row_counts(client, db):
    first = client.post('/api/demo/seed')
    assert first.status_code == 200, first.text
    counts = all_counts(db)
    ids = dict(db.execute(select(models.RiskScenario.scenario_key, models.RiskScenario.id)).all())
    task = db.scalar(select(models.RemediationTask).where(models.RemediationTask.control_key == 'edr'))
    original_due = task.due_date
    client.put('/api/remediations/edr', json={'status': 'in_progress', 'owner': 'Security Lead'})
    second = client.post('/api/demo/seed')
    assert second.status_code == 200, second.text
    assert all_counts(db) == counts
    assert counts['risk_scenarios'] == 6
    assert counts['remediation_tasks'] == 175
    assert counts['simulation_results'] == 6
    assert dict(db.execute(select(models.RiskScenario.scenario_key, models.RiskScenario.id)).all()) == ids
    db.expire_all()
    task = db.scalar(select(models.RemediationTask).where(models.RemediationTask.control_key == 'edr'))
    assert task.status == 'open'
    assert task.owner != 'Security Lead'
    assert task.due_date == original_due


def test_all_six_scenarios_have_ordered_ranges_and_exact_control_mapping(client, db):
    seed_database(db)
    response = client.get('/api/risk/scenarios')
    assert response.status_code == 200
    rows = response.json()
    assert {row['scenario_key'] for row in rows} == {
        'ransomware', 'pii_breach', 'phishing', 'web_compromise', 'cloud_exposure', 'ddos',
    }
    controls = set(db.scalars(select(models.Control.control_key)).all())
    for row in rows:
        assert row['company_id'] == 1
        assert row['applicable_control_keys'] == SCENARIO_CONTROLS[row['scenario_key']]
        assert set(row['applicable_control_keys']) <= controls
        assert 'Fictional' in row['assumptions_note']
        for field in ('frequency', 'compromise_probability', 'downtime_cost', 'recovery_cost', 'regulatory_cost', 'reputation_cost'):
            low, likely, high = [row[f'{field}_{level}'] for level in ('low', 'likely', 'high')]
            assert 0 <= low <= likely <= high
            if field.endswith('_cost'):
                assert all(type(value) is int for value in (low, likely, high))
        assert row['compromise_probability_high'] <= 1
    assert client.get('/api/risk/scenarios?company_id=2').json() == []


def test_scenario_database_constraints_reject_invalid_ranges(db):
    seed_database(db)
    row = db.scalar(select(models.RiskScenario))
    row.compromise_probability_high = 1.1
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    row.downtime_cost_low = row.downtime_cost_high + 1
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def simulation_values(scenario_id):
    return dict(scenario_id=scenario_id, expected_annual_loss_inr=1_000_000,
                p50_inr=800_000, p90_inr=2_000_000, p95_inr=3_000_000,
                p99_inr=5_000_000, histogram=[{'low_inr': 0, 'high_inr': 100_000, 'count': 10000}])


def test_simulation_storage_is_integer_inr_and_company_isolated(db):
    seed_database(db)
    scenario = db.scalar(select(models.RiskScenario))
    result = models.SimulationResult(**simulation_values(scenario.id))
    db.add(result)
    db.commit()
    db.refresh(result)
    assert result.company_id == 1
    assert result.iterations == 10000
    assert type(result.expected_annual_loss_inr) is int
    assert result.p50_inr <= result.p90_inr <= result.p95_inr <= result.p99_inr
    with CompanySession(bind=db.get_bind(), info={'company_id': 2}) as other:
        other.add(models.Company(id=2, name='Other company'))
        other.commit()
        assert other.scalars(select(models.RiskScenario)).all() == []
        assert other.scalars(select(models.SimulationResult)).all() == []
        other.add(models.SimulationResult(**simulation_values(scenario.id)))
        with pytest.raises(IntegrityError):
            other.commit()
        other.rollback()


def test_fractional_money_is_rejected_by_api_csv_and_orm(client, db):
    assert client.post('/api/controls', json={
        'control_key': 'fractional', 'control_name': 'Fractional', 'annual_cost': 123.45,
    }).status_code == 422
    csv = ('control_key,control_name,category,coverage,implementation_status,eff_low,eff_likely,eff_high,annual_cost\n'
           'fractional,Fractional,data,0,none,0.1,0.2,0.3,123.45\n')
    assert client.post('/api/controls/import', files=csv_upload('controls.csv', csv)).status_code == 422
    control = models.Control(control_key='fractional', control_name='Fractional', annual_cost=123.45)
    db.add(control)
    with pytest.raises(StatementError):
        db.commit()
    db.rollback()


def test_seeded_tasks_have_metadata_and_payment_infrastructure_is_p0(client, db):
    seed_database(db)
    tasks = client.get('/api/remediations').json()
    today = datetime.now(timezone(timedelta(hours=5, minutes=30))).date()
    assert len(tasks) == 21
    for task in tasks:
        assert task['status'] == 'open'
        assert task['priority'] in DUE_DAYS
        assert task['asset_id'] and task['owner']
        assert type(task['estimated_risk_reduction']) is int
        assert date.fromisoformat(task['due_date']) == today + timedelta(days=DUE_DAYS[task['priority']])
        mapped_assets = {DEMO_SCENARIOS[key]['asset_id'] for key, controls in SCENARIO_CONTROLS.items()
                         if task['control_key'] in controls}
        if mapped_assets:
            assert task['asset_id'] in mapped_assets
    edr = next(task for task in tasks if task['control_key'] == 'edr')
    assert edr['asset_id'] == 'A-001'
    assert edr['priority'] == 'P0'
    assert edr['vulnerability_id'] is not None


@pytest.mark.parametrize('score,kev,internet,criticality,expected', [
    (0.1, True, True, 0.8, 'P0'), (0.65, False, True, 0.8, 'P1'),
    (0.40, False, False, 0.5, 'P2'), (0.399, False, False, 0.5, 'P3'),
])
def test_task_priority_thresholds(score, kev, internet, criticality, expected):
    assert priority_band(dict(priority=score, is_kev=kev, internet_facing=internet, criticality=criticality)) == expected


def test_all_four_task_statuses_and_verification_workflow(client, db):
    seed_database(db)
    for status in ('open', 'in_progress', 'completed', 'verified'):
        response = client.put('/api/remediations/edr', json={'status': status})
        assert response.status_code == 200, response.text
        assert response.json()['counts_toward_achieved_risk'] == (status == 'verified')
    assert client.put('/api/remediations/edr', json={'status': 'planned'}).status_code == 422
