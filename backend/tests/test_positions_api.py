from pathlib import Path

from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository, load_configuration_file

JOINTS = ["joint_1", "joint_2", "joint_3", "joint_4", "joint_5", "joint_6"]
HOME = [2.5, 0.3, -2.4, 2.97, 1.2, -0.5]
BOIRE = [1.0, -0.2, 0.5, 1.5, -1.0, 0.25]
MANAGER_APPS = ("explorer-manager", "kinova-manager")


SEED_DIR = Path(__file__).parents[1] / "seed" / "applications"


def make_client() -> TestClient:
    repository = InMemoryConfigurationRepository(
        {config_id: load_configuration_file(SEED_DIR / f"{config_id}.json") for config_id in MANAGER_APPS}
    )
    return TestClient(create_app(Settings(environment="test"), repository))


def save(client: TestClient, name: str, positions, params: dict[str, str] | None = None):
    return client.post(
        "/api/v1/runtime/positions",
        json={"name": name, "joint_names": JOINTS, "positions": positions},
        params=params,
    )


def test_each_application_keeps_its_own_positions() -> None:
    # A pose is a joint vector in one arm's joint order. Shared across apps,
    # an Explorer pose would land in a Kinova export as different angles.
    client = make_client()
    explorer = {"config_id": "explorer-manager", "app_id": "explorer-manager"}
    kinova = {"config_id": "kinova-manager", "app_id": "kinova-manager"}

    assert save(client, "home", HOME, explorer).status_code == 200

    kinova_positions = client.get("/api/v1/runtime/positions", params=kinova).json()["positions"]
    assert kinova_positions == []

    explorer_positions = client.get("/api/v1/runtime/positions", params=explorer).json()["positions"]
    assert [item["name"] for item in explorer_positions] == ["home"]

    # Nothing to export for an app that saved nothing, rather than Explorer's
    # poses rendered into Kinova's params block.
    assert client.get("/api/v1/runtime/positions/export", params=kinova).status_code == 422
    assert client.get("/api/v1/runtime/positions/export", params=explorer).json()["target_names"] == ["home"]


def test_saves_and_lists_positions() -> None:
    client = make_client()

    assert save(client, "home", HOME).status_code == 200
    assert save(client, "boire", BOIRE).status_code == 200

    listed = client.get("/api/v1/runtime/positions").json()["positions"]
    assert [item["name"] for item in listed] == ["home", "boire"]
    assert listed[0]["positions"] == HOME


def test_saving_the_same_name_replaces_it_in_place() -> None:
    client = make_client()
    save(client, "home", HOME)
    save(client, "boire", BOIRE)
    save(client, "home", [9.0] * 6)

    listed = client.get("/api/v1/runtime/positions").json()["positions"]
    # order preserved, no duplicate target name for the manager to reject
    assert [item["name"] for item in listed] == ["home", "boire"]
    assert listed[0]["positions"] == [9.0] * 6


def test_rejects_a_length_mismatch() -> None:
    client = make_client()

    response = client.post(
        "/api/v1/runtime/positions",
        json={"name": "bad", "joint_names": JOINTS, "positions": [1.0, 2.0]},
    )

    assert response.status_code == 422
    assert "values for" in response.json()["detail"]


def test_exports_the_manager_block() -> None:
    client = make_client()
    save(client, "home", HOME)
    save(client, "boire", BOIRE)

    body = client.get("/api/v1/runtime/positions/export").json()

    assert body["target_names"] == ["home", "boire"]
    block = body["yaml"]
    assert "joint_targets:" in block
    assert "- home" in block and "- boire" in block
    assert "# home" in block and "# boire" in block
    # flattening invariant the manager enforces
    assert block.count("          - ") == len(JOINTS) + 2 + len(JOINTS) * 2


def test_export_refuses_an_empty_library() -> None:
    client = make_client()

    response = client.get("/api/v1/runtime/positions/export")

    assert response.status_code == 422
    assert "no saved positions" in response.json()["detail"]


def test_delete_removes_a_position() -> None:
    client = make_client()
    save(client, "home", HOME)
    save(client, "boire", BOIRE)

    remaining = client.delete("/api/v1/runtime/positions/home").json()["positions"]

    assert [item["name"] for item in remaining] == ["boire"]
    assert client.delete("/api/v1/runtime/positions/home").status_code == 404


def test_reading_an_unknown_application_creates_nothing() -> None:
    client = make_client()

    for index in range(50):
        params = {"config_id": f"made-up-{index}", "app_id": "x" * 200}
        assert client.get("/api/v1/runtime/positions", params=params).json()["positions"] == []
        assert client.get("/api/v1/runtime/positions/export", params=params).status_code == 422

    assert getattr(client.app.state, "position_libraries", {}) == {}


def test_saving_to_an_unknown_application_is_refused() -> None:
    client = make_client()

    unknown_config = save(client, "home", HOME, {"config_id": "made-up", "app_id": "explorer-manager"})
    unknown_app = save(client, "home", HOME, {"config_id": "explorer-manager", "app_id": "made-up"})

    assert (unknown_config.status_code, unknown_app.status_code) == (404, 404)
