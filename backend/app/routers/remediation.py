import functools
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.services import risk_service
from app.services.remediation_tasks import task_defaults

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
                    priority_label=row['priority_label'],
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
    'open': 'open change - not implemented, no risk credit',
    'in_progress': 'work in progress - no risk credit',
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
    task = task if task is not None else task_defaults(db, control)
    if task is None:
        return None
    status = task.status
    return {
        'id': task.id,
        'control_key': control.control_key,
        'control_name': control.control_name,
        'category': control.category,
        'status': status,
        'cost_inr': int(control.annual_cost),
        'priority': task.priority, 'asset_id': task.asset_id,
        'vulnerability_id': task.vulnerability_id,
        'estimated_risk_reduction': task.estimated_risk_reduction,
        'due_date': task.due_date, 'owner': task.owner,
        'effectiveness': float(control.eff_likely),
        'counts_toward_achieved_risk': status == 'verified' and control.coverage > 0 and control.implementation_status in ('implemented', 'partial', 'completed', 'verified'),
        'coverage': control.coverage,
        'updated_at': task.updated_at.isoformat() if task is not None and task.updated_at else None,
    }


@router.get('', response_model=list[schemas.RemediationTaskOut])
@router.get('/tasks', response_model=list[schemas.RemediationTaskOut])
def list_remediation_tasks(db: Session = Depends(get_db)):
    """Execution status for every catalog control; a control with no persisted
    row is implicitly open (no row is created until the first update)."""
    controls = {control.control_key: control for control in db.scalars(select(models.Control)).all()}
    tasks = db.scalars(select(models.RemediationTask).order_by(models.RemediationTask.priority, models.RemediationTask.id)).all()
    result = [_task_out(db, controls[task.control_key], task) for task in tasks if task.control_key in controls]
    present = {task.control_key for task in tasks}
    for key, control in controls.items():
        if key not in present:
            transient = _task_out(db, control, None)
            if transient:
                result.append(transient)
    return result


@router.put('/{control_key}', response_model=schemas.RemediationTaskOut)
@router.put('/tasks/{control_key}', response_model=schemas.RemediationTaskOut)
def update_remediation_task(control_key: str, payload: schemas.RemediationTaskUpdate, db: Session = Depends(get_db), task_id: int | None = Query(None, ge=1)):
    """Persist a task status change. Only 'verified' controls count toward
    achieved-risk calculations (see /remediation/impact)."""
    control = _control_or_404(db, control_key)
    query = select(models.RemediationTask).where(models.RemediationTask.control_key == control_key)
    if task_id is not None:
        query = query.where(models.RemediationTask.id == task_id)
    task = db.scalar(query.order_by(models.RemediationTask.priority, models.RemediationTask.id))
    if task_id is not None and task is None:
        raise HTTPException(status_code=404, detail='Task not found')
    if task is None:
        task = task_defaults(db, control)
        if task is None:
            raise HTTPException(status_code=409, detail='Import an asset before creating remediation tasks')
        db.add(task)
    if payload.coverage is not None:
        control.coverage = payload.coverage
    if payload.status == 'verified':
        control.implementation_status = 'verified'
    elif task.status == 'verified' and control.implementation_status == 'verified':
        control.implementation_status = 'none'
    task.status = payload.status
    if payload.owner is not None:
        task.owner = payload.owner
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
    from app.services.remediation_tasks import impact
    return impact(db)


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
