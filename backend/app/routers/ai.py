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
from app.security import ai_limit

router = APIRouter(dependencies=[Depends(ai_limit)])
# Kept for tests that explicitly reset the shared limiter.
_rate_hits = ai_limit.hits
RATE_MAX_REQUESTS = ai_limit.limit

@router.get('/explain-risk', response_model=schemas.AiExplainResponse)
def ai_explain(db: Session = Depends(get_db)):
    metrics = copilot.build_metrics(db)
    return copilot.explain(metrics)


@router.get('/metrics', response_model=schemas.CopilotMetrics)
def ai_metrics(db: Session = Depends(get_db)):
    """The validated metrics block only - useful for demos and tests with the same shared AI rate limit."""
    return copilot.validated_metrics(copilot.build_metrics(db))


@router.get('/executive-summary', response_model=schemas.AiExplainResponse)
def executive_summary(db: Session = Depends(get_db)):
    return copilot.explain(copilot.build_metrics(db), kind='executive-summary')


@router.get('/status', response_model=schemas.AiStatus)
def ai_status():
    return llm.status()
