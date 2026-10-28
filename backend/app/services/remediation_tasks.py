"""Task defaults and seeding. Reads construct transient rows without saving."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app import models
from app.services import risk_service
from app.services.csv_import import ImportReport

from app.config import PRIORITY_DUE_DAYS as DUE_DAYS
from app.services.scoring import classify_priority


def priority_band(row):
    return classify_priority(row['is_kev'], row['internet_facing'], row['criticality'], row['priority'])


def task_defaults(db, control, ranked=None, reduction=None, applicable_assets=None):
    from app.services.scenario_engine import marginal_reduction
    if applicable_assets is None:
        applicable_assets = {scenario.asset_id for scenario in db.scalars(
            select(models.RiskScenario)
        ).all() if control.control_key in scenario.applicable_control_keys}
    if ranked is None:
        ranked = risk_service.finding_rankings(db)
    relevant = [row for row in ranked if row['asset_id'] in applicable_assets]
    # A mapped asset without an open CVE still owns its control task. Do not
    # move its remediation to an unrelated high-priority payment finding.
    finding = next(iter(relevant if applicable_assets else ranked), None)
    assets_query = select(models.Asset)
    if applicable_assets:
        assets_query = assets_query.where(models.Asset.asset_id.in_(applicable_assets))
    asset = db.scalar(select(models.Asset).where(models.Asset.asset_id == finding['asset_id'])) if finding else db.scalar(
        assets_query.order_by(models.Asset.criticality.desc(), models.Asset.asset_id)
    )
    # Custom CSV catalogs may reuse a mapped key before demo assets are loaded.
    if asset is None and applicable_assets:
        asset = db.scalar(select(models.Asset).order_by(models.Asset.criticality.desc(), models.Asset.asset_id))
    if asset is None:
        return None
    vulnerability = db.scalar(select(models.Vulnerability).where(
        models.Vulnerability.asset_row_id == asset.id,
        models.Vulnerability.cve_id == finding['cve_id'],
    )) if finding else None
    priority = priority_band(finding) if finding else 'P3'
    today = datetime.now(timezone(timedelta(hours=5, minutes=30))).date()
    return models.RemediationTask(
        company_id=asset.company_id, control_key=control.control_key, status='open',
        asset_id=asset.asset_id, vulnerability_id=vulnerability.id if vulnerability else None,
        priority=priority, due_date=today + timedelta(days=DUE_DAYS[priority]),
        owner=asset.owner or 'Unassigned',
        estimated_risk_reduction=reduction if reduction is not None else marginal_reduction(db, control, asset.asset_id),
    )


def seed_tasks(db, commit=True):
    from app.services.scenario_engine import marginal_reduction_map
    controls = db.scalars(select(models.Control).order_by(models.Control.control_key)).all()
    report = ImportReport(dataset='remediations', rows_read=len(controls))
    ranked = risk_service.finding_rankings(db)
    existing = {task.control_key for task in db.scalars(select(models.RemediationTask)).all()}
    scenarios = db.scalars(select(models.RiskScenario)).all()  # one load for all controls
    applicable_by_control: dict = {}
    for scenario in scenarios:
        for key in scenario.applicable_control_keys:
            applicable_by_control.setdefault(key, set()).add(scenario.asset_id)
    targets = []
    for control in controls:
        if control.control_key in existing:
            # Preserve execution state, ownership, and the original due date.
            report.updated += 1
            continue
        task = task_defaults(db, control, ranked, reduction=0,
                             applicable_assets=applicable_by_control.get(control.control_key, frozenset()))
        if task is not None:
            targets.append((control, task))
            report.created += 1
    if targets:
        # One batched context pass replaces marginal_reduction per control.
        pairs = {(control.control_key, task.asset_id) for control, task in targets}
        reductions = marginal_reduction_map(db, pairs)
        for control, task in targets:
            task.estimated_risk_reduction = reductions[(control.control_key, task.asset_id)]
            db.add(task)
    db.commit() if commit else db.flush()
    return report


def ensure_finding_tasks(db):
    """Every open finding gets an action, with stable identity on recalculation."""
    from app.services.scenario_engine import marginal_reduction_map
    ranked = risk_service.finding_rankings(db)
    covered = {(task.asset_id, task.vulnerability_id) for task in db.scalars(select(models.RemediationTask)).all()}
    controls = db.scalars(select(models.Control).order_by(models.Control.control_key)).all()
    if not controls:
        return
    scenarios = db.scalars(select(models.RiskScenario)).all()
    assets = {asset.asset_id: asset for asset in db.scalars(select(models.Asset)).all()}
    findings = {(row.asset_row_id, row.cve_id): row for row in db.scalars(select(models.Vulnerability)).all()}
    today = datetime.now(timezone(timedelta(hours=5, minutes=30))).date()
    specs = []
    for row in ranked:
        asset = assets[row['asset_id']]
        finding = findings[(asset.id, row['cve_id'])]
        if (asset.asset_id, finding.id) in covered:
            continue
        applicable = {key for scenario in scenarios if scenario.asset_id == asset.asset_id for key in scenario.applicable_control_keys}
        control = next((control for control in controls if control.control_key in applicable),
                       next((control for control in controls if control.control_key == 'vuln_mgmt'), controls[0]))
        specs.append((control.control_key, asset, finding, row['priority_label'], row))
        covered.add((asset.asset_id, finding.id))
    if not specs:
        return
    # One batched reduction pass for every new pair, instead of per finding.
    pairs = {(control_key, asset.asset_id) for control_key, asset, _f, _p, _row in specs}
    reductions = marginal_reduction_map(db, pairs)
    for control_key, asset, finding, priority_label, row in specs:
        task = models.RemediationTask(control_key=control_key, asset_id=asset.asset_id,
                                     vulnerability_id=finding.id, priority=priority_label, status='open',
                                     owner=asset.owner or 'Unassigned',
                                     due_date=today+timedelta(days=DUE_DAYS[priority_label]),
                                     estimated_risk_reduction=0)
        if (control_key, asset.asset_id) in reductions:
            task.estimated_risk_reduction = reductions[(control_key, asset.asset_id)]
        db.add(task)
    db.flush()


def impact(db):
    from app.services import scenario_engine
    tasks = db.scalars(select(models.RemediationTask)).all()
    controls = {row.control_key: row for row in db.scalars(select(models.Control)).all()}
    verified = {task.control_key for task in tasks if task.status == 'verified'}
    before = scenario_engine.portfolio(db, excluded=verified)
    after = scenario_engine.portfolio(db)
    counts = {status: sum(task.status == status for task in tasks) for status in ('open', 'in_progress', 'completed', 'verified')}
    inherent = sum(row['inherent_loss_inr'] for row in after['scenarios'])
    credited = {key for key in verified if key in controls and scenario_engine.effective_control(controls[key]) > 0}
    fields = ('expected_annual_loss_inr', 'p50_inr', 'p95_inr')
    return dict(asset_id='portfolio', status_counts=counts, verified_controls=sorted(credited),
                combined_effectiveness=max(0,min(1,round(1-after['expected_annual_loss_inr']/inherent, 6))) if inherent else 0,
                excluded_completed_effectiveness=0,
                before={key: before[key] for key in fields}, after={key: after[key] for key in fields},
                expected_reduction_inr=max(0, before['expected_annual_loss_inr']-after['expected_annual_loss_inr']),
                assumptions={'verified_only': 'Verified tasks require implemented controls and recorded positive coverage',
                             'completed_excluded': 'Completed tasks give NO risk credit for unimplemented controls',
                             'baseline': 'Same risk_scenarios PERT draws as dashboard and optimizer; portfolio scope'})
