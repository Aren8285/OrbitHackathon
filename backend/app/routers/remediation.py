import functools
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.services import risk_service

router = APIRouter()

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


# Category heuristic: the FinPay control catalog and vulnerability CSVs share
# no common key (controls have no cve_id column; vulnerabilities have no
# category column), so findings are matched to controls by keyword.
CATEGORY_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    # Order matters: the first category with a keyword hit wins.
    ('identity', ('privilege', 'credential', 'password', 'authentication', 'oauth', 'iam role', 'access key', 'mfa')),
    ('network', ('vpn', 'tls', 'unencrypted', 'firewall', 'segmentation', 'network', 'replication channel')),
    ('data', ('database', 'bucket', 'storage', 'backup', 'replication', 'data warehouse', 'leak')),
    ('endpoint', ('endpoint', 'disk', 'malware', 'antivirus', 'host')),
    ('monitoring', ('logging', 'monitoring', 'detection', 'siem', 'audit')),
    ('human', ('training', 'phishing', 'awareness', 'social engineering')),
    ('governance', ('header', 'policy', 'misconfiguration', 'publicly readable', 'sharing link')),
    ('cloud', ('cloud', 's3', 'internet-facing', 'public web')),
)


def _keyword_category(finding: models.Vulnerability) -> str | None:
    haystack = f'{finding.title} {finding.cve_id}'.lower()
    for category, keywords in CATEGORY_KEYWORDS:
        if any(keyword in haystack for keyword in keywords):
            return category
    return None


def _control_for_finding(db: Session, finding: models.Vulnerability) -> models.Control | None:
    """Match the best control to an open vulnerability finding: highest
    effectiveness within the best-matching available category."""
    category = _keyword_category(finding)
    if category is None:
        return None
    return db.scalar(
        select(models.Control)
        .where(models.Control.category == category)
        .order_by(models.Control.eff_likely.desc())
    )


# ---------------------------------------------------------------------------
# routes
# ---------------------------------------------------------------------------


@router.get('/plan', response_model=schemas.RemediationPlan)
def remediation_plan(db: Session = Depends(get_db)):
    """Return a prioritized remediation plan: one control per open finding
    where a suitable control exists, ordered by computed finding priority.

    Priority comes from risk_service (the same computed values as
    /risk/rankings); the Vulnerability model has no priority column.
    """
    ranked = [
        row for row in risk_service.finding_rankings(db, open_only=True)
    ]
    ranked.sort(key=lambda row: -row['priority'])

    plan: list[schemas.RemediationPlanItem] = []
    used_controls: set[str] = set()

    for row in ranked:
        vulnerability = db.scalar(
            select(models.Vulnerability)
            .join(models.Asset)
            .where(
                models.Asset.asset_id == row['asset_id'],
                models.Vulnerability.cve_id == row['cve_id'],
            )
        )
        if vulnerability is None:
            continue

        control = _control_for_finding(db, vulnerability)
        if control is None or control.control_key in used_controls:
            continue
        used_controls.add(control.control_key)

        plan.append(
            schemas.RemediationPlanItem(
                finding=schemas.FindingSummary(
                    finding_id=vulnerability.id,
                    cve_id=vulnerability.cve_id,
                    asset_asset_id=vulnerability.asset.asset_id,
                    asset_name=vulnerability.asset.asset_name,
                    asset_criticality=vulnerability.asset.criticality,
                    asset_category=str(getattr(vulnerability.asset, 'asset_type', '') or ''),
                    title=vulnerability.title,
                    cvss=vulnerability.cvss_score,
                    kev=vulnerability.is_kev,
                    epss=vulnerability.epss_score,
                    priority=row['priority'],
                ),
                control=schemas.ControlSummary(
                    control_id=control.control_key,
                    control_name=control.control_name,
                    category=control.category,
                    cost_inr=control.annual_cost,
                    effectiveness=control.eff_likely,
                ),
            )
        )

    total_cost = sum(item.control.cost_inr for item in plan)
    return schemas.RemediationPlan(plan=plan, total_cost=total_cost)


# ---------------------------------------------------------------------------
# persisted task status (TASK 5)
# ---------------------------------------------------------------------------


