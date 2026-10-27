"""Risk-service layer: turns database rows into scored rankings.

Routers stay thin; all logic lives here (coder.md rule 4). Every computed
number is derived from DB rows plus the documented scoring formulas. Missing
financial inputs are NEVER invented: each asset carries an editable impact
assumption (default = asset criticality x IMPACT_REFERENCE_INR), stored in
the impact_assumptions table and editable through the /assumptions API.
"""

from typing import List

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app import models
from app.services import enrichment, scoring, simulation_service


def asset_criticality(asset: models.Asset) -> float:
    return scoring.compute_criticality(
        asset.revenue_dependency,
        asset.data_classification,
        asset.operational_impact,
        asset.compliance_impact,
    )


def get_or_create_assumption(db: Session, asset: models.Asset) -> models.ImpactAssumption:
    """Fetch the asset's impact assumption; create the documented defaults if absent.
    Defaults (criticality x 1 crore influence, 2 events/year, 0.5 compromise
    probability) are labeled assumptions, always visible and editable."""
    assumption = db.scalar(
        select(models.ImpactAssumption).where(models.ImpactAssumption.asset_row_id == asset.id)
    )
    if assumption is None:
        criticality = asset_criticality(asset)
        assumption = models.ImpactAssumption(
            asset_row_id=asset.id,
            assumed_impact_inr=int(round(criticality * scoring.DEFAULT_FULL_IMPACT_INR)),
            frequency_per_year=simulation_service.DEFAULT_FREQUENCY_PER_YEAR,
            compromise_probability=simulation_service.DEFAULT_COMPROMISE_PROBABILITY,
            basis='default',
        )
        db.add(assumption)
        db.commit()
        db.refresh(assumption)
    return assumption


def get_all_assumptions(db: Session) -> list:
    """One assumption row per asset, creating documented defaults on first read."""
    return [
        get_or_create_assumption(db, asset)
        for asset in db.scalars(select(models.Asset).order_by(models.Asset.asset_id)).all()
    ]


def assumption_out(db: Session, assumption: models.ImpactAssumption) -> dict:
    asset = db.scalar(select(models.Asset).where(models.Asset.id == assumption.asset_row_id))
    criticality = asset_criticality(asset)
    return {
        'asset_id': asset.asset_id,
        'asset_name': asset.asset_name,
        'assumed_impact_inr': assumption.assumed_impact_inr,
        'frequency_per_year': assumption.frequency_per_year,
        'compromise_probability': assumption.compromise_probability,
        'is_assumption': True,
        'basis': assumption.basis,
        'default_impact_inr': int(round(criticality * scoring.DEFAULT_FULL_IMPACT_INR)),
        'criticality': round(criticality, 4),
    }


def update_assumption(db: Session, asset: models.Asset, payload: dict) -> dict:
    """Apply only the provided assumption fields; basis flips to 'edited'."""
    assumption = get_or_create_assumption(db, asset)
    if payload.get('assumed_impact_inr') is not None:
        assumption.assumed_impact_inr = int(payload['assumed_impact_inr'])
    if payload.get('frequency_per_year') is not None:
        assumption.frequency_per_year = float(payload['frequency_per_year'])
    if payload.get('compromise_probability') is not None:
        assumption.compromise_probability = float(payload['compromise_probability'])
    assumption.basis = 'edited'
    db.commit()
    db.refresh(assumption)
    return assumption_out(db, assumption)


def findings(db: Session):
    return (
        db.scalars(
            select(models.Vulnerability)
            .options(joinedload(models.Vulnerability.asset))
            .order_by(models.Vulnerability.asset_row_id, models.Vulnerability.cve_id)
        )
        .unique()
        .all()
    )


