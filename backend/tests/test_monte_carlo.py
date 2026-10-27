"""Tests for the NumPy Monte Carlo annual-loss engine."""

import math

import numpy as np

from app.services import monte_carlo as mc

L = 200_000  # degenerate severity to make expectations analytic


def _run(freq, p, low, likely, high, seed=mc.DEFAULT_SEED, iterations=mc.DEFAULT_ITERATIONS):
    return mc.simulate_loss_distribution(freq, p, low, likely, high, seed=seed, iterations=iterations)


def test_default_configuration_is_ten_thousand_runs():
    assert mc.DEFAULT_ITERATIONS == 10_000
    result = _run(2.0, 0.5, 100_000, 200_000, 400_000)
    assert result['iterations'] == 10_000
    assert result['distribution'] == 'pert'


def test_same_seed_is_reproducible():
    first = _run(2.0, 0.5, 100_000, 200_000, 400_000)
    second = _run(2.0, 0.5, 100_000, 200_000, 400_000)
    assert first == second  # full result equality, byte-identical runs


def test_different_seed_gives_different_but_similar_results():
    a = _run(2.0, 0.5, 100_000, 200_000, 400_000, seed=1)
    b = _run(2.0, 0.5, 100_000, 200_000, 400_000, seed=2)
    assert a != b
    expected_diff = abs(a['expected_annual_loss_inr'] - b['expected_annual_loss_inr'])
    expected_mean = (a['expected_annual_loss_inr'] + b['expected_annual_loss_inr']) / 2
    assert expected_diff / expected_mean < 0.05  # statistically similar, not identical


def test_expected_loss_matches_formula_for_degenerate_severity():
    """Constant severity: E[annual] ~= frequency x p x severity."""
    freq, p = 50.0, 0.4
    result = _run(freq, p, L, L, L)
    expected = freq * p * L
    assert math.isclose(result['expected_annual_loss_inr'], expected, rel_tol=0.01)


def test_pert_sampler_matches_distribution_shape():
    rng = np.random.default_rng(42)
    sample = mc.sample_pert(rng, 100, 200, 500, 200_000)
    assert sample.mean() < 350  # PERT mean sits precisely on (low+4mode+high)/6 = 283.3
    assert sample.min() >= 100
    assert sample.max() <= 500
    alpha, beta = mc.pert_beta_shape(100, 200, 500)
    # mean of the beta sampler = (low + 4*mode + high)/6
    theoretical_mean = (100 + 4 * 200 + 500) / 6 - 100
    assert math.isclose(sample.mean() - 100, theoretical_mean, rel_tol=0.05)


def test_percentile_ordering_and_range_output():
    result = _run(2.0, 0.7, 100_000, 200_000, 500_000)
    assert 0 <= result['p50_inr'] <= result['p95_inr'] <= result['p99_inr'] <= result['max_annual_loss_inr']
    assert result['p10_inr'] <= result['p25_inr'] <= result['p50_inr'] <= result['p75_inr']
    assert result['p95_inr'] >= result['p50_inr']  # always shown as a range


def test_zero_frequency_yields_zero_loss():
    result = _run(0.0, 0.9, 100_000, 200_000, 400_000)
    assert result['expected_annual_loss_inr'] == 0
    assert result['p50_inr'] == 0 and result['p95_inr'] == 0
    assert result['zero_loss_share'] == 1.0


def test_zero_compromise_probability_yields_zero_loss():
    result = _run(5.0, 0.0, 100_000, 200_000, 400_000)
    assert result['expected_annual_loss_inr'] == 0
    assert result['p99_inr'] == 0


def test_money_is_rounded_and_reported():
    result = _run(3.0, 0.5, 111_111, 222_222, 999_999)
    for key, value in result.items():
        if key.endswith('_inr'):
            assert type(value) is int, f'{key} must be rounded to nearest 1,000 INR'
    assert result['rounding_inr'] == 1


def test_invalid_inputs_are_rejected():
    base = dict(
        frequency_per_year=2.0,
        compromise_probability=0.5,
        severity_low_inr=100_000,
        severity_likely_inr=200_000,
        severity_high_inr=400_000,
    )
    bad_overrides = [
        dict(frequency_per_year=-1),
        dict(frequency_per_year=999),
        dict(compromise_probability=1.5),
        dict(compromise_probability=-0.1),
        dict(iterations=500),
        dict(iterations=100_000),
    ]
    for bad in bad_overrides:
        kwargs = {**base, **bad}
        try:
            mc.simulate_loss_distribution(**kwargs)
        except ValueError:
            continue
        raise AssertionError(f'expected ValueError for {bad}')


def test_degenerate_severity_ordering_rejected():
    try:
        _run(2.0, 0.5, 400_000, 200_000, 100_000)
    except ValueError:
        return
    raise AssertionError('inverted severity range must be rejected')


def test_p50_p95_range_helper():
    result = _run(4.0, 0.5, 0, 100_000, 300_000)
    as_range = mc.p50_p95(result)
    assert set(as_range) == {'p50_inr', 'p95_inr'}
    assert as_range['p50_inr'] <= as_range['p95_inr']
