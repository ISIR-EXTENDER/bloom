import json
from pathlib import Path

from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import ApplicationConfig, ConfigurationBundle, ConfigurationMetadata, FileConfigurationRepository, load_legacy_screen_file

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
