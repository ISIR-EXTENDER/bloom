"""Saved poses carry names the manager can reach and values it can move to."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.routes import runtime_positions
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.sessions.positions import PositionLibrary

JOINTS = ["joint_1", "joint_2", "joint_3"]
URL = "/api/v1/runtime/positions"


def make_client() -> TestClient:
    return TestClient(create_app(Settings(environment="test"), InMemoryConfigurationRepository()))


@pytest.mark.parametrize("name", ["home", "pose_1", "boire2"])
def test_manager_style_names_are_accepted(name: str) -> None:
    response = make_client().post(URL, json={"name": name, "joint_names": JOINTS, "positions": [0.0, 0.1, 0.2]})
    assert response.status_code == 200
    assert response.json()["name"] == name


def test_a_dashed_capture_name_is_stored_the_way_the_manager_will_ask_for_it() -> None:
    response = make_client().post(URL, json={"name": "Pose-1", "joint_names": JOINTS, "positions": [0.0, 0.1, 0.2]})
    assert response.status_code == 200
    assert response.json()["name"] == "pose_1"


@pytest.mark.parametrize("name", ["pick up", "../etc", "a/b", "x" * 65, "héros"])
def test_unreachable_names_are_refused(name: str) -> None:
    response = make_client().post(URL, json={"name": name, "joint_names": JOINTS, "positions": [0.0, 0.1, 0.2]})
    assert response.status_code == 422


def test_bad_joint_names_are_refused() -> None:
    response = make_client().post(
        URL, json={"name": "home", "joint_names": ["joint 1", "joint_2", "joint_3"], "positions": [0.0, 0.1, 0.2]}
    )
    assert response.status_code == 422


@pytest.mark.parametrize("value", ["NaN", "Infinity", "-Infinity"])
def test_non_finite_positions_are_refused(value: str) -> None:
    body = f'{{"name": "home", "joint_names": ["joint_1", "joint_2"], "positions": [0.0, {value}]}}'
    response = make_client().post(URL, content=body, headers={"Content-Type": "application/json"})
    assert response.status_code == 422


def test_two_first_saves_at_once_keep_both_poses(monkeypatch: pytest.MonkeyPatch) -> None:
    client = make_client()
    barrier = Barrier(2)
    real = runtime_positions.library_backed_by

    def slow_library(*args) -> PositionLibrary:
        # Both requests reach creation together; without the lock each builds its own library.
        try:
            barrier.wait(0.5)
        except Exception:  # noqa: BLE001
            pass
        return real(*args)

    monkeypatch.setattr(runtime_positions, "library_backed_by", slow_library)
    with ThreadPoolExecutor(2) as pool:
        results = list(
            pool.map(
                lambda name: (
                    client.post(
                        URL, json={"name": name, "joint_names": JOINTS, "positions": [0.0, 0.1, 0.2]}
                    ).status_code
                ),
                ["first", "second"],
            )
        )
    assert results == [200, 200]
    assert sorted(item["name"] for item in client.get(URL).json()["positions"]) == ["first", "second"]


def test_urdf_joint_names_with_case_and_hyphens_are_kept() -> None:
    joints = ["joint-tool", "Joint_2", "joint_3"]
    response = make_client().post(URL, json={"name": "home", "joint_names": joints, "positions": [0.0, 0.1, 0.2]})

    assert response.status_code == 200
    assert response.json()["joint_names"] == joints
