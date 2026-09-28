"""STOP survives a restart, forgets only what it told the robot, and a resume answers one latch."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters import RosPublishReceipt, RosPublishRequest
from libs.sessions import RuntimeSessionManager
from libs.sessions.stop import (
    CANCEL_MODE_REQUEST,
    VISUAL_SERVOING_ON_TOPIC,
    RuntimeStopAssertionError,
    RuntimeStopController,
)
from libs.sessions.teleop import NoopTeleopCommandGateway


class SelectiveRosPublisherGateway:
    """Publishes everything except the topics it is told to fail on."""

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

    def cancels(self) -> list[str]:
        return [r.topic for r in self.requests if r.payload == {"data": CANCEL_MODE_REQUEST}]


def controller_for(manager: RuntimeSessionManager, gateway: SelectiveRosPublisherGateway) -> RuntimeStopController:
    return RuntimeStopController(
        teleop_gateway=NoopTeleopCommandGateway(),
        ros_publisher_gateway=gateway,
        on_asserted=manager.record_runtime_stop,
        joint_target_topics=manager.joint_target_topics,
        shaping_topics=manager.shaping_topics,
    )


def app_with(state_path: Path, **settings: object) -> TestClient:
    return TestClient(
        create_app(
            Settings(environment="test", runtime_stop_state_path=state_path, **settings),
            InMemoryConfigurationRepository(),
        )
    )


def test_stop_cancels_on_every_tracked_mode_request_topic() -> None:
    manager = RuntimeSessionManager()
    session = manager.connect()
    manager.record_mode_request(session.id, "behaviour/joint_target/home", "/kinova/mode_request")
    gateway = SelectiveRosPublisherGateway()

    controller_for(manager, gateway).engage()

    assert gateway.cancels() == ["/mode_request", "/kinova/mode_request"]
    assert manager.pending_joint_target(session) is None


def test_a_cancel_or_servo_off_that_failed_is_still_owed() -> None:
    manager = RuntimeSessionManager()
    session = manager.connect()
    manager.record_mode_request(session.id, "behaviour/joint_target/home", "/kinova/mode_request")
    manager.record_published_mode_request(session.id, VISUAL_SERVOING_ON_TOPIC, {"data": True})
    gateway = SelectiveRosPublisherGateway(failing=("/kinova/mode_request", VISUAL_SERVOING_ON_TOPIC))

    with pytest.raises(RuntimeStopAssertionError):
        controller_for(manager, gateway).engage()
    assert manager.pending_joint_target(session) == "/kinova/mode_request"
    assert manager.pending_visual_servoing_off(session)


def test_stop_resets_a_held_snake_on_every_tracked_mode_request_topic() -> None:
    manager = RuntimeSessionManager()
    session = manager.connect()
    manager.record_mode_request(session.id, "geometric/snake", "/kinova/mode_request")
    gateway = SelectiveRosPublisherGateway()

    controller_for(manager, gateway).engage()

    resets = [r.topic for r in gateway.requests if r.payload == {"data": "geometric/both"}]
    assert resets == ["/mode_request", "/kinova/mode_request"]
    assert manager.pending_shaping_reset(session) is None


def test_a_shaping_reset_that_failed_is_still_owed() -> None:
    manager = RuntimeSessionManager()
    session = manager.connect()
    manager.record_mode_request(session.id, "geometric/snake", "/kinova/mode_request")
    gateway = SelectiveRosPublisherGateway(failing=("/kinova/mode_request",))

    with pytest.raises(RuntimeStopAssertionError):
        controller_for(manager, gateway).engage()
    assert manager.pending_shaping_reset(session) == "/kinova/mode_request"


def test_a_latched_stop_survives_a_restart(tmp_path: Path) -> None:
    state_path = tmp_path / "data" / "runtime_stop.json"
    first = app_with(state_path)
    engaged_at = first.post("/api/v1/runtime/stop").json()["engaged_at"]

    restarted = app_with(state_path).get("/api/v1/runtime/stop").json()
    assert restarted["stopped"] is True
    assert restarted["engaged_at"] == engaged_at

    assert app_with(state_path).post("/api/v1/runtime/stop/resume").status_code == 200
    assert app_with(state_path).get("/api/v1/runtime/stop").json()["stopped"] is False


def test_a_fresh_install_starts_unlatched_and_an_unreadable_latch_starts_latched(tmp_path: Path) -> None:
    state_path = tmp_path / "runtime_stop.json"
    assert app_with(state_path).get("/api/v1/runtime/stop").json()["stopped"] is False

    state_path.write_text("{not json", encoding="utf-8")
    body = app_with(state_path).get("/api/v1/runtime/stop").json()
    assert body["stopped"] is True
    assert "could not be read" in body["detail"]


def test_a_resume_for_an_older_stop_is_refused(tmp_path: Path) -> None:
    client = app_with(tmp_path / "runtime_stop.json")
    older = client.post("/api/v1/runtime/stop").json()["engaged_at"]
    newer = client.post("/api/v1/runtime/stop").json()["engaged_at"]
    assert older != newer

    refused = client.post("/api/v1/runtime/stop/resume", json={"engaged_at": older})
    assert refused.status_code == 409
    assert "newer STOP" in refused.json()["detail"]
    assert client.get("/api/v1/runtime/stop").json()["stopped"] is True

    assert client.post("/api/v1/runtime/stop/resume", json={"engaged_at": newer}).status_code == 200
    assert client.post("/api/v1/runtime/stop").status_code == 200
    # Without engaged_at, resume keeps working as before.
    assert client.post("/api/v1/runtime/stop/resume").json()["stopped"] is False


def test_a_resume_from_a_station_that_never_saw_the_latch_is_refused(tmp_path: Path) -> None:
    client = app_with(tmp_path / "runtime_stop.json")
    assert client.post("/api/v1/runtime/stop/resume", json={"engaged_at": ""}).status_code == 200

    client.post("/api/v1/runtime/stop")
    refused = client.post("/api/v1/runtime/stop/resume", json={"engaged_at": ""})
    assert refused.status_code == 409
    assert client.get("/api/v1/runtime/stop").json()["stopped"] is True


def test_a_latch_that_cannot_be_saved_says_so_in_the_stop_state(tmp_path: Path) -> None:
    blocker = tmp_path / "not-a-directory"
    blocker.write_text("", encoding="utf-8")
    client = app_with(blocker / "runtime_stop.json")

    body = client.post("/api/v1/runtime/stop").json()

    assert body["stopped"] is True
    assert body["persisted"] is False
    assert "could not be saved" in body["detail"]
    assert client.get("/api/v1/runtime/stop").json()["persisted"] is False


def test_a_saved_latch_reports_persisted(tmp_path: Path) -> None:
    assert app_with(tmp_path / "runtime_stop.json").post("/api/v1/runtime/stop").json()["persisted"] is True


def test_the_default_latch_path_does_not_depend_on_the_working_directory(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BLOOM_RUNTIME_STOP_STATE_PATH")
    path = Settings.from_environment().runtime_stop_state_path
    assert path.is_absolute()
    assert path == Path(__file__).resolve().parents[1] / "data" / "runtime_stop.json"

    monkeypatch.setenv("BLOOM_RUNTIME_STOP_STATE_PATH", "/tmp/elsewhere.json")
    assert Settings.from_environment().runtime_stop_state_path == Path("/tmp/elsewhere.json")
