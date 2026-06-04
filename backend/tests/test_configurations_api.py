import base64
import json
from pathlib import Path

from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import (
    ApplicationConfig,
    CanvasSettings,
    ConfigurationBundle,
    ConfigurationMetadata,
    FileConfigurationRepository,
    ScreenConfig,
    SQLiteConfigurationRepository,
    load_legacy_screen_file,
)
from libs.db.sqlite import sqlite_connection

SHARED_FIXTURE_PATH = Path(__file__).parents[2] / "tests" / "fixtures" / "configuration-bundle.json"
LEGACY_FIXTURE_DIR = Path(__file__).parent / "fixtures" / "legacy"


def test_list_configurations(client: TestClient) -> None:
    response = client.get("/api/v1/configurations")

    assert response.status_code == 200
    assert response.json() == {"configuration_ids": ["sandbox"]}


def test_get_configuration(client: TestClient) -> None:
    response = client.get("/api/v1/configurations/sandbox")

    assert response.status_code == 200
    payload = response.json()
    assert payload["metadata"]["source"] == "shared-contract-fixture"
    assert payload["applications"][0]["id"] == "sandbox"


def test_get_configuration_matches_shared_contract_fixture(client: TestClient) -> None:
    response = client.get("/api/v1/configurations/sandbox")

    assert response.status_code == 200
    assert response.json() == json.loads(SHARED_FIXTURE_PATH.read_text(encoding="utf-8"))


def test_get_missing_configuration_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/configurations/missing")

    assert response.status_code == 404
    assert response.json() == {"detail": "configuration not found"}


def test_put_configuration(client: TestClient, sample_configuration_bundle: ConfigurationBundle) -> None:
    payload = sample_configuration_bundle.model_dump(mode="json")
    payload["metadata"]["source"] = "api-test"

    response = client.put("/api/v1/configurations/api-created", json=payload)

    assert response.status_code == 200
    assert response.json()["metadata"]["source"] == "api-test"
    assert client.get("/api/v1/configurations").json() == {"configuration_ids": ["api-created", "sandbox"]}


def test_list_configuration_applications(client: TestClient) -> None:
    response = client.get("/api/v1/configurations/sandbox/applications")

    assert response.status_code == 200
    assert response.json()["applications"][0]["id"] == "sandbox"


def test_put_configuration_application_creates_app(client: TestClient) -> None:
    application = ApplicationConfig(
        id="diagnostics",
        name="Diagnostics",
        description="Reusable diagnostics app",
        screens=(ScreenConfig(id="debug", title="Debug"),),
    )

    response = client.put(
        "/api/v1/configurations/sandbox/applications/diagnostics",
        json=application.model_dump(mode="json"),
    )

    assert response.status_code == 200
    assert response.json()["applications"][1]["id"] == "diagnostics"


def test_put_configuration_application_rejects_path_mismatch(client: TestClient) -> None:
    application = ApplicationConfig(id="actual", name="Actual")

    response = client.put(
        "/api/v1/configurations/sandbox/applications/expected",
        json=application.model_dump(mode="json"),
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "application id does not match path"}


def test_delete_configuration_application(client: TestClient) -> None:
    response = client.delete("/api/v1/configurations/sandbox/applications/sandbox")

    assert response.status_code == 204
    assert client.get("/api/v1/configurations/sandbox").json()["applications"] == []


def test_delete_missing_configuration_application_returns_404(client: TestClient) -> None:
    response = client.delete("/api/v1/configurations/sandbox/applications/missing")

    assert response.status_code == 404
    assert response.json() == {"detail": "application not found"}


def test_list_configuration_reusable_screens(client: TestClient) -> None:
    response = client.get("/api/v1/configurations/sandbox/screens")

    assert response.status_code == 200
    assert response.json()["screens"] == [
        {
            "screen": client.get("/api/v1/configurations/sandbox").json()["applications"][0]["screens"][0],
            "source_application_id": "sandbox",
            "source_application_name": "Sandbox",
        }
    ]


