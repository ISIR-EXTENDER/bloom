"""The STOP latch file: every way it can be unreadable starts the runtime latched, and a resume repairs it."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters import RosPublishReceipt, RosPublishRequest
from libs.sessions.stop import RuntimeStopController, RuntimeStoppedError
from libs.sessions.teleop import NoopTeleopCommandGateway

PUBLISH = "/api/v1/ros/topics/publish"
MODE_REQUEST = {"topic": "/mode_request", "message_type": "std_msgs/msg/String", "payload": {"data": "geometric/both"}}


class Gateway:
    def __init__(self, failing: tuple[str, ...] = ()) -> None:
        self.failing = failing
        self.requests: list[RosPublishRequest] = []

    def publish(self, request: RosPublishRequest) -> RosPublishReceipt:
        if request.topic in self.failing:
            raise RuntimeError(f"{request.topic} is down")
        self.requests.append(request)
        return RosPublishReceipt(
            detail="ok", message_type=request.message_type, status="published", topic=request.topic
        )


def app_with(state_path: Path) -> TestClient:
    return TestClient(
        create_app(
            Settings(environment="test", runtime_stop_state_path=state_path, runtime_control_required=False),
            InMemoryConfigurationRepository(),
        )
    )


@pytest.mark.parametrize(
    "content",
    [
        pytest.param('{"stopped": "yes"}', id="stopped-is-text"),
        pytest.param("[]", id="not-an-object"),
        pytest.param('{"engaged_at": "2026-09-28T10:00:00+00:00"}', id="no-stopped-key"),
        pytest.param("", id="empty-file"),
    ],
)
def test_a_corrupt_latch_file_starts_latched_and_refuses_commands(tmp_path: Path, content: str) -> None:
    state_path = tmp_path / "runtime_stop.json"
    state_path.write_text(content, encoding="utf-8")
    client = app_with(state_path)

    state = client.get("/api/v1/runtime/stop").json()
    assert state["stopped"] is True
    assert "could not be read" in state["detail"]
    assert state["engaged_at"]

    refused = client.post(PUBLISH, json=MODE_REQUEST)
    assert refused.status_code == 409
    assert "Hold the stop control to resume" in refused.json()["detail"]


def test_a_directory_in_place_of_the_latch_file_starts_latched_and_cannot_be_saved(tmp_path: Path) -> None:
    state_path = tmp_path / "runtime_stop.json"
    state_path.mkdir()
    client = app_with(state_path)

    state = client.get("/api/v1/runtime/stop").json()
    assert state["stopped"] is True
    assert "could not be read" in state["detail"]

    resumed = client.post("/api/v1/runtime/stop/resume", json={"engaged_at": state["engaged_at"]}).json()
    assert resumed["stopped"] is False
    assert resumed["persisted"] is False
    assert "could not be saved" in resumed["detail"]


def test_resuming_a_latch_restored_from_a_corrupt_file_rewrites_it_so_the_next_start_is_unlatched(
    tmp_path: Path,
) -> None:
    state_path = tmp_path / "runtime_stop.json"
    state_path.write_text("{not json", encoding="utf-8")
    client = app_with(state_path)
    engaged_at = client.get("/api/v1/runtime/stop").json()["engaged_at"]

    resumed = client.post("/api/v1/runtime/stop/resume", json={"engaged_at": engaged_at})

    assert resumed.status_code == 200
    assert resumed.json()["persisted"] is True
    assert json.loads(state_path.read_text(encoding="utf-8"))["stopped"] is False
    assert app_with(state_path).get("/api/v1/runtime/stop").json()["stopped"] is False
    assert client.post(PUBLISH, json=MODE_REQUEST).status_code == 200


def test_a_latch_restored_from_a_corrupt_file_answers_only_its_own_resume(tmp_path: Path) -> None:
    state_path = tmp_path / "runtime_stop.json"
    state_path.write_text("null", encoding="utf-8")
    client = app_with(state_path)

    stale = client.post("/api/v1/runtime/stop/resume", json={"engaged_at": "2020-01-01T00:00:00+00:00"})

    assert stale.status_code == 409
    assert client.get("/api/v1/runtime/stop").json()["stopped"] is True


def test_a_slow_operation_is_refused_while_latched_and_runs_outside_the_gate_otherwise(tmp_path: Path) -> None:
    controller = RuntimeStopController(NoopTeleopCommandGateway(), Gateway(), state_path=tmp_path / "s.json")
    seen: list[str] = []

    def slow() -> str:
        # The gate is not held here: a STOP arriving now must not wait for this call.
        controller.engage()
        seen.append("ran")
        return "done"

    assert controller.execute_blocking_if_running(slow) == "done"
    assert seen == ["ran"]
    assert controller.state.stopped is True
    with pytest.raises(RuntimeStoppedError):
        controller.execute_blocking_if_running(slow)
    assert seen == ["ran"]


def test_command_state_bookkeeping_that_fails_never_blocks_a_stop() -> None:
    def broken_reset(topic: str, message_type: str, payload: dict) -> None:
        raise RuntimeError("store is gone")

    controller = RuntimeStopController(NoopTeleopCommandGateway(), Gateway(), on_reset=broken_reset)

    state = controller.engage()

    assert state.stopped is True
    assert state.asserted is True
    assert "Joint-target cancel (behaviour/passthrough) published on /mode_request." in state.detail


def test_a_leave_reset_that_cannot_publish_raises_with_the_reason() -> None:
    controller = RuntimeStopController(
        NoopTeleopCommandGateway(), Gateway(failing=("/ui/visual_servoing/on", "/mode_request"))
    )

    with pytest.raises(RuntimeError, match="Visual servoing off could not be published"):
        controller.turn_off_visual_servoing()
    with pytest.raises(RuntimeError, match="Mode request could not be published: /mode_request is down"):
        controller.cancel_joint_target()
    with pytest.raises(RuntimeError, match="Mode request could not be published"):
        controller.publish_mode_reset("/mode_request", "geometric/both")
    assert controller.state.stopped is False
