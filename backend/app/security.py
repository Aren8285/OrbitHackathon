"""Shared demo access and bounded, process-local rate limits."""
import secrets
import threading
import time
from collections import deque

from fastapi import Header, HTTPException

from app.config import settings


def require_demo_token(x_demo_token: str | None = Header(default=None)) -> None:
    expected = settings.demo_api_token
    if not expected or not x_demo_token or not secrets.compare_digest(
        x_demo_token.encode(), expected.encode()
    ):
        raise HTTPException(status_code=401, detail='Invalid demo token')


class RateLimit:
    """One shared bucket per demo route group; bounded memory, no client spoofing."""
    def __init__(self, limit: int = 10, window: float = 60):
        self.limit = limit
        self.window = window
        self.hits = deque()
        self.lock = threading.Lock()

    def clear(self):
        with self.lock:
            self.hits.clear()

    def __call__(self):
        now = time.monotonic()
        with self.lock:
            while self.hits and now - self.hits[0] >= self.window:
                self.hits.popleft()
            if len(self.hits) >= self.limit:
                raise HTTPException(status_code=429, detail='Too many requests; try again shortly', headers={'Retry-After': str(int(self.window))})
            self.hits.append(now)


ai_limit = RateLimit()
upload_limit = RateLimit()
