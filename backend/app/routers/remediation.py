from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter()

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _control_for_finding(db: Session, finding: models.Vulnerability) -> models.Control | None:
    """Match the best control to an open vulnerability finding: same cve_id, or else same category,
    preferring the highest effectiveness."""
    if finding.cve_id and finding.cve_id.strip() != '':
        matched = db.scalar(
            select(models.Control)
            .where(models.Control.cve_id == finding.cve_id)
            .order_by(models.Control.eff_likely.desc())
        )
        if matched is not None:
            return matched

    if finding.category and finding.category.strip() != '':
        matched = db.scalar(
            select(models.Control)
            .where(models.Control.category == finding.category)
            .order_by(models.Control.eff_likely.desc())
        )
        if matched is not None:
            return matched

    return None


def _effective_ordering(finding: models.Vulnerability) -> str:
    """Sort findings so highest-priority CVEs come first."""
    return f"{finding.priority:010.6f}_{finding.cve_id}".lower()


# ---------------------------------------------------------------------------
# routes
# ---------------------------------------------------------------------------


@router.get('/plan', response_model=schemas.RemediationPlan)
def remediation_plan(db: Session = Depends(get_db)):
    """Return a prioritized remediation plan: one control per open finding where
    a suitable control exists, ordered by finding priority."""
    findings = db.scalars(
        select(models.Vulnerability)
        .order_by(models.Vulnerability.priority.desc())
    ).all()

    plan: list[schemas.RemediationPlanItem] = []
    used: set[tuple[str, str]] = set()

    for finding in findings:
        control = _control_for_finding(db, finding)
        if control is None:
            continue

        key = (control.control_id, finding.id)
        if key in used:
            continue
        used.add(key)

        plan.append(
            schemas.RemediationPlanItem(
                finding=schemas.FindingSummary(
                    finding_id=finding.id,
                    cve_id=finding.cve_id,
                    asset_asset_id=finding.asset.asset_id,
                    asset_name=finding.asset.asset_name,
                    asset_criticality=finding.asset.criticality,
                    asset_category=str(getattr(finding.asset, 'category', '') or ''),
                    title=finding.title,
                    cvss=finding.cvss_score,
                    kev=finding.is_kev,
                    epss=finding.epss_score,
                    priority=finding.priority,
                ),
                control=schemas.ControlSummary(
                    control_id=control.control_id,
                    control_name=control.control_name,
                    category=control.category,
                    kev_relevant=control.kev_relevant,
                    tlp=control.tlp,
                    cost_inr=control.cost_inr,
                    cost_note=control.cost_note,
                    effectiveness=control.eff_likely,
                    effectiveness_note=control.eff_note,
                ),
            )
        )

    total_cost = sum(item.control.cost_inr for item in plan)
    return schemas.RemediationPlan(plan=plan, total_cost=total_cost)


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
