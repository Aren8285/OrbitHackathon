from fastapi import APIRouter, Depends
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
