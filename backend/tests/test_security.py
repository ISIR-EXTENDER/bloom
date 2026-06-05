from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from pydantic import ValidationError

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings, get_settings
from libs.config import InMemoryConfigurationRepository


def make_secure_client() -> TestClient:
    return TestClient(
        create_app(
            Settings(
                admin_api_key="admin-secret",
                auth_enabled=True,
                environment="test",
                http_rate_limit_per_minute=0,
                operator_api_key="operator-secret",
            ),
            InMemoryConfigurationRepository(),
        )
    )


def test_health_remains_available_without_api_key_when_auth_is_enabled() -> None:
    client = make_secure_client()

    response = client.get("/api/v1/health")

    assert response.status_code == 200


def test_authenticated_reads_accept_operator_key() -> None:
    client = make_secure_client()

    response = client.get("/api/v1/configurations", headers={"X-Bloom-API-Key": "operator-secret"})

    assert response.status_code == 200


def test_authenticated_reads_reject_missing_key() -> None:
    client = make_secure_client()

    response = client.get("/api/v1/configurations")

    assert response.status_code == 401
    assert response.json() == {"detail": "Valid Bloom API key required."}


def test_configuration_writes_require_admin_key() -> None:
    client = make_secure_client()

    response = client.delete("/api/v1/configurations/sandbox", headers={"X-Bloom-API-Key": "operator-secret"})

    assert response.status_code == 403
    assert response.json() == {"detail": "Admin role required."}


def test_runtime_websocket_requires_operator_key_when_auth_is_enabled() -> None:
    client = make_secure_client()

    with client.websocket_connect("/api/v1/runtime/ws?api_key=operator-secret") as websocket:
        connected = websocket.receive_json()

    assert connected["type"] == "session_connected"


def test_runtime_websocket_rejects_missing_key_when_auth_is_enabled() -> None:
    client = make_secure_client()

    try:
        with client.websocket_connect("/api/v1/runtime/ws"):
            raise AssertionError("websocket should not connect without an API key")
    except WebSocketDisconnect as exc:
        assert exc.code == 1008


def test_cors_preflight_uses_configured_origins() -> None:
    client = TestClient(
        create_app(
            Settings(
                cors_allowed_origins=("http://tablet.local:5173",),
                environment="test",
                http_rate_limit_per_minute=0,
            ),
            InMemoryConfigurationRepository(),
        )
    )

    response = client.options(
        "/api/v1/health",
        headers={
            "Access-Control-Request-Method": "GET",
            "Origin": "http://tablet.local:5173",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://tablet.local:5173"


def test_global_http_rate_limit_rejects_excess_requests() -> None:
    client = TestClient(
        create_app(
            Settings(environment="test", http_rate_limit_per_minute=1),
            InMemoryConfigurationRepository(),
        )
    )

    assert client.get("/api/v1/health").status_code == 200
    response = client.get("/api/v1/health")

    assert response.status_code == 429
    assert response.json() == {"detail": "Too many requests."}


def test_production_settings_require_authentication() -> None:
    try:
        Settings(environment="production")
    except ValidationError as exc:
        assert "production Bloom API requires auth_enabled=true and an admin_api_key" in str(exc)
    else:
        raise AssertionError("production settings should require authentication")


def test_settings_can_be_loaded_from_environment(monkeypatch) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("BLOOM_AUTH_ENABLED", "true")
    monkeypatch.setenv("BLOOM_ADMIN_API_KEY", "admin-from-env")
    monkeypatch.setenv("BLOOM_CORS_ALLOWED_ORIGINS", "http://tablet.local:5173,http://desktop.local:5173")
    monkeypatch.setenv("BLOOM_ENVIRONMENT", "staging")
    monkeypatch.setenv("BLOOM_HTTP_RATE_LIMIT_PER_MINUTE", "120")

    settings = get_settings()

    assert settings.auth_enabled is True
    assert settings.admin_api_key == "admin-from-env"
    assert settings.cors_allowed_origins == ("http://tablet.local:5173", "http://desktop.local:5173")
    assert settings.environment == "staging"
    assert settings.http_rate_limit_per_minute == 120
