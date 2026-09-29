"""What a stray env var, a crafted name or another account on the lab machine cannot do."""

from __future__ import annotations

import os
import stat
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import PRODUCTION_EXPLICIT_ALLOWLISTS, Settings
from libs.config import InMemoryConfigurationRepository, InvalidConfigurationIdError
from libs.config.seed import publish_configuration, restore_shipped_configuration
from libs.db.sqlite import sqlite_connection
from libs.ros_adapters.robot_model import resolve_package_asset

STRONG_KEY = "a" * 32


def make_client(**settings: object) -> TestClient:
    return TestClient(create_app(Settings(environment="test", **settings), InMemoryConfigurationRepository()))


# ------------------------------------------------------------------ environment


@pytest.mark.parametrize("value", ["enabled", "y", "t", "2", "yes please"])
def test_a_misspelt_boolean_env_var_refuses_to_start(monkeypatch, value: str) -> None:
    # BLOOM_AUTH_ENABLED=enabled used to read as false and start an open API.
    monkeypatch.setenv("BLOOM_AUTH_ENABLED", value)

    with pytest.raises(ValueError, match="BLOOM_AUTH_ENABLED"):
        Settings.from_environment()


@pytest.mark.parametrize(
    ("value", "expected"),
    [("TRUE", True), (" on ", True), ("1", True), ("0", False), ("off", False), ("no", False), ("", False)],
)
def test_boolean_env_vars_accept_the_usual_spellings(monkeypatch, value: str, expected: bool) -> None:
    monkeypatch.setenv("BLOOM_AUTH_ENABLED", value)

    assert Settings.from_environment().auth_enabled is expected


@pytest.mark.parametrize("name", PRODUCTION_EXPLICIT_ALLOWLISTS)
def test_production_refuses_a_wildcard_allowlist(name: str) -> None:
    with pytest.raises(ValidationError, match=f"explicit {name}, not"):
        Settings(admin_api_key=STRONG_KEY, auth_enabled=True, environment="production", **{name: ("*",)})


@pytest.mark.parametrize("values", [{"http_rate_limit_per_minute": 0}, {"runtime_command_rate_limit_per_second": 0}])
def test_production_refuses_a_disabled_rate_limit(values: dict) -> None:
    with pytest.raises(ValidationError, match="rate limits above zero"):
        Settings(admin_api_key=STRONG_KEY, auth_enabled=True, environment="production", **values)


def test_local_settings_still_take_a_wildcard_and_no_rate_limit() -> None:
    settings = Settings(allowed_ros_publish_topics=("*",), http_rate_limit_per_minute=0)

    assert settings.allowed_ros_publish_topics == ("*",)
    assert settings.http_rate_limit_per_minute == 0


# ------------------------------------------------------------------- ROS names


@pytest.mark.parametrize("node", ["cartesian_manager", "/cartesian manager", "/cartesian_manager;x", "/../x", "/"])
def test_a_parameter_set_names_a_real_node(node: str) -> None:
    client = make_client()

    response = client.post("/api/v1/ros/parameters/set", json={"node": node, "name": "shapers.snake.gain", "value": 1})

    assert response.status_code == 422, node


@pytest.mark.parametrize("name", ["shapers snake", "shapers..gain", ".gain", "gain;x", "gain/", "1gain"])
def test_a_parameter_set_names_a_real_parameter(name: str) -> None:
    client = make_client()

    response = client.post("/api/v1/ros/parameters/set", json={"node": "/cartesian_manager", "name": name, "value": 1})

    assert response.status_code == 422, name


def test_a_parameter_read_refuses_a_malformed_node_or_name() -> None:
    client = make_client()

    bad_node = client.get(
        "/api/v1/ros/parameters", params={"node": "/cartesian manager", "names": "shapers.snake.gain"}
    )
    bad_name = client.get("/api/v1/ros/parameters", params={"node": "/cartesian_manager", "names": "gain,bad name"})

    assert bad_node.status_code == 422
    assert bad_name.status_code == 422


def test_a_package_name_is_one_path_segment(tmp_path: Path) -> None:
    share = tmp_path / "share"
    share.mkdir()
    (share / "robot.stl").write_bytes(b"solid")
    asked: list[str] = []

    def resolver(name: str) -> Path:
        asked.append(name)
        return share

    assert resolve_package_asset("../etc", "robot.stl", resolver) is None
    assert resolve_package_asset("pkg/../other", "robot.stl", resolver) is None
    assert resolve_package_asset("", "robot.stl", resolver) is None
    # The ament index was never asked about any of them.
    assert asked == []
    assert resolve_package_asset("kortex_description", "robot.stl", resolver) == share / "robot.stl"


# ------------------------------------------------------------- configuration ids


@pytest.mark.parametrize("config_id", ["../evil", "a/b", "a\\b", "", ".", "..", ".hidden"])
def test_sharing_and_restoring_refuse_a_path_shaped_id(tmp_path: Path, config_id: str) -> None:
    repository = InMemoryConfigurationRepository()

    with pytest.raises(InvalidConfigurationIdError):
        publish_configuration(repository, config_id, tmp_path)
    with pytest.raises(InvalidConfigurationIdError):
        restore_shipped_configuration(repository, config_id, tmp_path)
    assert list(tmp_path.iterdir()) == []


def test_the_share_routes_answer_422_to_a_path_shaped_id(tmp_path: Path) -> None:
    client = make_client(seed_dir=tmp_path, seed_shared_applications=False)

    assert client.post("/api/v1/configurations/.hidden/publish").status_code == 422
    assert client.post("/api/v1/configurations/.hidden/take-shipped").status_code == 422
    assert list(tmp_path.iterdir()) == []


# ------------------------------------------------------------------ file modes


def test_the_stop_latch_is_written_owner_only(tmp_path: Path) -> None:
    state_path = tmp_path / "data" / "runtime_stop.json"
    client = make_client(runtime_stop_state_path=state_path)

    assert client.post("/api/v1/runtime/stop").status_code == 200

    assert stat.S_IMODE(state_path.stat().st_mode) == 0o600


def test_a_new_store_is_owner_only(tmp_path: Path) -> None:
    path = tmp_path / "bloom.db"

    with sqlite_connection(path) as connection:
        connection.execute("PRAGMA user_version")

    assert stat.S_IMODE(path.stat().st_mode) == 0o600


def test_an_existing_store_keeps_the_mode_it_was_given(tmp_path: Path) -> None:
    # A store given its own mode keeps it (a lab may share it; 0o700 keeps CodeQL quiet here).
    path = tmp_path / "bloom.db"
    path.touch()
    os.chmod(path, 0o700)

    with sqlite_connection(path) as connection:
        connection.execute("PRAGMA user_version")

    assert stat.S_IMODE(path.stat().st_mode) == 0o700
