"""Copilot orchestration: assemble ONLY validated, calculated metrics and
explain them through the server-side LLM (with deterministic fallback).

Security rules implemented here (security.md / TASK 5):
- Metrics are computed by risk_service / simulation_service / optimizer from
  database rows. The phone number of the scenario, budget, and every figure
  comes from the DB - nothing is invented for the model.
- The LLM sees only the JSON metrics block plus a system prompt that tells it
  to treat the JSON as data, never as instructions, and never to invent
  numbers. Output text is scanned with llm.unapproved_numbers(); any invented
  figure discards the reply and the deterministic fallback renders instead.
- No user text is ever sent (GET /ai/explain takes no request body), so
  prompt injection through this endpoint is not possible.
"""

from typing import Dict, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import settings
from app.services import llm, optimizer as optimizer_service, risk_service, simulation_service

DISCLAIMER = (
    'All figures above come from the RiskOps scoring, simulation and optimizer '
    'engines on the current database. The AI never generates its own numbers; '
    'losses are rounded to 1,000 INR.'
)

DATA_SOURCES_NOTE = (
    'Vulnerability data: FinPay demo CSVs. CVSS/EPSS/KEV enriched from local '
    'CISA KEV and FIRST EPSS exports; CVEs missing from those feeds are the '
    'fictional demo CVEs and are marked SAMPLE.'
)

TOP_RISK_LIMIT = 5

DEMO_SCENARIO_ASSET_ID = 'A-001'  # coder.md demo story: FinPay payment database


def build_metrics(db: Session) -> dict:
    """Compute the validated metrics the copilot may narrate."""
    summary_out = risk_service.summary(db)

    rankings = risk_service.asset_rankings(db)
    scenario_asset_id = DEMO_SCENARIO_ASSET_ID if any(
        row['asset_id'] == DEMO_SCENARIO_ASSET_ID for row in rankings
    ) else (rankings[0]['asset_id'] if rankings else '')

    expected_loss = p50 = p95 = 0
    recommendations: list = []
    if scenario_asset_id:
        asset = db.scalar(select(models.Asset).where(models.Asset.asset_id == scenario_asset_id))
        if asset is not None:
            sim = simulation_service.run_for_asset(db, asset)
            expected_loss = int(sim['expected_annual_loss_inr'])
            p50 = int(sim['p50_inr'])
            p95 = int(sim['p95_inr'])

            budget = int(settings.default_budget)
            assumption = risk_service.get_or_create_assumption(db, asset)
            candidates = [
                optimizer_service.ControlCandidate(
                    control_key=c.control_key,
                    control_name=c.control_name,
                    annual_cost_inr=c.annual_cost,
                    effectiveness=c.eff_likely,
                )
                for c in db.scalars(select(models.Control)).all()
            ]
            opt = optimizer_service.optimize_portfolio(
                candidates, assumption.assumed_impact_inr, budget
            )
            recommendations = [
                {
                    'control_key': row['control_key'],
                    'control_name': row['control_name'],
                    'annual_cost_inr': int(row['annual_cost_inr']),
                    'effectiveness': float(row['effectiveness']),
                    'marginal_benefit_inr': int(row['marginal_benefit_inr']),
                }
                for row in opt['recommended_controls'][:TOP_RISK_LIMIT]
            ]

    top_risks = [
        {
            'rank': index,
            'asset_id': row['asset_id'],
            'cve_id': row['cve_id'],
            'title': row['title'][:200],  # security.md: short names only
            'priority': float(row['priority']),
            'technical_risk': float(row['technical_risk']),
            'criticality': float(row['criticality']),
            'fictional': bool(row['fictional']),
            'data_source': row['data_source'],
        }
        for index, row in enumerate(risk_service.finding_rankings(db, open_only=True)[:TOP_RISK_LIMIT], start=1)
    ]

    return {
        'total_assets': int(summary_out['total_assets']),
        'critical_assets': int(summary_out['critical_assets']),
        'open_vulnerabilities': int(summary_out['open_vulnerabilities']),
        'kev_vulnerabilities': int(summary_out['kev_vulnerabilities']),
        'assumed_exposure_inr': int(summary_out['assumed_exposure_inr']),
        'financial_note': summary_out['financial_note'],
        'scenario_asset_id': scenario_asset_id,
        'expected_annual_loss_inr': expected_loss,
        'p50_inr': p50,
        'p95_inr': p95,
        'budget_inr': int(settings.default_budget),
        'top_risks': top_risks,
        'recommendations': recommendations,
        'data_sources_note': DATA_SOURCES_NOTE,
    }


def validated_metrics(metrics: dict) -> schemas.CopilotMetrics:
    """Validate the metrics through the Pydantic model before any LLM use."""
    return schemas.CopilotMetrics(**metrics)


def explain(metrics: dict) -> dict:
    """Try the LLM; fall back deterministically whenever it cannot comply."""
    validated = validated_metrics(metrics).model_dump()
    allowed = llm.build_allowed(validated)
    fallback_reason: Optional[str] = None
    model = None
    source = 'fallback'

    if not settings.openai_api_key:
        fallback_reason = 'no LLM API key configured on the server'
    else:
        system_prompt, user_prompt = llm.build_prompts(validated)
        try:
            reply = llm.call_llm(system_prompt, user_prompt)
        except llm.LLMError as exc:
            fallback_reason = str(exc)
        else:
            unapproved = llm.unapproved_numbers(reply, allowed)
            if unapproved:
                fallback_reason = (
                    'LLM reply discarded: contained numbers absent from the '
                    f'metrics ({", ".join(unapproved[:5])})'
                )
            else:
                source = 'llm'
                model = settings.openai_model
                return {
                    'explanation': reply,
                    'source': source,
                    'model': model,
                    'fallback_reason': None,
                    'metrics': validated,
                    'disclaimer': DISCLAIMER,
                }

    return {
        'explanation': llm.build_fallback(validated),
        'source': source,
        'model': None,
        'fallback_reason': fallback_reason,
        'metrics': validated,
        'disclaimer': DISCLAIMER,
    }
