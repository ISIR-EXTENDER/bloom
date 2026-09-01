from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository

JOINTS = ["joint_1", "joint_2", "joint_3", "joint_4", "joint_5", "joint_6"]
HOME = [2.5, 0.3, -2.4, 2.97, 1.2, -0.5]
BOIRE = [1.0, -0.2, 0.5, 1.5, -1.0, 0.25]


def make_client() -> TestClient:
    return TestClient(create_app(Settings(environment="test"), InMemoryConfigurationRepository()))


def save(client: TestClient, name: str, positions):
    return client.post(
        "/api/v1/runtime/positions",
        json={"name": name, "joint_names": JOINTS, "positions": positions},
    )


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
