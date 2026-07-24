import time
from typing import Dict, List
from fastapi import HTTPException, Request


def resolve_client_ip(request: Request) -> str:
    """
    Resolve the real client IP. Behind a proxy/load balancer (e.g. Render, Vercel),
    request.client.host is the proxy's address, which would collapse every user into
    one rate-limit bucket. Prefer the left-most hop in X-Forwarded-For.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client = forwarded.split(",")[0].strip()
        if client:
            return client
    return request.client.host if request.client else "unknown"


class SlidingWindowRateLimiter:
    """
    In-memory Sliding Window Rate Limiter to guard against endpoint flood/spam.
    """
    def __init__(self, limit: int = 5, window_seconds: int = 60) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.history: Dict[str, List[float]] = {}

    def is_rate_limited(self, key: str) -> bool:
        now = time.time()
        cutoff = now - self.window_seconds
        timestamps = self.history.get(key, [])
        timestamps = [t for t in timestamps if t > cutoff]
        self.history[key] = timestamps
        
        if len(timestamps) >= self.limit:
            return True
            
        self.history[key].append(now)
        return False

    def __call__(self, request: Request) -> None:
        client_ip = resolve_client_ip(request)
        # Rate limit based on endpoint path + client IP
        key = f"{request.url.path}:{client_ip}"
        
        if self.is_rate_limited(key):
            raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

# Mutating routes limiter (10 calls per minute per IP)
mutating_rate_limiter = SlidingWindowRateLimiter(limit=10, window_seconds=60)
