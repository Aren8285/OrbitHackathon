"""Greedy budget optimizer over the control catalog (coder.md build item 6).

Selection rule: at every step, recompute the marginal expected loss reduction
of each unselected control against the current combined effectiveness
(marginal = inherent_loss x (combined_after - combined_before)), rank by
benefit per rupee, and pick the best still-affordable candidate. Benefits are
therefore recalculated after every selection, not cached. The algorithm stops
when nothing affordable yields positive marginal benefit or the budget is
exhausted, and it can never select a set whose total cost exceeds the budget.

Effectiveness basis: the catalog's eff_likely (documented PERT mode per
control), labeled as an assumption in every response.
"""

from dataclasses import dataclass
from typing import Iterable, List, Optional, Tuple

from app.services import scoring

INR_PER_LAKH = 100_000
INR_PER_CRORE = 10_000_000


@dataclass(frozen=True)
class ControlCandidate:
    control_key: str
    control_name: str
    annual_cost_inr: float
    effectiveness: float  # 0-1, catalog eff_likely


def _ratio(benefit: float, cost: float) -> float:
    if cost <= 0:
        return float('inf') if benefit > 0 else 0.0
    return benefit / cost


def optimize_portfolio(
    candidates: Iterable[ControlCandidate],
    inherent_loss_inr: float,
    budget_inr: float,
) -> dict:
    """Select controls maximizing expected residual-loss reduction within budget."""
    pool: List[ControlCandidate] = [
        c for c in candidates
        if c.effectiveness > 0.0 and c.annual_cost_inr >= 0.0
    ]
    if inherent_loss_inr < 0:
        raise ValueError('inherent_loss_inr cannot be negative')
    if budget_inr < 0:
        raise ValueError('budget_inr cannot be negative')

    combined = 0.0
    spent = 0.0
    selected: List[dict] = []

    while True:
        if spent >= budget_inr:
            break
        best: Optional[Tuple[float, float, ControlCandidate, float]] = None
        selected_keys = {s['control_key'] for s in selected}
        for candidate in pool:
            if candidate.control_key in selected_keys:
                continue
            remaining = budget_inr - spent
            if candidate.annual_cost_inr > remaining:
                continue  # a selection must never push spend past the budget
            combined_after = 1.0 - (1.0 - combined) * (1.0 - candidate.effectiveness)
            if combined_after <= combined:
                continue  # no positive marginal benefit
            benefit = inherent_loss_inr * (combined_after - combined)
            ratio = _ratio(benefit, candidate.annual_cost_inr)
            if ratio <= 0:
                continue
            key = (-ratio, candidate.annual_cost_inr, candidate.control_key)
            if best is None or key < best[0]:
                best = (key, ratio, candidate, combined_after)
        if best is None:
            break
        _key, ratio, candidate, combined_after = best
        benefit = inherent_loss_inr * (combined_after - combined)
        spent += candidate.annual_cost_inr
        combined = combined_after
        selected.append(
            {
                'control_key': candidate.control_key,
                'control_name': candidate.control_name,
                'annual_cost_inr': _money(candidate.annual_cost_inr),
                'effectiveness': round(candidate.effectiveness, 4),
                'marginal_benefit_inr': _money(benefit),
                'benefit_per_rupee': round(ratio, 4),
                'combined_after': round(combined, 4),
                'cumulative_cost_inr': _money(spent),
                'residual_after_inr': _money(scoring.residual_risk(inherent_loss_inr, combined)),
            }
        )

    residual_before = scoring.residual_risk(inherent_loss_inr, 0.0)
    residual_after = scoring.residual_risk(inherent_loss_inr, combined)
    return {
        'budget_inr': _money(budget_inr),
        'spent_inr': _money(spent),
        'remaining_budget_inr': _money(max(0.0, budget_inr - spent)),
        'inherent_loss_inr': _money(inherent_loss_inr),
        'combined_before': 0.0,
        'combined_after': round(combined, 4),
        'residual_before_inr': _money(residual_before),
        'residual_after_inr': _money(residual_after),
        'total_expected_reduction_inr': _money(residual_before - residual_after),
        'recommended_controls': selected,
        'never_exceeded_budget': spent <= budget_inr + 1e-9,
        'assumptions': {
            'effectiveness_basis': 'control catalog eff_likely (PERT mode, documented)',
            'benefit_model': (
                'marginal residual reduction vs. combined effectiveness, '
                'benefits recalculated after each selection'
            ),
            'money_rounding_inr': 1_000,
        },
    }


def _money(value: float) -> int:
    return int(round(float(value) / 1_000) * 1_000)
