"""Tests for the marginal-benefit greedy budget optimizer (never exceeds budget)."""

import math

from app.services import scoring  # combined/residual formulas exercised again below
from app.services.optimizer import ControlCandidate, optimize_portfolio

INHERENT = 10_000_000  # 1 crore


def _candidate(key, cost, effectiveness, name=None):
    return ControlCandidate(key, name or key.title(), cost, effectiveness)


def _keys(result):
    return [c['control_key'] for c in result['recommended_controls']]


def test_must_pass_combined_controls_check():
    # required by TASK 3 language: 30/20/25 -> 0.58
    assert math.isclose(scoring.combined_controls([0.30, 0.20, 0.25]), 0.58, abs_tol=1e-9)


def test_must_pass_residual_loss_check():
    # required by TASK 3 language: 2 crore inherent -> 84 lakh residual
    residual = scoring.residual_risk(2 * 10_000_000, 0.58)
    assert math.isclose(residual, 8_400_000, abs_tol=1e-3)


def test_selects_by_marginal_benefit_per_rupee():
    expensive = _candidate('big', 2_000_000, 0.60, 'Big Control')   # benefit 6M -> ratio 3.0
    cheap = _candidate('small', 1_000_000, 0.50, 'Small Control')   # benefit 5M -> ratio 5.0
    result = optimize_portfolio([expensive, cheap], INHERENT, 5_000_000)
    assert _keys(result) == ['small', 'big']
    # after picking 'small' (combined 0.5), big's marginal benefit is recalculated:
    # 1 - (1-0.5)(1-0.6) = 0.8 -> marginal = 3,000,000 (not the naive 6M)
    assert math.isclose(result['recommended_controls'][1]['marginal_benefit_inr'], 3_000_000, abs_tol=1_000)
    assert math.isclose(result['recommended_controls'][0]['marginal_benefit_inr'], 5_000_000, abs_tol=1_000)
    assert math.isclose(result['combined_after'], 0.8, abs_tol=1e-9)
    assert result['total_expected_reduction_inr'] > 0


def test_never_exceeds_budget():
    control_a = _candidate('a', 1_000_000, 0.50)
    control_b = _candidate('b', 2_000_000, 0.60)
    result = optimize_portfolio([control_a, control_b], INHERENT, 1_200_000)
    assert result['spent_inr'] == 1_000_000
    assert result['spent_inr'] <= result['budget_inr']
    assert result['never_exceeded_budget'] is True
    assert result['remaining_budget_inr'] == 200_000
    assert _keys(result) == ['a']  # b is unaffordable with what remains


def test_zero_or_negative_effectiveness_never_selected():
    dummy = _candidate('dummy', 500_000, 0.0)
    good = _candidate('good', 500_000, 0.5)
    result = optimize_portfolio([dummy, good], INHERENT, 2_000_000)
    assert _keys(result) == ['good']


def test_free_control_with_positive_benefit_wins_first():
    free = _candidate('free', 0, 0.4)
    paid = _candidate('paid', 1_000_000, 0.9)
    result = optimize_portfolio([free, paid], INHERENT, 1_000_000)
    assert _keys(result) == ['free', 'paid']
    sorted_ratio_desc = [
        c['benefit_per_rupee'] for c in result['recommended_controls']
    ]
    # per-rupee ratios decrease as combined effectiveness saturates
    assert sorted_ratio_desc[0] >= sorted_ratio_desc[-1]


def test_zero_budget_selects_nothing():
    good = _candidate('good', 1_000_000, 0.9)
    result = optimize_portfolio([good], INHERENT, 0)
    assert result['recommended_controls'] == []
    assert result['residual_after_inr'] == result['residual_before_inr']
    assert result['never_exceeded_budget'] is True


def test_no_candidates_or_zero_inherent_loss():
    result = optimize_portfolio([], INHERENT, 10_000_000)
    assert result['recommended_controls'] == []
    control = _candidate('c', 1_000_000, 0.5)
    result = optimize_portfolio([control], 0, 10_000_000)
    assert result['recommended_controls'] == []  # no benefit without inherent loss


def test_effectiveness_saturation_avoids_useless_picks():
    a = _candidate('a', 1_000_000, 1.0)  # alone reaches combined 1.0
    b = _candidate('b', 1_000_000, 0.8)  # adds nothing after a
    result = optimize_portfolio([b, a], INHERENT, 10_000_000)
    assert _keys(result) == ['a']
    assert math.isclose(result['residual_after_inr'], 0, abs_tol=1_000)


def test_negative_inputs_rejected():
    try:
        optimize_portfolio([], -5, 1_000)
    except ValueError:
        pass
    else:
        raise AssertionError('negative inherent loss must raise')
    try:
        optimize_portfolio([], 1_000, -1)
    except ValueError:
        pass
    else:
        raise AssertionError('negative budget must raise')
