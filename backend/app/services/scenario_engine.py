"""One financial model for every caller: six independent PERT input triples.

Each draw is frequency * compromise probability * sum(four incident costs).
Controls reduce that loss multiplicatively; portfolio percentiles come from
summing aligned annual draws, never adding individual scenario percentiles.
"""
import zlib

import numpy as np
from sqlalchemy import select

from app import models
from app.services import monte_carlo as mc, scoring

INPUTS = ('frequency', 'compromise_probability', 'downtime_cost', 'recovery_cost',
          'regulatory_cost', 'reputation_cost')
IMPLEMENTED_STATUSES = {'implemented', 'partial', 'completed', 'verified'}


def sample_inputs(scenario, seed=mc.DEFAULT_SEED, iterations=mc.DEFAULT_ITERATIONS):
    if not 1000 <= iterations <= mc.MAX_ITERATIONS:
        raise ValueError('iterations must be between 1000 and 50000')
    rng = np.random.default_rng((seed + zlib.crc32(scenario.scenario_key.encode())) % 2**32)
    draws = {}
    for field in INPUTS:
        low, likely, high = [getattr(scenario, f'{field}_{level}') for level in ('low', 'likely', 'high')]
        if not all(np.isfinite([low, likely, high])) or not 0 <= low <= likely <= high:
            raise ValueError(f'Invalid {field} range')
        if field == 'compromise_probability' and high > 1:
            raise ValueError('Compromise probability must be 0-1')
        draws[field] = mc.sample_pert(rng, low, likely, high, iterations)
    return draws


def annual_samples(scenario, seed=mc.DEFAULT_SEED, iterations=mc.DEFAULT_ITERATIONS):
    draws = sample_inputs(scenario, seed, iterations)
    costs = sum(draws[field] for field in INPUTS[2:])
    return draws['frequency'] * draws['compromise_probability'] * costs


def effective_control(control, prospective=False):
    # Prospective picks explicitly model a funded full-coverage rollout, not
    # achieved risk. Existing partial deployments count only their coverage.
    if prospective:
        return float(control.eff_likely)
    if control.implementation_status.lower() not in IMPLEMENTED_STATUSES:
        return 0.0
    return float(control.eff_likely) * float(control.coverage)


def combined_for(scenario, controls, proposed=frozenset(), excluded=frozenset()):
    return scoring.combined_controls(
        effective_control(control, control.control_key in proposed)
        for control in controls
        if control.control_key in scenario.applicable_control_keys and control.control_key not in excluded
    )


def describe(losses, seed=mc.DEFAULT_SEED, iterations=None):
    iterations = iterations or len(losses)
    values = np.asarray(losses, dtype=float)
    if not len(values):
        values = np.zeros(iterations)
    percentiles = np.percentile(values, [10, 25, 50, 75, 90, 95, 99])
    # Integer bin boundaries are strictly ordered, including constant/zero loss.
    low = int(np.floor(values.min()))
    width = max(1, int(np.ceil((float(values.max()) - low) / 40)))
    edges = low + np.arange(41, dtype=np.int64) * width
    counts, _ = np.histogram(values, bins=edges)
    result = dict(distribution='pert', pert_lambda=4, seed=seed, iterations=iterations,
                  expected_annual_loss_inr=int(round(float(values.mean()))),
                  mean=int(round(float(values.mean()))),
                  histogram=[dict(low_inr=int(edges[i]), high_inr=int(edges[i+1]), count=int(counts[i])) for i in range(40)],
                  max_annual_loss_inr=int(round(float(values.max()))),
                  zero_loss_share=float((values == 0).mean()), rounding_inr=1,
                  reproducible=True, source='risk_scenarios', asset_id=None,
                  assumptions={'formula': 'frequency * compromise_probability * (downtime + recovery + regulatory + reputation)',
                               'inputs': 'independent PERT triples, lambda 4; integer INR outputs'})
    result.update({f'p{p}_inr': int(round(float(value))) for p, value in zip([10,25,50,75,90,95,99], percentiles)})
    return result


def context(db, asset_id=None, seed=mc.DEFAULT_SEED, iterations=mc.DEFAULT_ITERATIONS):
    query = select(models.RiskScenario).order_by(models.RiskScenario.scenario_key)
    if asset_id:
        query = query.where(models.RiskScenario.asset_id == asset_id)
    scenarios = db.scalars(query).all()
    controls = db.scalars(select(models.Control).order_by(models.Control.control_key)).all()
    raw = {scenario.id: annual_samples(scenario, seed, iterations) for scenario in scenarios}
    return scenarios, controls, raw


def evaluate(scenarios, controls, raw, proposed=frozenset(), excluded=frozenset(),
             seed=mc.DEFAULT_SEED, iterations=mc.DEFAULT_ITERATIONS):
    total = np.zeros(iterations)
    rows = []
    for scenario in scenarios:
        combined = combined_for(scenario, controls, proposed, excluded)
        residual = raw[scenario.id] * (1 - combined)
        total += residual
        row = describe(residual, seed, iterations)
        row.update(scenario_id=scenario.id, scenario_key=scenario.scenario_key,
                   asset_id=scenario.asset_id, name=scenario.name,
                   combined_effectiveness=combined,
                   inherent_loss_inr=int(round(float(raw[scenario.id].mean()))))
        rows.append(row)
    result = describe(total, seed, iterations)
    result['scenarios'] = rows
    return result


def portfolio(db, asset_id=None, seed=mc.DEFAULT_SEED, iterations=mc.DEFAULT_ITERATIONS, excluded=frozenset()):
    scenarios, controls, raw = context(db, asset_id, seed, iterations)
    result = evaluate(scenarios, controls, raw, excluded=excluded, seed=seed, iterations=iterations)
    result['asset_id'] = asset_id
    return result


def persist(db, result):
    for row in result['scenarios']:
        db.add(models.SimulationResult(
            scenario_id=row['scenario_id'], seed=row['seed'], iterations=row['iterations'],
            expected_annual_loss_inr=row['expected_annual_loss_inr'], p50_inr=row['p50_inr'],
            p90_inr=row['p90_inr'], p95_inr=row['p95_inr'], p99_inr=row['p99_inr'],
            histogram=row['histogram'],
        ))
    db.flush()


def marginal_reduction(db, control, asset_id=None):
    scenarios, controls, raw = context(db, asset_id)
    before = sum(float(raw[row.id].mean()) * (1-combined_for(row, controls)) for row in scenarios)
    after = sum(float(raw[row.id].mean()) * (1-combined_for(row, controls, {control.control_key})) for row in scenarios)
    return max(0, int(round(before))-int(round(after)))
