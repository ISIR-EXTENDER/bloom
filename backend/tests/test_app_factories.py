"""The app factory wires what the settings say: CORS, the command backend, the recorder, and the state ticker."""

from __future__ import annotations

import asyncio
import logging

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api import main as api_main
from apps.bloom_api.main import (
    create_app,
    create_runtime_recording_gateway,
    create_teleop_command_gateway,
    run_command_state_ticker,
)
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters.rclpy_cartesian_manager import RclpyCartesianManagerGateway
from libs.ros_adapters.rclpy_teleop import RclpyTeleopCommandGateway
from libs.sessions.recording import NoopRuntimeRecordingGateway, RosbagRuntimeRecordingGateway, RuntimeRecordingRequest


def health(origins: tuple[str, ...]):
    settings = Settings(environment="test", cors_allowed_origins=origins)
    client = TestClient(create_app(settings, InMemoryConfigurationRepository()))
    return client.get("/api/v1/health", headers={"Origin": "http://tablet.local"})


def test_without_configured_origins_no_cors_headers_are_sent() -> None:
    closed = health(())
    open_to_tablet = health(("http://tablet.local",))

    assert closed.status_code == 200
    assert "access-control-allow-origin" not in closed.headers
    assert open_to_tablet.headers["access-control-allow-origin"] == "http://tablet.local"


def test_the_command_backend_setting_picks_the_robot_adapter() -> None:
    node = object()

    legacy = create_teleop_command_gateway(Settings(environment="test", ros_command_backend="teleop_command"), node)
    manager_settings = Settings(
        environment="test",
        ros_command_frame_id="effector_frame",
        allowed_command_frame_ids=("base_link", "effector_frame"),
    )
    manager = create_teleop_command_gateway(manager_settings, node)

    assert isinstance(legacy, RclpyTeleopCommandGateway)
    assert isinstance(manager, RclpyCartesianManagerGateway)
    assert manager.command_frame_id == "effector_frame"


def test_the_rosbag_setting_builds_a_recorder_with_the_configured_executable(monkeypatch, tmp_path) -> None:
    settings = Settings(
        environment="test",
        runtime_recording_gateway="rosbag",
        runtime_recording_base_directory=tmp_path,
        runtime_recording_executable="ros2-lab",
    )
    monkeypatch.setattr("libs.sessions.recording.which", lambda executable: None)

    gateway = create_runtime_recording_gateway(settings)

    assert isinstance(gateway, RosbagRuntimeRecordingGateway)
    with pytest.raises(RuntimeError, match="ros2-lab executable is not available"):
        gateway.start(RuntimeRecordingRequest(topics=("/joint_states",), output_folder="rec"))
    assert isinstance(create_runtime_recording_gateway(Settings(environment="test")), NoopRuntimeRecordingGateway)


class FlakyTracker:
    def __init__(self) -> None:
        self.ticks = 0

    def tick(self) -> None:
        self.ticks += 1
        if self.ticks == 1:
            raise RuntimeError("clock skew")


def test_a_failing_tick_is_logged_and_the_ticker_keeps_going(caplog: pytest.LogCaptureFixture) -> None:
    tracker = FlakyTracker()
    caplog.set_level(logging.ERROR, logger="apps.bloom_api.main")

    async def run() -> None:
        task = asyncio.create_task(run_command_state_ticker(tracker, period_sec=0.001))
        while tracker.ticks < 3:
            await asyncio.sleep(0.001)
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    asyncio.run(run())

    assert tracker.ticks >= 3
    assert [record.getMessage() for record in caplog.records] == ["Command state tick failed."]


def test_the_module_level_app_is_built_once_on_first_use(monkeypatch: pytest.MonkeyPatch) -> None:
    built: list[object] = []

    def build() -> object:
        built.append(object())
        return built[-1]

    monkeypatch.setattr(api_main, "create_app", build)
    api_main.__dict__.pop("app", None)
    try:
        first = api_main.app
        second = api_main.app
    finally:
        api_main.__dict__.pop("app", None)

    assert first is second and len(built) == 1
    with pytest.raises(AttributeError, match="has no attribute 'nothing_here'"):
        _ = api_main.nothing_here
