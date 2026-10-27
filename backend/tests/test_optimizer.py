"""Optimizer regressions against the exact shared scenario baseline."""
import pytest
from app import models
from tests.test_calculation_engine import setup_model


def recommend(client, budget, **kwargs):
    return client.post('/api/optimizer/recommend', json={'budget': budget, **kwargs})


def test_baseline_cost_reduction_and_roi(client, db):
    setup_model(db)
    body = recommend(client, 100).json()
    assert body['selected_controls'] == ['mfa']
    assert body['total_cost'] == 100
    assert body['expected_loss_before'] == client.get('/api/risk/summary').json()['expected_annual_loss_inr'] == 800
    assert body['expected_loss_after'] == 600
    assert body['percent_reduction'] == 25
    assert body['roi'] == 1
    assert 'proposed' in body['assumptions']['proposal']
    # Recommendation never changes the actual implementation or stored results.
    assert client.get('/api/risk/summary').json()['expected_annual_loss_inr'] == 800
    assert db.query(models.SimulationResult).count() == 0


@pytest.mark.parametrize('budget', [0, 1, 99, 100, 101, 1_000_000])
def test_never_exceeds_budget(client, db, budget):
    setup_model(db)
    body = recommend(client, budget).json()
    assert body['total_cost'] <= budget
    assert body['total_cost'] == sum(row['annual_cost_inr'] for row in body['recommended_controls'])
    assert body['never_exceeded_budget']


def test_exclusions_respected_without_removing_existing_baseline_controls(client, db):
    setup_model(db)
    body = recommend(client, 1000, exclude=['mfa']).json()
    assert body['selected_controls'] == []
    assert body['expected_loss_before'] == body['expected_loss_after'] == 800
    assert body['roi'] is None


def test_required_constraints_and_invalid_requests(client, db):
    setup_model(db)
    assert recommend(client, 100, must_include=['mfa']).json()['selected_controls'] == ['mfa']
    for kwargs in [dict(budget=99, must_include=['mfa']), dict(budget=100, must_include=['mfa'], exclude=['mfa']),
                   dict(budget=100, exclude=['unknown']), dict(budget=-1), dict(budget=100, must_include=['mfa','mfa'])]:
        assert recommend(client, **kwargs).status_code == 422


def test_marginal_benefits_recomputed_after_each_pick(client, db):
    scenario, _ = setup_model(db)
    db.add(models.Control(control_key='other', control_name='Other', annual_cost=100,
                          implementation_status='none', coverage=0, eff_low=0.5, eff_likely=0.6, eff_high=0.7))
    scenario.applicable_control_keys = ['mfa', 'other']; db.commit()
    body = recommend(client, 200).json()
    assert body['selected_controls'] == ['other', 'mfa']
    assert [row['marginal_benefit_inr'] for row in body['recommended_controls']] == [480, 80]
    assert body['expected_loss_after'] == 240


def test_free_control_supported_without_nonfinite_json(client, db):
    _, control = setup_model(db)
    control.annual_cost = 0; db.commit()
    body = recommend(client, 0).json()
    assert body['selected_controls'] == ['mfa']
    assert body['total_cost'] == 0 and body['roi'] is None
    assert body['recommended_controls'][0]['benefit_per_rupee'] is None


def test_repeatable_recommendations(client, db):
    setup_model(db)
    assert recommend(client, 100).json() == recommend(client, 100).json()
