"""Simulation adapters; financial results always use scenario_engine."""
from types import SimpleNamespace
from app.services import scenario_engine as engine, monte_carlo as mc

# Kept only for legacy editable-impact metadata, never used as financial inputs.
DEFAULT_FREQUENCY_PER_YEAR = 2.0
DEFAULT_COMPROMISE_PROBABILITY = 0.5


def run_from_request(request):
    # Explicit playground values are constant triples, with no invented spread.
    ranges = {field: (request.get(field + '_inr', 0),) * 3
              for field in ('downtime', 'recovery', 'regulatory', 'reputation')}
    if request.get('severity_likely_inr') is not None:
        ranges['downtime'] = tuple(request['severity_' + level + '_inr'] for level in ('low', 'likely', 'high'))
        ranges.update({field: (0, 0, 0) for field in ('recovery', 'regulatory', 'reputation')})
    values = dict(scenario_key='explicit_request')
    for field, triple in [('frequency', (request['frequency_per_year'],)*3),
                          ('compromise_probability', (request['compromise_probability'],)*3),
                          *[(field + '_cost', triple) for field, triple in ranges.items()]]:
        values.update({field+'_'+level: value for level, value in zip(('low','likely','high'), triple)})
    seed, iterations = request.get('seed', mc.DEFAULT_SEED), request.get('iterations', mc.DEFAULT_ITERATIONS)
    samples = engine.annual_samples(SimpleNamespace(**values), seed, iterations)
    result = engine.describe(samples, seed, iterations)
    result['source'] = 'explicit_request'
    return result


def run_for_asset(db, asset, seed=None, iterations=None):
    return engine.portfolio(db, asset.asset_id, seed if seed is not None else mc.DEFAULT_SEED,
                            iterations if iterations is not None else mc.DEFAULT_ITERATIONS)
