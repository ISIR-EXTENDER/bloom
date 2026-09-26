"""Visual servoing switched on by an operator is switched off when that operator leaves."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.routes.runtime_socket import reset_orphaned_modes
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters import RosPublishReceipt, RosPublishRequest
from libs.sessions import RuntimeSessionManager
from libs.sessions.audit import InMemoryRuntimeAuditLog
from libs.sessions.stop import VISUAL_SERVOING_ON_TOPIC


class RecordingRosPublisherGateway:
    def __init__(self) -> None:
        self.requests: list[RosPublishRequest] = []

    def publish(self, request: RosPublishRequest) -> RosPublishReceipt:
        self.requests.append(request)
        return RosPublishReceipt(
            detail="ok", message_type=request.message_type, status="published", topic=request.topic
        )

    def servoing(self) -> list[bool]:
        return [r.payload["data"] for r in self.requests if r.topic == VISUAL_SERVOING_ON_TOPIC]


class MovableClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


class RecordingStopController:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def publish_mode_reset(self, topic: str, mode: str) -> str:
        self.calls.append((topic, mode))
        return mode

    def turn_off_visual_servoing(self) -> str:
        self.calls.append((VISUAL_SERVOING_ON_TOPIC, "off"))
        return "off"


def eventually(condition, timeout: float = 2.0) -> bool:
    deadline = time.monotonic() + timeout
    while not condition():
        if time.monotonic() > deadline:
            return False
        time.sleep(0.01)
    return True


def servo(on: bool) -> dict:
    return {"topic": VISUAL_SERVOING_ON_TOPIC, "message_type": "std_msgs/msg/Bool", "payload": {"data": on}}


@pytest.mark.parametrize("ending", ["disconnect", "release"])
def test_the_owner_leaving_with_servoing_on_switches_it_off(ending: str) -> None:
    gateway = RecordingRosPublisherGateway()
    client = TestClient(
        create_app(
            Settings(environment="test", runtime_control_required=True),
            InMemoryConfigurationRepository(),
            ros_publisher_gateway=gateway,
        )
    )

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        session_id = websocket.receive_json()["session_id"]
        websocket.send_json({"type": "claim_control"})
        websocket.receive_json()
        response = client.post(
            "/api/v1/ros/topics/publish", headers={"X-Bloom-Runtime-Session": session_id}, json=servo(True)
        )
        assert response.status_code == 200
        if ending == "release":
            websocket.send_json({"type": "release_control"})
            websocket.receive_json()
            assert gateway.servoing() == [True, False]

    assert eventually(lambda: gateway.servoing() == [True, False])


def test_servoing_already_switched_off_is_not_switched_off_again() -> None:
    manager = RuntimeSessionManager()
    session = manager.connect()
    manager.record_published_mode_request(session.id, VISUAL_SERVOING_ON_TOPIC, {"data": True})
    assert manager.pending_visual_servoing_off(session)

    manager.record_published_mode_request(session.id, VISUAL_SERVOING_ON_TOPIC, {"data": False})
    assert not manager.pending_visual_servoing_off(session)

    manager.record_published_mode_request(session.id, VISUAL_SERVOING_ON_TOPIC, {"data": True})
    manager.record_runtime_stop("/joystick_cartesian_command")
    assert not manager.pending_visual_servoing_off(session)


def test_a_stale_owners_servoing_is_switched_off_for_the_next_owner() -> None:
    clock = MovableClock()
    manager = RuntimeSessionManager(lease_timeout_sec=10.0, clock=clock)
    stale = manager.connect()
    manager.claim_control(stale)
    manager.record_published_mode_request(stale.id, VISUAL_SERVOING_ON_TOPIC, {"data": True}, require_owner=True)

    clock.now = 11.0
    successor = manager.connect()
    assert manager.claim_control(successor).is_owner
    assert not manager.pending_visual_servoing_off(stale)

    stop_controller = RecordingStopController()
    reset_orphaned_modes(manager, successor, stop_controller, InMemoryRuntimeAuditLog())
    assert stop_controller.calls == [(VISUAL_SERVOING_ON_TOPIC, "off")]
