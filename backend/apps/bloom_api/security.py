import logging
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from hmac import compare_digest
from time import monotonic
from typing import TypeVar
from urllib.parse import unquote

from fastapi import FastAPI, HTTPException, Request, WebSocket, status
from starlette.responses import JSONResponse, Response

from libs.sessions import RuntimeControlNotOwnedError

SECURITY_HEADERS = {
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
}

API_KEY_HEADER = "x-bloom-api-key"
# Browsers cannot set headers on a WebSocket handshake but can offer subprotocols,
# which, unlike the query string, never reach the access log.
RUNTIME_WEBSOCKET_SUBPROTOCOL = "bloom.runtime.v1"
API_KEY_SUBPROTOCOL_PREFIX = "bloom.api-key."
# Any spelling the query parser decodes to api_key: api%5Fkey=, API_KEY=, api_key%3D.
_QUERY_PAIR = re.compile(r"(?P<key>[^?&=/\s\"]+)(?P<sep>=|%3[dD])(?P<value>[^&\s\"]*)")
RUNTIME_SESSION_HEADER = "x-bloom-runtime-session"
#: Addresses kept before idle ones are swept. A lab has a handful of tablets;
#: past this the buckets are a spoofed-address memory leak, not traffic.
MAX_RATE_LIMIT_CLIENTS = 1024
T = TypeVar("T")


@dataclass(frozen=True)
class BloomPrincipal:
    role: str

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def is_operator(self) -> bool:
        return self.role in {"admin", "operator"}

    @property
    def is_observer(self) -> bool:
        """May read runtime state. Every commanding role can also watch."""
        return self.role in {"admin", "operator", "observer"}


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
        # Engaging STOP is never refused for being one request too many: a
        # stuck client, or several kiosks behind one address, would otherwise
        # spend the budget that the stop needs.
        if request.method == "POST" and request.url.path == f"{settings.api_prefix}/runtime/stop":
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


def _keys_match(presented: str, expected: str) -> bool:
    """Compare as bytes.

    Starlette decodes a header as latin-1, so a raw non-ASCII byte arrives as a character that makes
    compare_digest raise TypeError rather than answer. A guard that should say 401 raised a 500
    instead, and on the websocket the raise was not an HTTPException, so the socket was never closed
    with its policy-violation reason.
    """
    return compare_digest(presented.encode("utf-8", "surrogateescape"), expected.encode("utf-8"))


def authenticate_api_key(settings, api_key: str | None) -> BloomPrincipal:
    if not settings.auth_enabled:
        return BloomPrincipal(role="admin")

    if api_key and settings.admin_api_key and _keys_match(api_key, settings.admin_api_key):
        return BloomPrincipal(role="admin")

    if api_key and settings.operator_api_key and _keys_match(api_key, settings.operator_api_key):
        return BloomPrincipal(role="operator")

    if api_key and settings.observer_api_key and _keys_match(api_key, settings.observer_api_key):
        return BloomPrincipal(role="observer")

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


async def require_operator_on_loop(request: Request) -> BloomPrincipal:
    """The same check without a worker thread, for STOP, which must not wait for one."""
    return require_operator(request)


def require_observer(request: Request) -> BloomPrincipal:
    """Guard a read-only runtime surface.

    A supervisor mirror authenticates with a key that cannot command the arm,
    so watching a session never requires a credential that could take it over.
    """
    principal = authenticate_api_key(request.app.state.settings, request.headers.get(API_KEY_HEADER))
    if not principal.is_observer:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Observer role required.")
    return principal


async def require_observer_on_loop(request: Request) -> BloomPrincipal:
    return require_observer(request)


def require_runtime_owner(request: Request) -> BloomPrincipal:
    principal = require_operator(request)
    if not request.app.state.settings.runtime_control_required:
        return principal

    session_id = request.headers.get(RUNTIME_SESSION_HEADER, "").strip()
    if not request.app.state.runtime_session_manager.is_control_owner(session_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This runtime session does not own robot control.",
        )
    return principal


