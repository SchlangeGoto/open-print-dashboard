"""In-memory per-tenant request rate limit.

The backend runs a single worker on purpose (see D-12), so a process-local
window is sufficient. A multi-worker deployment would need Redis or a database
counter instead.
"""

import threading
import time

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from app.core.config import settings

WINDOW_SECONDS = 60


class TenantRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self._lock = threading.Lock()
        self._windows: dict[str, tuple[float, int]] = {}

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        limit = settings.TENANT_RATE_LIMIT_PER_MINUTE
        if limit <= 0 or not request.url.path.startswith(settings.API_V1_STR):
            return await call_next(request)
        tenant_key = request.headers.get("X-Tenant-ID") or request.headers.get(
            "X-Tenant-Slug"
        )
        if not tenant_key:
            # A single-tenant client does not send a header; its authenticated
            # routes still have their own per-user checks and quotas.
            return await call_next(request)

        now = time.monotonic()
        with self._lock:
            started, count = self._windows.get(tenant_key, (now, 0))
            if now - started >= WINDOW_SECONDS:
                started, count = now, 0
            count += 1
            self._windows[tenant_key] = (started, count)
            remaining = max(0, limit - count)
            retry_after = max(1, int(WINDOW_SECONDS - (now - started)))

        if count > limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Tenant rate limit exceeded"},
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                },
            )
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response
