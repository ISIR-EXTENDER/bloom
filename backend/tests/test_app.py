from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app, create_app_configuration_repository
from apps.bloom_api.settings import Settings
from libs.config import FileConfigurationRepository, InMemoryConfigurationRepository, SQLiteConfigurationRepository
from libs.sessions import RuntimeSessionManager


def test_create_app_stores_settings() -> None:
    settings = Settings(environment="test", app_name="Bloom Test API")
    repository = InMemoryConfigurationRepository()
    app = create_app(settings, repository)

    assert app.title == "Bloom Test API"
    assert app.state.settings == settings
    assert app.state.configuration_repository == repository
    assert isinstance(app.state.runtime_session_manager, RuntimeSessionManager)


def test_openapi_schema_is_available(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert schema["info"]["title"] == "Bloom API"
    assert "/api/v1/health" in schema["paths"]
    assert "/api/v1/configurations" in schema["paths"]


def test_create_app_adds_minimal_security_headers(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"


def test_create_app_uses_file_repository_by_default(test_settings: Settings, tmp_path) -> None:
    settings = test_settings.model_copy(update={"configuration_dir": tmp_path})
    app = create_app(settings)

    assert isinstance(app.state.configuration_repository, FileConfigurationRepository)
    assert app.state.configuration_repository.root_dir == tmp_path


def test_create_app_can_use_sqlite_repository(test_settings: Settings, tmp_path) -> None:
    database_path = tmp_path / "bloom.db"
    settings = test_settings.model_copy(
        update={
            "configuration_database_path": database_path,
            "configuration_storage": "sqlite",
        }
    )
    app = create_app(settings)

    assert isinstance(app.state.configuration_repository, SQLiteConfigurationRepository)
    assert app.state.configuration_repository.database_path == database_path


def test_configuration_repository_factory_keeps_file_storage_as_fallback(test_settings: Settings, tmp_path) -> None:
    settings = test_settings.model_copy(update={"configuration_dir": tmp_path, "configuration_storage": "file"})
    repository = create_app_configuration_repository(settings)

    assert isinstance(repository, FileConfigurationRepository)
