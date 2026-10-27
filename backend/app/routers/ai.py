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

import threading
import time
from collections import deque

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.services import copilot

router = APIRouter()

# security.md: rate-limit AI routes. In-process is fine for the MVP demo.
RATE_WINDOW_SECONDS = 60.0
RATE_MAX_REQUESTS = 10

_rate_lock = threading.Lock()
_rate_hits: deque = deque()


def _rate_limited() -> bool:
    now = time.monotonic()
    with _rate_lock:
        while _rate_hits and now - _rate_hits[0] > RATE_WINDOW_SECONDS:
            _rate_hits.popleft()
        if len(_rate_hits) >= RATE_MAX_REQUESTS:
            return True
        _rate_hits.append(now)
        return False


@router.get('/explain', response_model=schemas.AiExplainResponse)
def ai_explain(db: Session = Depends(get_db)):
    if _rate_limited():
        raise HTTPException(status_code=429, detail='Too many AI requests, try again shortly')
    metrics = copilot.build_metrics(db)
    return copilot.explain(metrics)


@router.get('/metrics', response_model=schemas.CopilotMetrics)
def ai_metrics(db: Session = Depends(get_db)):
    """The validated metrics block only - useful for demos and tests without
    consuming the explain rate budget."""
    return copilot.validated_metrics(copilot.build_metrics(db))
