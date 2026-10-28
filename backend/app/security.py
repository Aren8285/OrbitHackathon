"""Shared demo access and bounded, process-local rate limits."""
import secrets
import threading
import time
from collections import deque

from fastapi import Header, HTTPException, Request

from app.config import settings


def require_demo_token(x_demo_token: str | None = Header(default=None)) -> None:
    expected = settings.demo_api_token
    if not expected or not x_demo_token or not secrets.compare_digest(
        x_demo_token.encode(), expected.encode()
    ):
        raise HTTPException(status_code=401, detail='Invalid demo token')


class RateLimit:
    """One shared bucket per demo route group; bounded memory, no client spoofing."""
    def __init__(self, limit: int = 10, window: float = 60, per_client: bool = False):
        self.limit = limit
        self.window = window
        self.per_client = per_client
        self.hits = deque()
        self.client_hits = {}
        self.lock = threading.Lock()

    def clear(self):
        with self.lock:
            self.hits.clear()
            self.client_hits.clear()

    def __call__(self, request: Request):
        now = time.monotonic()
        key = request.client.host if self.per_client and request.client else 'unknown'
        with self.lock:
            bucket = self.client_hits.setdefault(key, deque()) if self.per_client else self.hits
            while bucket and now - bucket[0] >= self.window:
                bucket.popleft()
            if len(bucket) >= self.limit:
                raise HTTPException(status_code=429, detail='Too many requests; try again shortly', headers={'Retry-After': str(int(self.window))})
            bucket.append(now)


upload_limit = RateLimit()
ai_explain_limit = RateLimit(per_client=True)
ai_executive_limit = RateLimit(per_client=True)
