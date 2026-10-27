"""Greedy portfolio optimization using exactly the scenario simulation baseline."""
from app.services import scenario_engine as engine


def recommend(db, budget, must_include=(), exclude=(), asset_id=None):
    if budget < 0:
        raise ValueError('Budget must be non-negative integer INR')
    required, excluded = set(must_include), set(exclude)
    if required & excluded:
        raise ValueError('A control cannot be both required and excluded')
    scenarios, controls, raw = engine.context(db, asset_id)
    catalog = {control.control_key: control for control in controls}
    if (required | excluded) - catalog.keys():
        raise ValueError('Unknown control key in must_include or exclude')
    if sum(catalog[key].annual_cost for key in required) > budget:
        raise ValueError('Required controls exceed the budget')
    means = {key: float(samples.mean()) for key, samples in raw.items()}
    def loss(selected):
        return sum(means[scenario.id] * (1 - engine.combined_for(scenario, controls, selected)) for scenario in scenarios)
    inherent = sum(means.values())
    baseline = loss(set())
    current = baseline
    selected = set()
    recommendations = []
    spent = 0
    def pick(key):
        nonlocal current, spent
        control = catalog[key]
        after = loss(selected | {key})
        benefit = max(0.0, current - after)
        spent += control.annual_cost
        selected.add(key)
        recommendations.append(dict(
            control_key=key, control_name=control.control_name, annual_cost_inr=control.annual_cost,
            effectiveness=engine.effective_control(control, prospective=True),
            marginal_benefit_inr=int(round(current)) - int(round(after)),
            benefit_per_rupee=benefit / control.annual_cost if control.annual_cost else None,
            combined_after=1-after/inherent if inherent else 0,
            cumulative_cost_inr=spent, residual_after_inr=int(round(after)),
        ))
        current = after
    for key in sorted(required):
        pick(key)
    while True:
        options = []
        for key, control in catalog.items():
            if key in selected or key in excluded or spent + control.annual_cost > budget:
                continue
            benefit = current - loss(selected | {key})
            if benefit <= 1e-9:
                continue
            ratio = benefit / control.annual_cost if control.annual_cost else float('inf')
            options.append((-ratio, control.annual_cost, key))
        if not options:
            break
        pick(min(options)[2])
    before, after = int(round(baseline)), int(round(current))
    reduction = before - after
    return dict(
        budget_inr=budget, spent_inr=spent, total_cost=spent,
        remaining_budget_inr=budget-spent, inherent_loss_inr=int(round(inherent)),
        combined_before=1-baseline/inherent if inherent else 0,
        combined_after=1-current/inherent if inherent else 0,
        residual_before_inr=before, residual_after_inr=after,
        expected_loss_before=before, expected_loss_after=after,
        total_expected_reduction_inr=reduction,
        percent_reduction=100*reduction/before if before else 0,
        roi=(reduction-spent)/spent if spent else None,
        recommended_controls=recommendations, selected_controls=[row['control_key'] for row in recommendations],
        never_exceeded_budget=spent <= budget, asset_id=asset_id,
        assumptions={
            'baseline': 'current implemented controls at recorded coverage; same scenario draws as summary/simulation',
            'proposal': 'selected controls are proposed implemented rollouts at 100% coverage; not achieved risk',
            'effectiveness_basis': 'scenario-applicable eff_likely multiplied by deployed coverage',
            'zero_cost_roi': 'null when total cost is zero (division undefined)',
        },
    )