def execute_as_runtime_owner(request: Request, operation: Callable[[], T]) -> T:
    """Run the final robot operation inside the lease handover gate."""
    if not request.app.state.settings.runtime_control_required:
        return operation()

    session_id = request.headers.get(RUNTIME_SESSION_HEADER, "").strip()
    try:
        return request.app.state.runtime_session_manager.execute_if_control_owner(session_id, operation)
    except RuntimeControlNotOwnedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


def require_admin(request: Request) -> BloomPrincipal:
    principal = authenticate_api_key(request.app.state.settings, request.headers.get(API_KEY_HEADER))
    if not principal.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required.")
    return principal


async def require_runtime_websocket_principal(websocket: WebSocket) -> BloomPrincipal:
    """Admit anyone who may watch; the payload handler refuses their commands.

    An observer needs the socket for live status and topic samples, which is
    the whole point of the mirror, so the role is enforced per message rather
    than at the handshake.
    """
    settings = websocket.app.state.settings
    # CORS never applies to a WebSocket handshake, so without this any page
    # open in a browser that can reach the API could claim control and drive.
    # Clients that send no Origin are not browsers a page can steer.
    origin = websocket.headers.get("origin")
    if origin is not None and not is_allowed_origin(settings, origin):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Origin not allowed.")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Origin not allowed.")

    api_key = (
        websocket.headers.get(API_KEY_HEADER)
        or next(
            (
                protocol.removeprefix(API_KEY_SUBPROTOCOL_PREFIX)
                for protocol in websocket.scope.get("subprotocols", [])
                if protocol.startswith(API_KEY_SUBPROTOCOL_PREFIX)
            ),
            None,
        )
        or websocket.query_params.get("api_key")
    )
    try:
        principal = authenticate_api_key(settings, api_key)
    except HTTPException as exc:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason=str(exc.detail))
        raise

    if not principal.is_observer:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Observer role required.")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Observer role required.")
    return principal


def select_runtime_websocket_subprotocol(websocket: WebSocket) -> str | None:
    """A client that offered subprotocols fails the handshake unless one is chosen."""
    offered = websocket.scope.get("subprotocols", [])
    return RUNTIME_WEBSOCKET_SUBPROTOCOL if RUNTIME_WEBSOCKET_SUBPROTOCOL in offered else None


class ApiKeyLogRedaction(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple):
            record.args = tuple(redact_api_key(arg) if isinstance(arg, str) else arg for arg in record.args)
        return True


def redact_api_key(text: str) -> str:
    return _QUERY_PAIR.sub(_redact_api_key_pair, text)


def _redact_api_key_pair(match: re.Match[str]) -> str:
    if unquote(match["key"]).lower() != "api_key":
        return match.group(0)
    return f"{match['key']}{match['sep']}***"


def install_api_key_log_redaction() -> None:
    """Uvicorn logs each request path with its query, where a fallback key sits."""
    for name in ("uvicorn.access", "uvicorn.error"):
        logger = logging.getLogger(name)
        if not any(isinstance(existing, ApiKeyLogRedaction) for existing in logger.filters):
            logger.addFilter(ApiKeyLogRedaction())


def is_allowed_origin(settings, origin: str) -> bool:
    allowed = settings.cors_allowed_origins
    return "*" in allowed or origin.rstrip("/") in {entry.rstrip("/") for entry in allowed}


def _allow_http_request(
    buckets: dict[str, list[float]],
    client_key: str,
    limit_per_minute: int,
    now: float,
) -> bool:
    window_start = now - 60.0
    if len(buckets) >= MAX_RATE_LIMIT_CLIENTS:
        _forget_idle_clients(buckets, window_start)
    recent_requests = [timestamp for timestamp in buckets.get(client_key, []) if timestamp >= window_start]
    if len(recent_requests) >= limit_per_minute:
        buckets[client_key] = recent_requests
        return False

    recent_requests.append(now)
    buckets[client_key] = recent_requests
    return True


def _forget_idle_clients(buckets: dict[str, list[float]], window_start: float) -> None:
    """A client with nothing left in its window counts the same as a new one."""
    for client_key in [key for key, timestamps in buckets.items() if not timestamps or timestamps[-1] < window_start]:
        del buckets[client_key]
