"""Per-client-IP fixed-window rate limiting.

In-process state is sufficient (and correct) because the backend runs a single
uvicorn worker. Requests arrive via Caddy → Next.js rewrite, so the client IP
must be read from X-Forwarded-For — ``request.client.host`` would only ever be
the frontend container.
"""
from __future__ import annotations

import time

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.config import get_settings

_WINDOW_SECONDS = 60
# Purge expired windows once the table grows past this many (ip, bucket) keys.
_PURGE_THRESHOLD = 10_000

_settings = get_settings()

# (bucket name, path prefixes). First match wins; export must precede any
# broader prefix that would swallow it.
_BUCKETS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("export", ("/api/v1/export/",)),
    ("expensive", ("/api/v1/historical/", "/api/v1/vehicles/")),
    ("default", ("/api/",)),
)


def _bucket_limits() -> dict[str, int]:
    return {
        "export": _settings.rate_limit_export_per_minute,
        "expensive": _settings.rate_limit_expensive_per_minute,
        "default": _settings.rate_limit_default_per_minute,
    }


class RateLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.limits = _bucket_limits()
        # (client_ip, bucket) -> [window_start, count]
        self._windows: dict[tuple[str, str], list[float]] = {}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        bucket = _match_bucket(scope["path"])
        if bucket is None:
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        client_ip = _client_ip(request)
        retry_after = self._check(client_ip, bucket)
        if retry_after is not None:
            response = JSONResponse(
                status_code=429,
                content={"detail": "rate limit exceeded"},
                headers={"Retry-After": str(retry_after)},
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)

    def _check(self, client_ip: str, bucket: str) -> int | None:
        """Count this request; return seconds until reset if over budget."""
        now = time.monotonic()
        key = (client_ip, bucket)
        window = self._windows.get(key)
        if window is None or now - window[0] >= _WINDOW_SECONDS:
            if len(self._windows) > _PURGE_THRESHOLD:
                self._purge(now)
            self._windows[key] = [now, 1]
            return None
        window[1] += 1
        if window[1] > self.limits[bucket]:
            return max(1, int(_WINDOW_SECONDS - (now - window[0])) + 1)
        return None

    def _purge(self, now: float) -> None:
        expired = [k for k, w in self._windows.items() if now - w[0] >= _WINDOW_SECONDS]
        for k in expired:
            del self._windows[k]


def _match_bucket(path: str) -> str | None:
    for bucket, prefixes in _BUCKETS:
        if path.startswith(prefixes):
            return bucket
    return None


def _client_ip(request: Request) -> str:
    if _settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # Rightmost entry is the hop appended by our own edge (Caddy);
            # earlier entries are client-supplied and spoofable.
            return forwarded.rsplit(",", 1)[-1].strip()
    return request.client.host if request.client else "unknown"
