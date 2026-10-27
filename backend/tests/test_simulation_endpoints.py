"""Simulation endpoint adapters use the shared annual-loss model."""
from app.scripts.seed import seed_database
from app import models


def test_explicit_component_formula_has_no_invented_spread(client):
    payload = dict(frequency_per_year=2, compromise_probability=0.5,
                   downtime_inr=3000000, recovery_inr=1000000, regulatory_inr=500000, reputation_inr=500000)
    response = client.post('/api/simulation/run', json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body['mean'] == body['p50_inr'] == body['p99_inr'] == 5000000
    assert len(body['histogram']) == 40 and body['rounding_inr'] == 1
    assert body == client.post('/api/simulation/run', json=payload).json()


def test_explicit_severity_and_invalid_inputs(client):
    payload = dict(frequency_per_year=1.5, compromise_probability=0.6,
                   severity_low_inr=1000000, severity_likely_inr=2000000, severity_high_inr=6000000)
    assert client.post('/api/simulation/run', json=payload).status_code == 200
    for bad in [{'compromise_probability': 2}, {'frequency_per_year': -1}, {'iterations': 99},
                {'severity_low_inr':100,'severity_likely_inr':200},
                {'severity_low_inr':3000,'severity_likely_inr':2000,'severity_high_inr':1000}]:
        assert client.post('/api/simulation/run', json=bad).status_code == 422


def test_asset_simulation_uses_scenario_ranges_not_old_impact_shortcut(client, db):
    seed_database(db)
    before = client.get('/api/simulation/assets/A-001').json()
    client.put('/api/assumptions/impact/A-001', json={'assumed_impact_inr':20000000})
    assert client.get('/api/simulation/assets/A-001').json() == before
    scenario = db.query(models.RiskScenario).filter_by(asset_id='A-001').one()
    scenario.downtime_cost_high *= 2; db.commit()
    after = client.get('/api/simulation/assets/A-001').json()
    assert after['mean'] > before['mean']
    assert client.get('/api/simulation/assets/A-999').status_code == 404


def test_six_scenarios_are_stored_on_calculate(client, db):
    seed_database(db)
    response = client.post('/api/risk/calculate')
    assert response.status_code == 200
    assert db.query(models.SimulationResult).count() == 6
    assert response.json()['scenario_count'] == 6
