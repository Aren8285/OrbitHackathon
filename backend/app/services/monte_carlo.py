"""Vectorized modified-Beta PERT primitives; scenario_engine defines annual loss."""

from dataclasses import dataclass
from typing import Tuple

import numpy as np

INR_PER_LAKH = 100_000
INR_PER_CRORE = 10_000_000

DEFAULT_SEED: int = 20261027            # documented constant -> runs are reproducible
DEFAULT_ITERATIONS: int = 10_000        # coder.md build item 5
MAX_ITERATIONS: int = 50_000
MAX_EVENTS_PER_YEAR: float = 50.0
PERT_LAMBDA: float = 4.0                # standard PERT shape parameter
ROUNDING_INR: int = 1               # reported rounding for every money stat

DISTRIBUTION = 'pert'


def _validate_inputs(
    frequency_per_year: float,
    compromise_probability: float,
    severity_low_inr: int,
    severity_likely_inr: int,
    severity_high_inr: int,
    iterations: int,
) -> None:
    if frequency_per_year < 0 or frequency_per_year > MAX_EVENTS_PER_YEAR:
        raise ValueError(f'frequency_per_year must be between 0 and {MAX_EVENTS_PER_YEAR}')
    if not 0.0 <= compromise_probability <= 1.0:
        raise ValueError('compromise_probability must be between 0 and 1')
    if not 1000 <= iterations <= MAX_ITERATIONS:
        raise ValueError(f'iterations must be between 1000 and {MAX_ITERATIONS}')
    for money in (severity_low_inr, severity_likely_inr, severity_high_inr):
        if money < 0 or money > 1_000_000_000_000:
            raise ValueError('severity amounts must be non-negative INR below 1,000 crore')
    if not (severity_low_inr <= severity_likely_inr <= severity_high_inr):
        raise ValueError('severity requires low <= likely <= high')


def pert_beta_shape(low: float, mode: float, high: float) -> Tuple[float, float]:
    """PERT alpha/beta parameters on the beta(0,1) interval, lambda=4."""
    low_f, mode_f, high_f = float(low), float(mode), float(high)
    if high_f <= low_f:
        raise ValueError('PERT requires high > low (use a degenerate constant instead)')
    alpha = 1.0 + PERT_LAMBDA * (mode_f - low_f) / (high_f - low_f)
    beta = 1.0 + PERT_LAMBDA * (high_f - mode_f) / (high_f - low_f)
    return alpha, beta


def sample_pert(rng: np.random.Generator, low: float, mode: float, high: float, size: int) -> np.ndarray:
    """Draw `size` PERT samples in INR. Degenerate (low == high) -> constant mode."""
    if high <= low:
        return np.full(size, float(mode))
    alpha, beta = pert_beta_shape(low, mode, high)
    unit = rng.beta(alpha, beta, size=size)
    return low + (high - low) * unit


@dataclass(frozen=True)
class SimulationAssumptions:
    """Explicit, editable simulation inputs (INR where money)."""

    frequency_per_year: float
    compromise_probability: float
    severity_low_inr: int
    severity_likely_inr: int
    severity_high_inr: int
    seed: int = DEFAULT_SEED
    iterations: int = DEFAULT_ITERATIONS


def simulate_loss_distribution(
    frequency_per_year: float,
    compromise_probability: float,
    severity_low_inr: int,
    severity_likely_inr: int,
    severity_high_inr: int,
    seed: int = DEFAULT_SEED,
    iterations: int = DEFAULT_ITERATIONS,
) -> dict:
    """Simulate one year of loss many times and summarize the distribution."""
    _validate_inputs(
        frequency_per_year, compromise_probability,
        severity_low_inr, severity_likely_inr, severity_high_inr, iterations,
    )

    from app.services.scenario_engine import describe
    rng = np.random.default_rng(seed)
    severity = sample_pert(rng, severity_low_inr, severity_likely_inr, severity_high_inr, iterations)
    result = describe(frequency_per_year * compromise_probability * severity, seed, iterations)
    result['mean_event_severity_inr'] = int(round(float(severity.mean())))
    result['expected_compromised_events'] = frequency_per_year * compromise_probability
    return result


def p50_p95(simulation_result: dict) -> dict:
    """Coder.md rule 6: losses are shown as a range (P50 / P95), never one number."""
    return {
        'p50_inr': simulation_result['p50_inr'],
        'p95_inr': simulation_result['p95_inr'],
    }
