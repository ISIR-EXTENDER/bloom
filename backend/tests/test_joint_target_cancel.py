"""A tablet that drops or lets go of control cancels the joint target it started."""

from __future__ import annotations

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

    assert len(gateway.cancels()) == 1


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
