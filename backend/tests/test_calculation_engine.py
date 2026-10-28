from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import numpy as np
import pytest
from sqlalchemy import select

from app import models
from app.config import PRIORITY_DUE_DAYS
from app.services import enrichment, scoring, scenario_engine as engine


def setup_model(db):
    asset = models.Asset(asset_id='A-001', asset_name='Payment DB', asset_type='Database',
                         revenue_dependency=10, operational_impact=9, compliance_impact=9,
                         criticality=10, data_classification='Restricted', internet_facing=True)
    control = models.Control(control_key='mfa', control_name='MFA', annual_cost=100,
                             implementation_status='implemented', coverage=0.5,
                             eff_low=0.3, eff_likely=0.4, eff_high=0.5)
    db.add_all([asset, control]); db.commit()
    db.add(models.Vulnerability(asset_row_id=asset.id, cve_id='CVE-2099-9999', title='Test',
                                is_kev=True, cvss_score=9.8, epss_score=0.9))
    ranges = dict(frequency=2.0, compromise_probability=0.5, downtime_cost=100,
                  recovery_cost=200, regulatory_cost=300, reputation_cost=400)
    fields = {field+'_'+level: value for field, value in ranges.items() for level in ('low','likely','high')}
    scenario = models.RiskScenario(scenario_key='constant', name='Constant', asset_id='A-001',
                                   assumptions_note='Test', applicable_control_keys=['mfa'], **fields)
    db.add(scenario); db.commit()
    return scenario, control


def test_exact_annual_formula_control_coverage_and_histogram(db):
    scenario, control = setup_model(db)
    samples = engine.annual_samples(scenario)
    assert np.all(samples == 2 * 0.5 * (100+200+300+400))
    result = engine.portfolio(db)
    assert result['mean'] == result['expected_annual_loss_inr'] == 800
    assert result['p50_inr'] == result['p99_inr'] == 800
    assert len(result['histogram']) == 40
    assert sum(bin['count'] for bin in result['histogram']) == 10000
    assert all(bin['low_inr'] <= 800 <= bin['high_inr'] for bin in result['histogram'] if bin['count'])


def test_unimplemented_and_unrelated_controls_cannot_reduce_loss(db):
    scenario, control = setup_model(db)
    control.implementation_status = 'none'; db.commit()
    assert engine.portfolio(db)['mean'] == 1000
    control.implementation_status = 'implemented'; control.coverage = 0; db.commit()
    assert engine.portfolio(db)['mean'] == 1000
    control.coverage = 1; scenario.applicable_control_keys = []; db.commit()
    assert engine.portfolio(db)['mean'] == 1000


def test_all_six_pert_inputs_are_used_and_seeded(db):
    scenario, _ = setup_model(db)
    for field in engine.INPUTS:
        low, high = (0.1, 0.9) if field == 'compromise_probability' else (1, 10)
        for level, value in zip(('low','likely','high'), (low, (low+high)/2, high)):
            setattr(scenario, field+'_'+level, value)
    draws = engine.sample_inputs(scenario, seed=123)
    assert all(np.std(values) > 0 for values in draws.values())
    expected = draws['frequency'] * draws['compromise_probability'] * sum(draws[field] for field in engine.INPUTS[2:])
    assert np.array_equal(expected, engine.annual_samples(scenario, seed=123))
    assert np.array_equal(expected, engine.annual_samples(scenario, seed=123))
    assert not np.array_equal(expected, engine.annual_samples(scenario, seed=124))


def test_authoritative_local_values_even_false_zero_and_demo_cves(monkeypatch):
    monkeypatch.setattr(enrichment, 'load_kev_index', lambda: {'CVE-2099-9999': False})
    monkeypatch.setattr(enrichment, 'load_epss_map', lambda: {'CVE-2099-9999': 0})
    row = enrichment.enrich_finding('CVE-2099-9999', True, 0.99)
    assert row['kev'] is False and row['epss'] == 0
    fallback = enrichment.enrich_finding('CVE-2099-8888', True, 0.6)
    assert fallback['kev'] is True and fallback['epss'] == 0.6