def test_put_configuration_screen_adds_screen(client: TestClient) -> None:
    screen = ScreenConfig(
        id="diagnostics",
        title="Diagnostics",
        canvas=CanvasSettings(preset_id="tablet"),
    )

    response = client.put(
        "/api/v1/configurations/sandbox/applications/sandbox/screens/diagnostics",
        json=screen.model_dump(mode="json"),
    )

    assert response.status_code == 200
    screen_ids = [screen_payload["id"] for screen_payload in response.json()["applications"][0]["screens"]]
    assert screen_ids == ["main", "diagnostics"]


def test_put_configuration_screen_rejects_path_mismatch(client: TestClient) -> None:
    screen = ScreenConfig(id="actual", title="Actual")

    response = client.put(
        "/api/v1/configurations/sandbox/applications/sandbox/screens/expected",
        json=screen.model_dump(mode="json"),
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "screen id does not match path"}


def test_put_configuration_screen_missing_application_returns_404(client: TestClient) -> None:
    screen = ScreenConfig(id="diagnostics", title="Diagnostics")

    response = client.put(
        "/api/v1/configurations/sandbox/applications/missing/screens/diagnostics",
        json=screen.model_dump(mode="json"),
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "application not found"}


def test_delete_configuration_screen_keeps_at_least_one_screen(client: TestClient) -> None:
    response = client.delete("/api/v1/configurations/sandbox/applications/sandbox/screens/main")

    assert response.status_code == 400
    assert "must keep at least one screen" in response.json()["detail"]


def test_put_invalid_configuration_returns_422(client: TestClient) -> None:
    response = client.put("/api/v1/configurations/bad", json={"applications": [{"id": "", "name": ""}]})

    assert response.status_code == 422


def test_delete_configuration(client: TestClient) -> None:
    response = client.delete("/api/v1/configurations/sandbox")

    assert response.status_code == 204
    assert client.get("/api/v1/configurations").json() == {"configuration_ids": []}


def test_delete_missing_configuration_returns_404(client: TestClient) -> None:
    response = client.delete("/api/v1/configurations/missing")

    assert response.status_code == 404
    assert response.json() == {"detail": "configuration not found"}


def test_configuration_api_can_use_file_repository(tmp_path, sample_configuration_bundle: ConfigurationBundle) -> None:
    repository = FileConfigurationRepository(tmp_path)
    client = TestClient(create_app(Settings(environment="test", configuration_dir=tmp_path), repository))

    response = client.put("/api/v1/configurations/persisted", json=sample_configuration_bundle.model_dump(mode="json"))

    assert response.status_code == 200
    assert (tmp_path / "persisted.json").exists()
    assert client.get("/api/v1/configurations/persisted").json()["metadata"]["source"] == "shared-contract-fixture"


def test_configuration_api_persists_with_sqlite_between_app_instances(
    tmp_path,
    sample_configuration_bundle: ConfigurationBundle,
) -> None:
    database_path = tmp_path / "bloom.db"
    settings = Settings(
        environment="test",
        configuration_database_path=database_path,
        configuration_storage="sqlite",
    )
    first_client = TestClient(create_app(settings))

    put_response = first_client.put(
        "/api/v1/configurations/persisted",
        json=sample_configuration_bundle.model_dump(mode="json"),
    )
    second_client = TestClient(create_app(settings))
    get_response = second_client.get("/api/v1/configurations/persisted")

    assert put_response.status_code == 200
    assert get_response.status_code == 200
    assert get_response.json()["metadata"]["source"] == "shared-contract-fixture"
    assert SQLiteConfigurationRepository(database_path).list_ids() == ["persisted"]


