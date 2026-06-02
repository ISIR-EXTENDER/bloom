from __future__ import annotations

from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters import RosPublishReceipt, RosPublishRequest


class RecordingRosPublisherGateway:
    def __init__(self) -> None:
        self.requests: list[RosPublishRequest] = []

    def publish(self, request: RosPublishRequest) -> RosPublishReceipt:
        self.requests.append(request)
        return RosPublishReceipt(
            topic=request.topic,
            message_type=request.message_type,
            status="published",
            detail="recorded for test",
        )


class FailingRosPublisherGateway:
    def publish(self, request: RosPublishRequest) -> RosPublishReceipt:
        raise ValueError(f"Invalid payload for {request.message_type}")


def test_publish_ros_topic_uses_configured_gateway() -> None:
    gateway = RecordingRosPublisherGateway()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            ros_publisher_gateway=gateway,
        )
    )
    payload = {
        "topic": "/petanque_state_machine/change_state",
        "message_type": "std_msgs/msg/String",
        "payload": {"data": "activate_throw"},
    }

    response = client.post("/api/v1/ros/topics/publish", json=payload)

    assert response.status_code == 200
    assert response.json() == {
        "topic": "/petanque_state_machine/change_state",
        "message_type": "std_msgs/msg/String",
        "status": "published",
        "detail": "recorded for test",
    }
    assert gateway.requests == [
        RosPublishRequest(
            topic="/petanque_state_machine/change_state",
            message_type="std_msgs/msg/String",
            payload={"data": "activate_throw"},
        )
    ]


def test_publish_ros_topic_defaults_to_simulated_when_ros_is_not_configured(client: TestClient) -> None:
    response = client.post(
        "/api/v1/ros/topics/publish",
        json={
            "topic": "/ui/ros_toggle",
            "message_type": "std_msgs/msg/Int32MultiArray",
            "payload": {"data": [13, 1]},
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "topic": "/ui/ros_toggle",
        "message_type": "std_msgs/msg/Int32MultiArray",
        "status": "simulated",
        "detail": "ROS publisher gateway is not configured.",
    }


def test_publish_ros_topic_rejects_invalid_topic(client: TestClient) -> None:
    response = client.post(
        "/api/v1/ros/topics/publish",
        json={
            "topic": "ui/ros_toggle",
            "message_type": "std_msgs/msg/Bool",
            "payload": {"data": True},
        },
    )

    assert response.status_code == 422


def test_publish_ros_topic_returns_gateway_payload_errors() -> None:
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            ros_publisher_gateway=FailingRosPublisherGateway(),
        )
    )

    response = client.post(
        "/api/v1/ros/topics/publish",
        json={
            "topic": "/ui/ros_toggle",
            "message_type": "std_msgs/msg/Bool",
            "payload": {"bad": "field"},
        },
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid payload for std_msgs/msg/Bool"}
