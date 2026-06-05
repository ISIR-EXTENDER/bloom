from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from hmac import compare_digest
from time import monotonic

from fastapi import FastAPI, HTTPException, Request, WebSocket, status
from starlette.responses import JSONResponse, Response


SECURITY_HEADERS = {
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
}

API_KEY_HEADER = "x-bloom-api-key"


@dataclass(frozen=True)
class BloomPrincipal:
    role: str

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def is_operator(self) -> bool:
        return self.role in {"admin", "operator"}


def install_security_headers(app: FastAPI) -> None:
    @app.middleware("http")
    async def security_headers_middleware(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        response = await call_next(request)

        for header, value in SECURITY_HEADERS.items():
            response.headers.setdefault(header, value)

        return response


def install_http_rate_limit(app: FastAPI) -> None:
    @app.middleware("http")
    async def http_rate_limit_middleware(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        settings = request.app.state.settings
        if settings.http_rate_limit_per_minute <= 0:
            return await call_next(request)

        client_key = request.client.host if request.client else "unknown"
        if not _allow_http_request(
            app.state.http_rate_limit_buckets,
            client_key,
            settings.http_rate_limit_per_minute,
            monotonic(),
        ):
            return JSONResponse(
                {"detail": "Too many requests."},
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        return await call_next(request)


def authenticate_api_key(settings, api_key: str | None) -> BloomPrincipal:
    if not settings.auth_enabled:
        return BloomPrincipal(role="admin")

    if api_key and settings.admin_api_key and compare_digest(api_key, settings.admin_api_key):
        return BloomPrincipal(role="admin")

    if api_key and settings.operator_api_key and compare_digest(api_key, settings.operator_api_key):
        return BloomPrincipal(role="operator")

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Valid Bloom API key required.",
        headers={"WWW-Authenticate": "ApiKey"},
    )


def require_operator(request: Request) -> BloomPrincipal:
    principal = authenticate_api_key(request.app.state.settings, request.headers.get(API_KEY_HEADER))
    if not principal.is_operator:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Operator role required.")
    return principal


def require_admin(request: Request) -> BloomPrincipal:
    principal = authenticate_api_key(request.app.state.settings, request.headers.get(API_KEY_HEADER))
    if not principal.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required.")
    return principal


async def require_runtime_websocket_operator(websocket: WebSocket) -> BloomPrincipal:
    settings = websocket.app.state.settings
    api_key = websocket.headers.get(API_KEY_HEADER) or websocket.query_params.get("api_key")
    try:
        principal = authenticate_api_key(settings, api_key)
    except HTTPException as exc:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason=str(exc.detail))
        raise

    if not principal.is_operator:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Operator role required.")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Operator role required.")
    return principal


def _allow_http_request(
    buckets: dict[str, list[float]],
    client_key: str,
    limit_per_minute: int,
    now: float,
) -> bool:
    window_start = now - 60.0
    recent_requests = [timestamp for timestamp in buckets.get(client_key, []) if timestamp >= window_start]
    if len(recent_requests) >= limit_per_minute:
        buckets[client_key] = recent_requests
        return False

    recent_requests.append(now)
    buckets[client_key] = recent_requests
    return True
