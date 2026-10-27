"""Simulation service: turns explicit requests or editable asset assumptions
into Monte Carlo loss results with every assumption labeled in the response.

The demo datasets carry no loss floors or event counts, so defaults are
exposed as EDITABLE assumptions (never silently invented): severity mode
comes from the asset's impact assumption; frequency and compromise
probability default to documented constants overridable per asset.
"""

from typing import Optional

from sqlalchemy.orm import Session

from app import models
from app.services import monte_carlo, risk_service

# Documented, labeled severity-spread assumptions around the editable mode.
SEVERITY_LOW_FACTOR = 0.6    # best-case single-event loss
SEVERITY_HIGH_FACTOR = 1.8   # severe-case single-event loss
# Documented, labeled defaults when a user has not overridden the asset values.
DEFAULT_FREQUENCY_PER_YEAR = 2.0
DEFAULT_COMPROMISE_PROBABILITY = 0.5

EDITABLE_VIA = 'PUT /assumptions/impact/{asset_id}'


def run_from_request(request: dict) -> dict:
    """Run a simulation with fully explicit inputs from the request body."""
    if request.get('severity_likely_inr') is not None:
        low = int(request['severity_low_inr'])
        likely = int(request['severity_likely_inr'])
        high = int(request['severity_high_inr'])
        severity_basis = 'explicit severity range from request'
    else:
        components = [
            int(request.get('downtime_inr', 0)),
            int(request.get('recovery_inr', 0)),
            int(request.get('regulatory_inr', 0)),
            int(request.get('reputation_inr', 0)),
        ]
        likely = sum(components)
        low = int(round(likely * _scaled(likely, SEVERITY_LOW_FACTOR)))
        high = int(round(likely * _scaled(likely, SEVERITY_HIGH_FACTOR)))
        severity_basis = 'sum of downtime + recovery + regulatory + reputation (leading a PERT spread)'

    result = monte_carlo.simulate_loss_distribution(
        frequency_per_year=request['frequency_per_year'],
        compromise_probability=request['compromise_probability'],
        severity_low_inr=low,
        severity_likely_inr=likely,
        severity_high_inr=high,
        seed=int(request.get('seed', monte_carlo.DEFAULT_SEED)),
        iterations=int(request.get('iterations', monte_carlo.DEFAULT_ITERATIONS)),
    )
    result['source'] = 'explicit_request'
    result['asset_id'] = None
    result['assumptions'] = {
        'frequency_per_year': {'value': request['frequency_per_year'], 'label': 'input from request'},
        'compromise_probability': {'value': request['compromise_probability'], 'label': 'input from request'},
        'severity_likely_inr': {'value': likely, 'label': severity_basis},
        'severity_low_inr': {'value': low, 'label': 'documented spread factor x likely'},
        'severity_high_inr': {'value': high, 'label': 'documented spread factor x likely'},
        'iterations': {'value': result['iterations'], 'label': 'fixed seed -> reproducible runs'},
        'seed': {'value': result['seed'], 'label': 'reproduce exactly with the same seed'},
        'rounding': {'value': result['rounding_inr'], 'label': 'all money rounded to nearest 1,000 INR'},
    }
    return result


def _scaled(value: int, factor: float) -> float:
    """Return the spread factor unless the likely severity is zero (flat range)."""
    return 0.0 if value == 0 else factor


def run_for_asset(db: Session, asset: models.Asset, seed: Optional[int] = None,
                  iterations: Optional[int] = None) -> dict:
    """Run a yearly loss simulation for one asset from its editable assumptions."""
    assumption = risk_service.get_or_create_assumption(db, asset)
    criticality = risk_service.asset_criticality(asset)
    mode = int(assumption.assumed_impact_inr)
    low = int(round(mode * (0.0 if mode == 0 else SEVERITY_LOW_FACTOR)))
    high = int(round(mode * (0.0 if mode == 0 else SEVERITY_HIGH_FACTOR)))
    frequency = float(assumption.frequency_per_year)
    probability = float(assumption.compromise_probability)
    result = monte_carlo.simulate_loss_distribution(
        frequency_per_year=frequency,
        compromise_probability=probability,
        severity_low_inr=low,
        severity_likely_inr=mode,
        severity_high_inr=high,
        seed=monte_carlo.DEFAULT_SEED if seed is None else int(seed),
        iterations=monte_carlo.DEFAULT_ITERATIONS if iterations is None else int(iterations),
    )
    result['source'] = 'asset_assumptions'
    result['asset_id'] = asset.asset_id
    result['assumptions'] = {
        'frequency_per_year': {'value': frequency, 'label': f'editable assumption ({EDITABLE_VIA})'},
        'compromise_probability': {'value': probability, 'label': f'editable assumption ({EDITABLE_VIA})'},
        'severity_likely_inr': {'value': mode, 'label': f'editable assumed impact, default derived from criticality {round(criticality, 4)} x 1 crore ({EDITABLE_VIA})'},
        'severity_low_inr': {'value': low, 'label': 'documented spread factor 0.6 x likely'},
        'severity_high_inr': {'value': high, 'label': 'documented spread factor 1.8 x likely'},
        'iterations': {'value': result['iterations'], 'label': 'fixed seed -> reproducible runs'},
        'seed': {'value': result['seed'], 'label': 'reproduce exactly with the same seed'},
        'rounding': {'value': result['rounding_inr'], 'label': 'all money rounded to nearest 1,000 INR'},
    }
    return result
