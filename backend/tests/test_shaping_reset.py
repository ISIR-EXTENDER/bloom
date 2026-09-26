"""A Snake (or any shaper) left set by a departed operator is reset before anyone else drives."""

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


class RecordingRosPublisherGateway:
    def __init__(self) -> None:
        self.requests: list[RosPublishRequest] = []

    def publish(self, request: RosPublishRequest) -> RosPublishReceipt:
        self.requests.append(request)
        return RosPublishReceipt(
            detail="ok", message_type=request.message_type, status="published", topic=request.topic
        )

    def modes(self) -> list[str]:
        return [r.payload["data"] for r in self.requests if r.topic == "/mode_request"]


class MovableClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


class RecordingStopController:
    def __init__(self) -> None:
        self.resets: list[tuple[str, str]] = []

    def publish_mode_reset(self, topic: str, mode: str) -> str:
        self.resets.append((topic, mode))
        return f"{mode} on {topic}"


def eventually(condition, timeout: float = 2.0) -> bool:
    """The server finishes a disconnect after the client's socket has already closed."""
    deadline = time.monotonic() + timeout
    while not condition():
        if time.monotonic() > deadline:
            return False
        time.sleep(0.01)
    return True


def mode(data: str) -> dict:
    return {"topic": "/mode_request", "message_type": "std_msgs/msg/String", "payload": {"data": data}}


def app_and_gateway() -> tuple[TestClient, RecordingRosPublisherGateway]:
    gateway = RecordingRosPublisherGateway()
    app = create_app(
        Settings(environment="test", runtime_control_required=True),
        InMemoryConfigurationRepository(),
        ros_publisher_gateway=gateway,
    )
    return TestClient(app), gateway


@pytest.mark.parametrize("ending", ["disconnect", "release"])
def test_the_owner_leaving_with_snake_held_resets_the_shaper(ending: str) -> None:
    client, gateway = app_and_gateway()

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        session_id = websocket.receive_json()["session_id"]
        websocket.send_json({"type": "claim_control"})
        websocket.receive_json()
        headers = {"X-Bloom-Runtime-Session": session_id}
        response = client.post("/api/v1/ros/topics/publish", headers=headers, json=mode("geometric/snake"))
        assert response.status_code == 200
        if ending == "release":
            websocket.send_json({"type": "release_control"})
            websocket.receive_json()
            assert gateway.modes() == ["geometric/snake", "geometric/both"]

    assert eventually(lambda: gateway.modes() == ["geometric/snake", "geometric/both"])


def test_a_snake_already_released_is_not_reset_again() -> None:
    client, gateway = app_and_gateway()

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        session_id = websocket.receive_json()["session_id"]
        websocket.send_json({"type": "claim_control"})
        websocket.receive_json()
        headers = {"X-Bloom-Runtime-Session": session_id}
        client.post("/api/v1/ros/topics/publish", headers=headers, json=mode("geometric/snake"))
        client.post("/api/v1/ros/topics/publish", headers=headers, json=mode("geometric/both"))

    assert gateway.modes() == ["geometric/snake", "geometric/both"]


def test_a_stale_owners_snake_and_joint_target_are_reset_for_the_next_owner_only() -> None:
    clock = MovableClock()
    manager = RuntimeSessionManager(lease_timeout_sec=10.0, clock=clock)
    stale = manager.connect()
    manager.claim_control(stale)
    manager.record_published_mode_request(stale.id, "/mode_request", {"data": "geometric/snake"})
    manager.record_published_mode_request(stale.id, "/mode_request", {"data": "behaviour/joint_target/home"})

    clock.now = 11.0
    successor = manager.connect()
    assert manager.claim_control(successor).is_owner
    # The old session's own disconnect must not undo what the new owner sets from here on.
    assert manager.pending_shaping_reset(stale) is None
    assert manager.pending_joint_target(stale) is None

    stop_controller = RecordingStopController()
    reset_orphaned_modes(manager, successor, stop_controller, InMemoryRuntimeAuditLog())
    assert sorted(stop_controller.resets) == [
        ("/mode_request", "behaviour/passthrough"),
        ("/mode_request", "geometric/both"),
    ]
    reset_orphaned_modes(manager, successor, stop_controller, InMemoryRuntimeAuditLog())
    assert len(stop_controller.resets) == 2
