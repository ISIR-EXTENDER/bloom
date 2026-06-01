from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository


def test_create_app_stores_settings() -> None:
    settings = Settings(environment="test", app_name="Bloom Test API")
    repository = InMemoryConfigurationRepository()
    app = create_app(settings, repository)

    assert app.title == "Bloom Test API"
    assert app.state.settings == settings
    assert app.state.configuration_repository == repository


def test_openapi_schema_is_available(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert schema["info"]["title"] == "Bloom API"
    assert "/api/v1/health" in schema["paths"]
    assert "/api/v1/configurations" in schema["paths"]
