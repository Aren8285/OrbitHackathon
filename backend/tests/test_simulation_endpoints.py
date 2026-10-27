"""Tests for /simulation and updated /optimizer endpoints against the seeded demo data."""

from app.scripts.seed import seed_database


def test_explicit_simulation_run_is_reproducible(client):
    payload = {
        'frequency_per_year': 2.0,
        'compromise_probability': 0.5,
        'downtime_inr': 3_000_000,
        'recovery_inr': 1_000_000,
        'regulatory_inr': 500_000,
        'reputation_inr': 500_000,
    }
    first = client.post('/simulation/run', json=payload).json()
    second = client.post('/simulation/run', json=payload).json()
    assert first == second  # fixed seed -> identical, reproducible numbers
    assert first['iterations'] == 10_000
    assert first['source'] == 'explicit_request'
    # severity mode here = sum of the four components = 5,000,000
    assert first['assumptions']['severity_likely_inr']['value'] == 5_000_000
    # P50 <= P95 and the distribution is labelled
    assert first['p50_inr'] <= first['p95_inr']
    assert first['distribution'] == 'pert'
    assert first['rounding_inr'] == 1_000


def test_explicit_severity_range_override(client):
    payload = {
        'frequency_per_year': 1.5,
        'compromise_probability': 0.6,
        'severity_low_inr': 1_000_000,
        'severity_likely_inr': 2_000_000,
        'severity_high_inr': 6_000_000,
    }
    response = client.post('/simulation/run', json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body['assumptions']['severity_likely_inr']['value'] == 2_000_000
    assert body['mean_event_severity_inr'] >= 1_000_000  # > low edge


def test_simulation_validation_errors(client):
    response = client.post('/simulation/run', json={'compromise_probability': 2.0})
    assert response.status_code == 422
    response = client.post('/simulation/run', json={'frequency_per_year': -1})
    assert response.status_code == 422
    response = client.post(
        '/simulation/run',
        json={'downtime_inr': 1_000_000, 'severity_low_inr': 100, 'severity_likely_inr': 200},  # missing high
    )
    assert response.status_code == 422
    response = client.post(
        '/simulation/run',
        json={'severity_low_inr': 3_000, 'severity_likely_inr': 2_000, 'severity_high_inr': 1_000},
    )
    assert response.status_code == 422
    response = client.post('/simulation/run', json={'iterations': 99})
    assert response.status_code == 422


def test_asset_simulation_uses_editable_assumptions(client, db):
    seed_database(db)
    body = client.get('/simulation/assets/A-001').json()
    assert body['source'] == 'asset_assumptions'
    assert body['asset_id'] == 'A-001'
    # A-001 criticality 0.96 -> assumed impact default 9.6M; P50 <= P95
    assert body['assumptions']['severity_likely_inr']['value'] == 9_600_000
    assert body['assumptions']['frequency_per_year']['label'].startswith('editable')
    assert body['p50_inr'] <= body['p95_inr']

    # editing the assumption flows straight into the simulation
    client.put('/assumptions/impact/A-001', json={'assumed_impact_inr': 20_000_000})
    after = client.get('/simulation/assets/A-001').json()
    assert after['assumptions']['severity_likely_inr']['value'] == 20_000_000
    assert after['p95_inr'] >= body['p95_inr']  # bigger severity -> heavier tail
    # frequency and compromise probability are themselves editable
    client.put('/assumptions/impact/A-001', json={'frequency_per_year': 5.0, 'compromise_probability': 0.9})
    edited = client.get('/simulation/assets/A-001').json()
    assert edited['assumptions']['frequency_per_year']['value'] == 5.0
    assert edited['p95_inr'] >= after['p95_inr']


def test_asset_simulation_unknown_asset(client, db):
    seed_database(db)
    assert client.get('/simulation/assets/A-999').status_code == 404
    seed_database(db)


def test_optimizer_endpoint_selects_within_budget(client, db):
    seed_database(db)
    response = client.get('/optimizer/recommendations?budget=2000000&asset_id=A-001')
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['never_exceeded_budget'] is True
    assert body['budget_inr'] == 2_000_000
    assert body['spent_inr'] <= body['budget_inr']
    assert body['inherent_loss_inr'] == 9_600_000  # A-001 default editable assumption
    assert body['residual_after_inr'] <= body['residual_before_inr']
    assert len(body['recommended_controls']) > 0
    # marginal benefits recalculated and shrinking as saturation grows
    ratios = [c['benefit_per_rupee'] for c in body['recommended_controls']]
    assert ratios[0] >= ratios[-1]
    cumulative = 0
    for control in body['recommended_controls']:
        cumulative += control['annual_cost_inr']
        assert control['cumulative_cost_inr'] == cumulative
    assert body['assumptions']['effectiveness_basis'].startswith('control catalog')


def test_optimizer_endpoint_defaults_and_errors(client, db):
    seed_database(db)
    default_response = client.get('/optimizer/recommendations')  # default budget + A-001
    assert default_response.status_code == 200
    assert default_response.json()['budget_inr'] == 500_000  # settings.default_budget
    assert client.get('/optimizer/recommendations?asset_id=A-999').status_code == 404
    assert client.get('/optimizer/recommendations?budget=-1').status_code == 422