def finding_rankings(db: Session, open_only: bool = True) -> List[dict]:
    """Per-finding technical risk and priority ranking, highest first."""
    rows: List[dict] = []
    for vuln in findings(db):
        if open_only and vuln.status != 'open':
            continue
        asset = vuln.asset
        criticality = asset_criticality(asset)
        enrichment_result = enrichment.enrich_finding(vuln.cve_id, vuln.is_kev, vuln.epss_score)
        exposure = scoring.compute_exposure(
            asset.internet_facing,
            enrichment_result['kev'],
            enrichment_result['epss'],
            vuln.patch_age_days,
        )
        technical_risk = scoring.compute_technical_risk(vuln.cvss_score, exposure, criticality)
        assumption = get_or_create_assumption(db, asset)
        financial_impact = scoring.financial_impact_score(assumption.assumed_impact_inr)
        priority = scoring.compute_priority(
            enrichment_result['kev'],
            enrichment_result['epss'],
            asset.internet_facing,
            criticality,
            financial_impact,
        )
        rows.append(
            {
                'asset_id': asset.asset_id,
                'asset_name': asset.asset_name,
                'cve_id': vuln.cve_id,
                'title': vuln.title,
                'status': vuln.status,
                'cvss_score': round(vuln.cvss_score, 2),
                'epss_score': round(enrichment_result['epss'], 4),
                'is_kev': enrichment_result['kev'],
                'internet_facing': bool(asset.internet_facing),
                'patch_age_days': vuln.patch_age_days,
                'criticality': round(criticality, 4),
                'exposure': round(exposure, 4),
                'technical_risk': round(technical_risk, 4),
                'financial_impact': round(financial_impact, 4),
                'assumed_impact_inr': assumption.assumed_impact_inr,
                'priority': round(priority, 4),
                'fictional': enrichment_result['fictional'],
                'data_source': enrichment_result['data_source'],
            }
        )
    rows.sort(key=lambda row: (-row['priority'], -row['technical_risk'], row['asset_id'], row['cve_id']))
    return rows


def asset_rankings(db: Session) -> List[dict]:
    """Per-asset aggregate ranking: highest-priority finding drives the sort."""
    by_asset: dict = {}
    analytic_rows = finding_rankings(db, open_only=True)
    for row in analytic_rows:
        by_asset.setdefault(
            row['asset_id'],
            {
                'open_findings': 0,
                'kev_findings': 0,
                'max_technical_risk': 0.0,
                'max_priority': 0.0,
            },
        )
        agg = by_asset[row['asset_id']]
        agg['open_findings'] += 1
        agg['kev_findings'] += 1 if row['is_kev'] else 0
        agg['max_technical_risk'] = max(agg['max_technical_risk'], row['technical_risk'])
        agg['max_priority'] = max(agg['max_priority'], row['priority'])
    # assets without open findings still appear, ranked lowest
    result: List[dict] = []
    for asset in db.scalars(select(models.Asset)).all():
        assumption = get_or_create_assumption(db, asset)
        criticality = asset_criticality(asset)
        agg = by_asset.get(asset.asset_id, {
            'open_findings': 0,
            'kev_findings': 0,
            'max_technical_risk': 0.0,
            'max_priority': 0.0,
        })
        result.append(
            {
                'asset_id': asset.asset_id,
                'asset_name': asset.asset_name,
                'criticality': round(criticality, 4),
                'internet_facing': bool(asset.internet_facing),
                'open_findings': agg['open_findings'],
                'kev_findings': agg['kev_findings'],
                'max_technical_risk': round(agg['max_technical_risk'], 4),
                'max_priority': round(agg['max_priority'], 4),
                'assumed_impact_inr': assumption.assumed_impact_inr,
            }
        )
    result.sort(key=lambda row: (-row['max_priority'], -row['criticality'], row['asset_id']))
    return result


def summary(db: Session) -> dict:
    from sqlalchemy import func

    all_rows = findings(db)
    open_rows = [v for v in all_rows if v.status == 'open']
    ranked = finding_rankings(db, open_only=True)
    assets = db.scalars(select(models.Asset)).all()
    total_assumed = sum(get_or_create_assumption(db, asset).assumed_impact_inr for asset in assets)
    return {
        'total_assets': db.scalar(select(func.count()).select_from(models.Asset)) or 0,
        'critical_assets': len([a for a in assets if asset_criticality(a) >= 0.8]),
        'open_vulnerabilities': len(open_rows),
        'total_vulnerabilities': len(all_rows),
        'kev_vulnerabilities': len([row for row in ranked if row['is_kev']]),
        'assumed_exposure_inr': int(total_assumed),
        'financial_note': (
            'assumed_exposure_inr is the sum of EDITABLE per-asset impact assumptions '
            '(default = criticality x 1 crore INR); it is not a measured or simulated loss.'
        ),
    }
