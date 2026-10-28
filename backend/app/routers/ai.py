"""AI Copilot endpoints (build item 8).

Security model (security.md):
- GET /ai/explain accepts NO request body: there is no user text channel into
  the prompt, so prompt injection through the UI is impossible here.
- The LLM is called server-side from app.services.llm only; the API key never
  leaves this process and never appears in any response field.
- The reply is validated against the calculated metrics; anything the model
  invented triggers the deterministic fallback.
- The route is rate-limited (simple in-process sliding window).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app import schemas
from app.database import get_db
from app.services import copilot, llm
from app.security import ai_explain_limit, ai_executive_limit

router = APIRouter()
# Kept for tests that explicitly reset the shared limiter.
_rate_hits = ai_explain_limit.client_hits
RATE_MAX_REQUESTS = ai_explain_limit.limit

@router.get('/explain-risk', response_model=schemas.AiExplainResponse)
def ai_explain(db: Session = Depends(get_db), _rate=Depends(ai_explain_limit)):
    metrics = copilot.build_metrics(db)
    return copilot.explain(metrics)


@router.get('/metrics', response_model=schemas.CopilotMetrics)
def ai_metrics(db: Session = Depends(get_db)):
    """The validated calculated metrics block; does not call a model."""
    return copilot.validated_metrics(copilot.build_metrics(db))


@router.get('/executive-summary', response_model=schemas.AiExplainResponse)
def executive_summary(db: Session = Depends(get_db), _rate=Depends(ai_executive_limit)):
    return copilot.explain(copilot.build_metrics(db), kind='executive-summary')


@router.get('/status', response_model=schemas.AiStatus)
def ai_status():
    return llm.status()
