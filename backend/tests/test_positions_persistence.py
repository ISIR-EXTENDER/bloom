"""Saved poses outlive the API process when a store is attached."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository, load_configuration_file
from libs.sessions.positions import SQLitePositionStore

SEED_DIR = Path(__file__).parents[1] / "seed" / "applications"
JOINTS = ["joint_1", "joint_2", "joint_3", "joint_4", "joint_5", "joint_6"]
SCOPE = {"config_id": "explorer-manager", "app_id": "explorer-manager"}


def make_client(store: SQLitePositionStore) -> TestClient:
    repository = InMemoryConfigurationRepository(
        {"explorer-manager": load_configuration_file(SEED_DIR / "explorer-manager.json")}
    )
    return TestClient(create_app(Settings(environment="test"), repository, position_store=store))


def test_poses_survive_a_restart_and_keep_their_order(tmp_path: Path) -> None:
    store = SQLitePositionStore(tmp_path / "bloom.db")
    first = make_client(store)
    assert (
        first.post(
            "/api/v1/runtime/positions",
            json={"name": "home", "joint_names": JOINTS, "positions": [0.0] * 6},
            params=SCOPE,
        ).status_code
        == 200
    )
    assert (
        first.post(
            "/api/v1/runtime/positions",
            json={"name": "reach", "joint_names": JOINTS, "positions": [0.5] * 6},
            params=SCOPE,
        ).status_code
        == 200
    )

    # A new app over the same database is what an API restart looks like.
    second = make_client(SQLitePositionStore(tmp_path / "bloom.db"))
    names = [pose["name"] for pose in second.get("/api/v1/runtime/positions", params=SCOPE).json()["positions"]]
    assert names == ["home", "reach"]

    assert second.delete("/api/v1/runtime/positions/home", params=SCOPE).status_code == 200
    third = make_client(SQLitePositionStore(tmp_path / "bloom.db"))
    names = [pose["name"] for pose in third.get("/api/v1/runtime/positions", params=SCOPE).json()["positions"]]
    assert names == ["reach"]


def test_libraries_stay_per_application_in_the_store(tmp_path: Path) -> None:
    store = SQLitePositionStore(tmp_path / "bloom.db")
    client = make_client(store)
    assert (
        client.post(
            "/api/v1/runtime/positions",
            json={"name": "home", "joint_names": JOINTS, "positions": [0.0] * 6},
            params=SCOPE,
        ).status_code
        == 200
    )

    assert store.load("explorer-manager", "explorer-manager")[0].name == "home"
    assert store.load("kinova-manager", "kinova-manager") == []


def test_without_a_store_poses_stay_in_memory() -> None:
    repository = InMemoryConfigurationRepository(
        {"explorer-manager": load_configuration_file(SEED_DIR / "explorer-manager.json")}
    )
    app = create_app(Settings(environment="test"), repository)
    assert app.state.position_store is None
