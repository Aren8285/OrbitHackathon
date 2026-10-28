"""Copilot orchestration: assemble ONLY validated, calculated metrics and
explain them through the server-side LLM (with deterministic fallback).

Security rules implemented here (security.md / TASK 5):
- Metrics are computed by risk_service / simulation_service / optimizer from
  database rows. The phone number of the scenario, budget, and every figure
  comes from the DB - nothing is invented for the model.
- The LLM sees only the calculated JSON metrics plus a system prompt requiring
  placeholders. Server-side substitution rejects invented figures before a
  response is served; invalid replies fall back to the deterministic template.
- Short names/titles are untrusted data; prompts and numeric validation
  prevent them from changing calculated metrics.
"""

import json
import hashlib
import threading
import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import settings
from app.services import llm, optimizer as optimizer_service, risk_service, simulation_service

DISCLAIMER = (
    'All figures above come from the RiskOps scoring, simulation and optimizer '
    'engines on the current database. The AI never generates its own numbers; '
    'losses are rounded to integer INR.'
)

DATA_SOURCES_NOTE = (
    'Vulnerability data: FinPay demo CSVs. CVSS/EPSS/KEV enriched from local '
    'CISA KEV and FIRST EPSS exports; CVEs missing from those feeds are the '
    'fictional demo CVEs and are marked SAMPLE.'
)

TOP_RISK_LIMIT = 5

DEMO_SCENARIO_ASSET_ID = 'A-001'  # coder.md demo story: FinPay payment database
_EXPLANATION_CACHE_SECONDS = 600
_explanation_cache = {}
_cache_lock = threading.Lock()


def clear_explanation_cache():
    with _cache_lock:
        _explanation_cache.clear()


def build_metrics(db: Session) -> dict:
    """Compute the validated metrics the copilot may narrate."""
    summary_out = risk_service.summary(db)

    from app.services import scenario_engine
    sim = scenario_engine.portfolio(db)
    scenario_asset_id = 'portfolio'
    expected_loss, p50, p95 = sim['expected_annual_loss_inr'], sim['p50_inr'], sim['p95_inr']
    opt = optimizer_service.recommend(db, int(settings.default_budget))
    recommendations = [{key: row[key] for key in ('control_key', 'control_name', 'annual_cost_inr', 'effectiveness', 'marginal_benefit_inr')}
                       for row in opt['recommended_controls'][:TOP_RISK_LIMIT]]

    top_risks = [
        {
            'rank': index,
            'priority_label': row['priority_label'],
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
    return schemas.CopilotMetrics(**llm.truncate_text_fields(metrics))


def explain(metrics: dict, kind: str = 'explain-risk') -> dict:
    """Only valid calculated-number text is served; every failure uses template."""
    validated = validated_metrics(metrics).model_dump()
    cache_key = hashlib.sha256((kind + ':' + json.dumps(validated, sort_keys=True, separators=(',', ':'))).encode()).hexdigest()
    now = time.monotonic()
    with _cache_lock:
        for old_key, (created, _) in list(_explanation_cache.items()):
            if now - created >= _EXPLANATION_CACHE_SECONDS:
                _explanation_cache.pop(old_key, None)
        cached = _explanation_cache.get(cache_key)
        if cached and now - cached[0] < _EXPLANATION_CACHE_SECONDS:
            return dict(cached[1])
        _explanation_cache.pop(cache_key, None)
    reason = None
    if settings.llm_provider != 'gemini' or not settings.gemini_api_key:
        reason = 'Gemini provider disabled or key missing'
    else:
        try:
            system_prompt, user_prompt = llm.build_prompts(validated, kind)
            reply, model = llm.call_llm(system_prompt, user_prompt, validation_metrics=validated)
            llm.record_model(model)
            result = dict(explanation=reply, source='llm', model=model, fallback_reason=None,
                          metrics=validated, disclaimer=DISCLAIMER)
            with _cache_lock:
                _explanation_cache[cache_key] = (time.monotonic(), result)
            return result
        except llm.LLMError as exc:
            reason = str(exc)
        except Exception:
            reason = 'Gemini request failed; template explanation used'
    return dict(explanation=llm.build_fallback(validated), source='fallback', model='template',
                fallback_reason=reason, metrics=validated, disclaimer=DISCLAIMER)