TASK_STATUS_LABELS = {
    'planned': 'planned change - not implemented, no risk credit',
    'completed': 'implemented - not yet verified, no risk credit',
    'verified': 'implemented AND verified in production - counts toward achieved risk',
}

# The scenario whose inherent loss the verified controls are measured against.
DEMO_SCENARIO_ASSET_ID = 'A-001'


def _control_or_404(db: Session, control_key: str) -> models.Control:
    control = db.scalar(select(models.Control).where(models.Control.control_key == control_key))
    if control is None:
        raise HTTPException(status_code=404, detail=f'Unknown control {control_key!r}')
    return control


def _task_out(db: Session, control: models.Control, task: models.RemediationTask | None) -> dict:
    status = task.status if task is not None else 'planned'
    return {
        'control_key': control.control_key,
        'control_name': control.control_name,
        'category': control.category,
        'status': status,
        'cost_inr': float(control.annual_cost),
        'effectiveness': float(control.eff_likely),
        'counts_toward_achieved_risk': status == 'verified',
        'updated_at': task.updated_at.isoformat() if task is not None and task.updated_at else None,
    }


@router.get('/tasks', response_model=list[schemas.RemediationTaskOut])
def list_remediation_tasks(db: Session = Depends(get_db)):
    """Execution status for every catalog control; a control with no persisted
    row is implicitly planned (no row is created until the first update)."""
    tasks = {t.control_key: t for t in db.scalars(select(models.RemediationTask)).all()}
    return [
        _task_out(db, control, tasks.get(control.control_key))
        for control in db.scalars(select(models.Control).order_by(models.Control.control_key)).all()
    ]


@router.put('/tasks/{control_key}', response_model=schemas.RemediationTaskOut)
def update_remediation_task(control_key: str, payload: schemas.RemediationTaskUpdate, db: Session = Depends(get_db)):
    """Persist a task status change. Only 'verified' controls count toward
    achieved-risk calculations (see /remediation/impact)."""
    control = _control_or_404(db, control_key)
    task = db.scalar(select(models.RemediationTask).where(models.RemediationTask.control_key == control_key))
    if task is None:
        task = models.RemediationTask(control_key=control_key, status='planned')
        db.add(task)
    task.status = payload.status
    task.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(task)
    return _task_out(db, control, task)