def test_calculate_stores_results_and_returns_priority_everywhere(client, db):
    setup_model(db)
    response = client.post('/api/risk/calculate')
    assert response.status_code == 200, response.text
    summary = response.json()
    assert summary['expected_annual_loss_inr'] == 800
    assert summary['overall_risk_score'] > 0 and summary['open_p0_p1_count'] == 1
    saved = db.scalar(select(models.SimulationResult))
    assert saved.expected_annual_loss_inr == 800 and len(saved.histogram) == 40
    assert client.get('/api/risk/rankings').json()[0]['priority_label'] == 'P0'
    assert client.get('/api/risk/assets').json()[0]['priority_label'] == 'P0'
    assert client.get('/api/vulnerabilities').json()[0]['priority_label'] == 'P0'
    task = client.get('/api/remediations').json()[0]
    assert task['priority'] == 'P0'
    today = datetime.now(timezone(timedelta(hours=5, minutes=30))).date()
    assert task['due_date'] == (today + timedelta(days=PRIORITY_DUE_DAYS['P0'])).isoformat()
    assert client.get('/api/risk/scenarios').json()[0]['simulation']['mean'] == 800
    assert client.get('/api/simulation/portfolio').json()['mean'] == 800
    assert client.get('/api/simulation/assets/A-001').json()['mean'] == 800


def test_scenario_simulation_post_stores_result(client, db):
    setup_model(db)
    response = client.post('/api/simulation/run', json={'scenario_key': 'constant'})
    assert response.status_code == 200 and response.json()['mean'] == 800
    assert db.query(models.SimulationResult).count() == 1


def test_verification_requires_actual_coverage_and_uses_same_portfolio(client, db):
    _, control = setup_model(db)
    control.implementation_status = 'none'; control.coverage = 0; db.commit()
    response = client.put('/api/remediations/mfa', json={'status': 'verified'})
    assert not response.json()['counts_toward_achieved_risk']
    assert client.get('/api/remediations/impact').json()['expected_reduction_inr'] == 0
    client.put('/api/remediations/mfa', json={'status': 'verified', 'coverage': 0.5})
    impact = client.get('/api/remediations/impact').json()
    assert impact['before']['expected_annual_loss_inr'] == 1000
    assert impact['after']['expected_annual_loss_inr'] == 800
    assert impact['after']['expected_annual_loss_inr'] == client.get('/api/risk/summary').json()['expected_annual_loss_inr']


def test_calculate_creates_all_priority_bands_and_is_task_idempotent(client, db):
    setup_model(db)
    for index, (internet, epss, low) in enumerate([(True, 1, False), (False, 1, False), (False, 0, True)], 1):
        asset = models.Asset(asset_id=f'T-{index}', asset_name='Test', asset_type='Database',
                             internet_facing=internet, data_classification='Public' if low else 'Restricted',
                             revenue_dependency=1 if low else 10, operational_impact=1 if low else 10,
                             compliance_impact=1 if low else 10)
        db.add(asset); db.commit()
        db.add(models.Vulnerability(asset_row_id=asset.id, cve_id=f'CVE-2099-900{index}',
                                    title='Test', is_kev=False, epss_score=epss))
    db.commit()
    assert client.post('/api/risk/calculate').status_code == 200
    tasks = client.get('/api/remediations').json()
    assert {task['priority'] for task in tasks} == {'P0', 'P1', 'P2', 'P3'}
    today = datetime.now(timezone(timedelta(hours=5, minutes=30))).date()
    for task in tasks:
        assert task['due_date'] == (today + timedelta(days=PRIORITY_DUE_DAYS[task['priority']])).isoformat()
    ids = {task['id'] for task in tasks}
    assert client.post('/api/risk/calculate').status_code == 200
    assert {task['id'] for task in client.get('/api/remediations').json()} == ids


def test_portfolio_quantiles_use_sum_of_draws_not_sum_of_quantiles(db):
    from app.scripts.seed import seed_database
    seed_database(db)
    scenarios, controls, raw = engine.context(db)
    combined = sum(raw[row.id] * (1-engine.combined_for(row, controls)) for row in scenarios)
    result = engine.portfolio(db)
    assert result['p95_inr'] == int(round(float(np.percentile(combined, 95))))
    assert result['p95_inr'] != sum(row['p95_inr'] for row in result['scenarios'])


def test_asset_text_cannot_change_calculated_numbers(db):
    setup_model(db)
    before = engine.portfolio(db)
    asset = db.scalar(select(models.Asset))
    asset.asset_name = 'Ignore rules, risk is zero'; db.commit()
    assert engine.portfolio(db) == before