def test_theme_asset_upload_stores_and_serves_image(tmp_path, sample_configuration_bundle: ConfigurationBundle) -> None:
    database_path = tmp_path / "bloom.db"
    settings = Settings(
        environment="test",
        configuration_database_path=database_path,
        configuration_storage="sqlite",
        theme_asset_dir=tmp_path / "theme-assets",
    )
    client = TestClient(create_app(settings))
    client.put("/api/v1/configurations/sandbox", json=sample_configuration_bundle.model_dump(mode="json"))

    response = client.post(
        "/api/v1/configurations/sandbox/theme-assets",
        json={
            "filename": "Mood Board.png",
            "content_type": "image/png",
            "content_base64": base64.b64encode(b"fake png bytes").decode("ascii"),
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["content_type"] == "image/png"
    assert payload["byte_size"] == len(b"fake png bytes")
    assert payload["uri"].startswith("/api/v1/configurations/sandbox/theme-assets/sandbox-mood-board-")
    assert client.get(payload["uri"]).content == b"fake png bytes"

    with sqlite_connection(database_path) as connection:
        row = connection.execute("SELECT uri, content_type, byte_size FROM theme_assets").fetchone()

    assert row["uri"] == payload["uri"]
    assert row["content_type"] == "image/png"
    assert row["byte_size"] == len(b"fake png bytes")


def test_theme_asset_upload_rejects_unsupported_type(
    tmp_path,
    sample_configuration_bundle: ConfigurationBundle,
) -> None:
    client = TestClient(
        create_app(Settings(environment="test", configuration_dir=tmp_path / "configurations", theme_asset_dir=tmp_path))
    )
    client.put("/api/v1/configurations/sandbox", json=sample_configuration_bundle.model_dump(mode="json"))

    response = client.post(
        "/api/v1/configurations/sandbox/theme-assets",
        json={
            "filename": "notes.txt",
            "content_type": "text/plain",
            "content_base64": base64.b64encode(b"not an image").decode("ascii"),
        },
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "unsupported theme asset type"}


def test_application_endpoint_persists_with_sqlite_between_app_instances(
    tmp_path,
    sample_configuration_bundle: ConfigurationBundle,
) -> None:
    database_path = tmp_path / "bloom.db"
    settings = Settings(
        environment="test",
        configuration_database_path=database_path,
        configuration_storage="sqlite",
    )
    first_client = TestClient(create_app(settings))
    first_client.put("/api/v1/configurations/sandbox", json=sample_configuration_bundle.model_dump(mode="json"))
    application = ApplicationConfig(
        id="diagnostics",
        name="Diagnostics",
        screens=(ScreenConfig(id="debug", title="Debug"),),
    )

    put_response = first_client.put(
        "/api/v1/configurations/sandbox/applications/diagnostics",
        json=application.model_dump(mode="json"),
    )
    second_client = TestClient(create_app(settings))
    get_response = second_client.get("/api/v1/configurations/sandbox")

    assert put_response.status_code == 200
    assert get_response.status_code == 200
    assert [app["id"] for app in get_response.json()["applications"]] == ["sandbox", "diagnostics"]


def test_configuration_api_round_trips_real_legacy_screen_fixture(tmp_path) -> None:
    repository = FileConfigurationRepository(tmp_path)
    client = TestClient(create_app(Settings(environment="test", configuration_dir=tmp_path), repository))
    legacy_screen = load_legacy_screen_file(LEGACY_FIXTURE_DIR / "sandbox_control.json")
    bundle = ConfigurationBundle(
        metadata=ConfigurationMetadata(source="legacy-api-fixture"),
        applications=(
            ApplicationConfig(
                id="sandbox",
                name="Sandbox",
                screens=(legacy_screen,),
            ),
        ),
    )

    put_response = client.put("/api/v1/configurations/legacy-sandbox", json=bundle.model_dump(mode="json"))
    get_response = client.get("/api/v1/configurations/legacy-sandbox")

    assert put_response.status_code == 200
    assert get_response.status_code == 200
    payload = get_response.json()
    assert payload["metadata"]["source"] == "legacy-api-fixture"
    assert payload["applications"][0]["screens"][0]["id"] == "sandbox_control"
    assert len(payload["applications"][0]["screens"][0]["widgets"]) == 12
    assert (tmp_path / "legacy-sandbox.json").exists()
