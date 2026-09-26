"""A tablet that drops or lets go of control cancels the joint target it started."""

from __future__ import annotations

import threading
import time

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters import RosPublishReceipt, RosPublishRequest
from libs.sessions import RuntimeSessionManager
from libs.sessions.stop import CANCEL_MODE_REQUEST


class RecordingRosPublisherGateway:
    def __init__(self) -> None:
        self.requests: list[RosPublishRequest] = []

    def publish(self, request: RosPublishRequest) -> RosPublishReceipt:
        self.requests.append(request)
        return RosPublishReceipt(
            detail="ok", message_type=request.message_type, status="published", topic=request.topic
        )

    def cancels(self) -> list[RosPublishRequest]:
        return [r for r in self.requests if r.topic == "/mode_request" and r.payload == {"data": CANCEL_MODE_REQUEST}]


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


@pytest.mark.parametrize("ending", ["disconnect", "release"])
def test_the_owner_leaving_cancels_its_joint_target(ending: str) -> None:
    gateway = RecordingRosPublisherGateway()
    app = create_app(
        Settings(environment="test", runtime_control_required=True),
        InMemoryConfigurationRepository(),
        ros_publisher_gateway=gateway,
    )
    client = TestClient(app)

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        session_id = websocket.receive_json()["session_id"]
        websocket.send_json({"type": "claim_control"})
        websocket.receive_json()
        response = client.post(
            "/api/v1/ros/topics/publish",
            headers={"X-Bloom-Runtime-Session": session_id},
            json=mode("behaviour/joint_target/home"),
        )
        assert response.status_code == 200
        assert gateway.cancels() == []
        if ending == "release":
            websocket.send_json({"type": "release_control"})
            websocket.receive_json()
            assert len(gateway.cancels()) == 1

    assert eventually(lambda: len(gateway.cancels()) == 1)


def test_leaving_without_a_joint_target_publishes_no_cancel() -> None:
    gateway = RecordingRosPublisherGateway()
    app = create_app(
        Settings(environment="test", runtime_control_required=True),
        InMemoryConfigurationRepository(),
        ros_publisher_gateway=gateway,
    )
    client = TestClient(app)

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        session_id = websocket.receive_json()["session_id"]
        websocket.send_json({"type": "claim_control"})
        websocket.receive_json()
        client.post(
            "/api/v1/ros/topics/publish",
            headers={"X-Bloom-Runtime-Session": session_id},
            json=mode("geometric/both"),
        )

    assert gateway.cancels() == []


def test_manager_forgets_a_joint_target_once_cancelled() -> None:
    manager = RuntimeSessionManager()
    session = manager.connect()
    manager.record_published_mode_request(session.id, "/mode_request", {"data": "behaviour/joint_target/home"})
    assert manager.pending_joint_target(session) == "/mode_request"

    manager.record_published_mode_request(session.id, "/mode_request", {"data": "behaviour/passthrough"})
    assert manager.pending_joint_target(session) is None

    manager.record_published_mode_request(session.id, "/mode_request", {"data": "behaviour/joint_target/home"})
    manager.record_runtime_stop("/joystick_cartesian_command")
    assert manager.pending_joint_target(session) is None


def test_a_mode_request_recorded_after_release_is_ignored() -> None:
    # The late-record race: the publish finished, the release ran, and only then did the route record.
    manager = RuntimeSessionManager()
    former = manager.connect()
    manager.claim_control(former)
    manager.release_control(former)
    manager.record_published_mode_request(
        former.id, "/mode_request", {"data": "behaviour/joint_target/home"}, require_owner=True
    )
    assert manager.pending_joint_target(former) is None


def test_a_release_waits_for_an_in_flight_publish_and_then_sees_its_joint_target() -> None:
    manager = RuntimeSessionManager()
    owner = manager.connect()
    manager.claim_control(owner)
    publishing = threading.Event()
    proceed = threading.Event()
    seen_by_release: list[str | None] = []

    def publish_and_record() -> None:
        publishing.set()
        proceed.wait(2.0)
        manager.record_published_mode_request(
            owner.id, "/mode_request", {"data": "behaviour/joint_target/home"}, require_owner=True
        )

    def release() -> None:
        assert manager.begin_control_release(owner)
        manager.wait_for_control_operations(owner)
        seen_by_release.append(manager.pending_joint_target(owner))
        manager.finish_control_release(owner)

    publisher = threading.Thread(target=lambda: manager.execute_if_control_owner(owner.id, publish_and_record))
    publisher.start()
    assert publishing.wait(2.0)
    releaser = threading.Thread(target=release)
    releaser.start()
    time.sleep(0.05)
    assert seen_by_release == []
    proceed.set()
    publisher.join(2.0)
    releaser.join(2.0)

    # The release neutralizes what the publish recorded, so nothing is left for a later disconnect to cancel.
    assert seen_by_release == ["/mode_request"]