@router.get('/impact', response_model=schemas.RemediationImpact)
def remediation_impact(db: Session = Depends(get_db)):
    """Before/after achieved-risk recalculation for the scenario asset.

    ONLY 'verified' controls feed the after figure; 'completed' (implemented
    but unverified) controls are reported separately and give NO risk credit.
    Control effectiveness is modeled as a reduction of the compromise
    probability (same deterministic seed before and after, so the delta comes
    from the controls alone). All inputs are either editable assumptions or
    catalog values - nothing is invented.
    """
    from app.services import monte_carlo, simulation_service

    asset_ids = {row['asset_id'] for row in risk_service.asset_rankings(db)}
    scenario_id = DEMO_SCENARIO_ASSET_ID if DEMO_SCENARIO_ASSET_ID in asset_ids else (
        max(risk_service.asset_rankings(db), key=lambda r: r['max_priority'])['asset_id']
        if asset_ids else ''
    )
    asset = db.scalar(select(models.Asset).where(models.Asset.asset_id == scenario_id))\
        if scenario_id else None
    if asset is None:
        return schemas.RemediationImpact(
            asset_id='',
            status_counts={'planned': 0, 'completed': 0, 'verified': 0},
            verified_controls=[],
            combined_effectiveness=0.0,
            excluded_completed_effectiveness=0.0,
            before=schemas.LossRange(expected_annual_loss_inr=0, p50_inr=0, p95_inr=0),
            after=schemas.LossRange(expected_annual_loss_inr=0, p50_inr=0, p95_inr=0),
            expected_reduction_inr=0,
            assumptions={'note': 'no assets imported yet'},
        )

    assumption = risk_service.get_or_create_assumption(db, asset)
    tasks = db.scalars(select(models.RemediationTask)).all()
    keys = {t.control_key for t in tasks}
    controls = {
        c.control_key: c
        for c in db.scalars(select(models.Control)).all()
        if c.control_key in keys
    }
    status_counts = {'planned': 0, 'completed': 0, 'verified': 0}
    verified_controls: list[str] = []
    verified_effectiveness: list[float] = []
    completed_effects: list[float] = []
    for task in tasks:
        control = controls.get(task.control_key)
        if control is None:
            continue  # control removed from catalog since the status was set
        status_counts[task.status] = status_counts.get(task.status, 0) + 1
        if task.status == 'verified':
            verified_controls.append(control.control_key)
            verified_effectiveness.append(float(control.eff_likely))
        elif task.status == 'completed':
            completed_effects.append(float(control.eff_likely))

    combined_verified = 1.0
    for effect in verified_effectiveness:
        combined_verified *= 1.0 - effect
    combined_verified = 1.0 - combined_verified
    excluded_completed = 1.0 - functools.reduce(
        lambda acc, eff: acc * (1.0 - eff), completed_effects, 1.0
    )

    base_freq = float(assumption.frequency_per_year)
    base_prob = float(assumption.compromise_probability)
    mode = int(assumption.assumed_impact_inr)
    low_amount = int(round(mode * (0.0 if mode == 0 else simulation_service.SEVERITY_LOW_FACTOR)))
    high_amount = int(round(mode * (0.0 if mode == 0 else simulation_service.SEVERITY_HIGH_FACTOR)))

    before = monte_carlo.simulate_loss_distribution(
        frequency_per_year=base_freq,
        compromise_probability=base_prob,
        severity_low_inr=low_amount,
        severity_likely_inr=mode,
        severity_high_inr=high_amount,
        seed=monte_carlo.DEFAULT_SEED,
        iterations=monte_carlo.DEFAULT_ITERATIONS,
    )
    after = monte_carlo.simulate_loss_distribution(
        frequency_per_year=base_freq,
        compromise_probability=base_prob * (1.0 - combined_verified),
        severity_low_inr=low_amount,
        severity_likely_inr=mode,
        severity_high_inr=high_amount,
        seed=monte_carlo.DEFAULT_SEED,
        iterations=monte_carlo.DEFAULT_ITERATIONS,
    )

    return schemas.RemediationImpact(
        asset_id=asset.asset_id,
        status_counts=status_counts,
        verified_controls=verified_controls,
        combined_effectiveness=round(combined_verified, 4),
        excluded_completed_effectiveness=round(excluded_completed, 4),
        before=schemas.LossRange(
            expected_annual_loss_inr=before['expected_annual_loss_inr'],
            p50_inr=before['p50_inr'],
            p95_inr=before['p95_inr'],
        ),
        after=schemas.LossRange(
            expected_annual_loss_inr=after['expected_annual_loss_inr'],
            p50_inr=after['p50_inr'],
            p95_inr=after['p95_inr'],
        ),
        expected_reduction_inr=max(
            0, before['expected_annual_loss_inr'] - after['expected_annual_loss_inr']
        ),
        assumptions={
            'verified_only': TASK_STATUS_LABELS['verified'],
            'completed_excluded': (
                f"completed controls (combined {round(excluded_completed, 4)}) give NO risk "
                'credit until verified through remediation tasks'
            ),
            'correction_model': (
                'verified controls reduce the scenario compromise probability with the '
                'combined-effectiveness formula; same seed before/after'
            ),
            'same_seed': 'identical seed before/after: the delta comes only from verified controls',
            'scenario': (
                f"asset {asset.asset_id}: assumed impact is an EDITABLE assumption "
                '(PUT /assumptions/impact/{asset_id}), default from criticality'
            ),
        },
    )


@router.get('/costs', response_model=list[schemas.ControlCost])
def remediation_costs(db: Session = Depends(get_db)):
    """Flat cost/category lookup for all controls, used by the remediation UI."""
    controls = db.scalars(select(models.Control).order_by(models.Control.control_key)).all()
    return [
        schemas.ControlCost(
            control_id=c.control_key,
            control_name=c.control_name,
            category=c.category,
            cost_inr=c.annual_cost,
        )
        for c in controls
    ]
