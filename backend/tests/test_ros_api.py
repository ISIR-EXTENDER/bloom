from __future__ import annotations

from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters import (
    RclpyRosTopicCatalogGateway,
    RosPublishReceipt,
    RosPublishRequest,
    RosTopicInfo,
    RosTopicStatus,
)
from libs.sessions import InMemoryRuntimeAuditLog, RuntimeCommandRateLimiter


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


class StaticRosTopicCatalogGateway:
    def list_topics(self) -> tuple[RosTopicInfo, ...]:
        return (
            RosTopicInfo(name="/joint_states", message_type="sensor_msgs/msg/JointState"),
            RosTopicInfo(name="/teleop_cmd", message_type="geometry_msgs/msg/Twist"),
        )

    def list_topic_status(self) -> tuple[RosTopicStatus, ...]:
        return (
            RosTopicStatus(
                name="/joint_states",
                message_type="sensor_msgs/msg/JointState",
                publisher_count=1,
                subscription_count=0,
            ),
            RosTopicStatus(
                name="/teleop_cmd",
                message_type="geometry_msgs/msg/Twist",
                publisher_count=1,
                subscription_count=2,
            ),
        )


class FakeRclpyNode:
    def get_topic_names_and_types(self) -> tuple[tuple[str, tuple[str, ...]], ...]:
        return (
            ("/teleop_cmd", ("geometry_msgs/msg/Twist",)),
            ("/joint_states", ("sensor_msgs/msg/JointState",)),
            ("/multi_type", ("std_msgs/msg/String", "std_msgs/msg/Bool")),
        )

    def get_publishers_info_by_topic(self, topic_name: str) -> tuple[object, ...]:
        publisher_counts = {
            "/joint_states": 1,
            "/multi_type": 0,
            "/teleop_cmd": 1,
        }
        return tuple(object() for _ in range(publisher_counts.get(topic_name, 0)))

    def get_subscriptions_info_by_topic(self, topic_name: str) -> tuple[object, ...]:
        subscription_counts = {
            "/joint_states": 0,
            "/multi_type": 1,
            "/teleop_cmd": 2,
        }
        return tuple(object() for _ in range(subscription_counts.get(topic_name, 0)))


def test_list_ros_topics_defaults_to_empty_when_ros_is_not_configured(client: TestClient) -> None:
    response = client.get("/api/v1/ros/topics")

    assert response.status_code == 200
    assert response.json() == {"topics": []}


def test_list_ros_topics_uses_configured_catalog_gateway() -> None:
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            ros_topic_catalog_gateway=StaticRosTopicCatalogGateway(),
        )
    )

    response = client.get("/api/v1/ros/topics")

    assert response.status_code == 200
    assert response.json() == {
        "topics": [
            {"name": "/joint_states", "message_type": "sensor_msgs/msg/JointState"},
            {"name": "/teleop_cmd", "message_type": "geometry_msgs/msg/Twist"},
        ]
    }


def test_list_ros_topic_status_uses_configured_catalog_gateway() -> None:
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            ros_topic_catalog_gateway=StaticRosTopicCatalogGateway(),
        )
    )

    response = client.get("/api/v1/ros/topics/status")

    assert response.status_code == 200
    assert response.json() == {
        "topics": [
            {
                "name": "/joint_states",
                "message_type": "sensor_msgs/msg/JointState",
                "publisher_count": 1,
                "subscription_count": 0,
            },
            {
                "name": "/teleop_cmd",
                "message_type": "geometry_msgs/msg/Twist",
                "publisher_count": 1,
                "subscription_count": 2,
            },
        ]
    }


def test_rclpy_topic_catalog_gateway_normalizes_live_topic_list() -> None:
    gateway = RclpyRosTopicCatalogGateway(FakeRclpyNode())

    assert gateway.list_topics() == (
        RosTopicInfo(name="/joint_states", message_type="sensor_msgs/msg/JointState"),
        RosTopicInfo(name="/multi_type", message_type="std_msgs/msg/Bool"),
        RosTopicInfo(name="/multi_type", message_type="std_msgs/msg/String"),
        RosTopicInfo(name="/teleop_cmd", message_type="geometry_msgs/msg/Twist"),
    )


def test_rclpy_topic_catalog_gateway_reports_endpoint_counts() -> None:
    gateway = RclpyRosTopicCatalogGateway(FakeRclpyNode())

    assert gateway.list_topic_status() == (
        RosTopicStatus(
            name="/joint_states",
            message_type="sensor_msgs/msg/JointState",
            publisher_count=1,
            subscription_count=0,
        ),
        RosTopicStatus(
            name="/multi_type",
            message_type="std_msgs/msg/Bool",
            publisher_count=0,
            subscription_count=1,
        ),
        RosTopicStatus(
            name="/multi_type",
            message_type="std_msgs/msg/String",
            publisher_count=0,
            subscription_count=1,
        ),
        RosTopicStatus(
            name="/teleop_cmd",
            message_type="geometry_msgs/msg/Twist",
            publisher_count=1,
            subscription_count=2,
        ),
    )


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


def test_publish_ros_topic_accepts_cli_style_payload_text() -> None:
    gateway = RecordingRosPublisherGateway()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            ros_publisher_gateway=gateway,
        )
    )

    response = client.post(
        "/api/v1/ros/topics/publish",
        json={
            "topic": "/ui/ros_toggle",
            "message_type": "std_msgs/msg/Int32MultiArray",
            "payload_text": "{data: [13, 1]}",
        },
    )

    assert response.status_code == 200
    assert gateway.requests == [
        RosPublishRequest(
            topic="/ui/ros_toggle",
            message_type="std_msgs/msg/Int32MultiArray",
            payload={"data": [13, 1]},
        )
    ]


def test_publish_ros_topic_rejects_multiple_payload_sources(client: TestClient) -> None:
    response = client.post(
        "/api/v1/ros/topics/publish",
        json={
            "topic": "/ui/ros_toggle",
            "message_type": "std_msgs/msg/Bool",
            "payload": {"data": True},
            "payload_text": "{data: true}",
        },
    )

    assert response.status_code == 422


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
    assert response.json() == {"detail": "std_msgs/msg/Bool payload must include a 'data' field."}


def test_publish_ros_topic_rejects_topics_outside_allowlist() -> None:
    audit_log = InMemoryRuntimeAuditLog()
    gateway = RecordingRosPublisherGateway()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            ros_publisher_gateway=gateway,
            runtime_audit_log=audit_log,
        )
    )

    response = client.post(
        "/api/v1/ros/topics/publish",
        json={
            "topic": "/dangerous/custom_topic",
            "message_type": "std_msgs/msg/Bool",
            "payload": {"data": True},
        },
    )

    assert response.status_code == 403
    assert "not allowed" in response.json()["detail"]
    assert gateway.requests == []
    assert audit_log.list_records()[0].status == "rejected"
    assert audit_log.list_records()[0].topic == "/dangerous/custom_topic"


def test_publish_ros_topic_records_accepted_audit_events() -> None:
    audit_log = InMemoryRuntimeAuditLog()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            ros_publisher_gateway=RecordingRosPublisherGateway(),
            runtime_audit_log=audit_log,
        )
    )

    response = client.post(
        "/api/v1/ros/topics/publish",
        json={
            "topic": "/ui/ros_toggle",
            "message_type": "std_msgs/msg/Int32MultiArray",
            "payload": {"data": [13, 1]},
        },
    )

    assert response.status_code == 200
    record = audit_log.list_records()[0]
    assert record.channel == "http_ros_publish"
    assert record.status == "accepted"
    assert record.topic == "/ui/ros_toggle"
    assert record.message_type == "std_msgs/msg/Int32MultiArray"
    assert record.payload_summary == {"data_length": 2, "field_count": 1, "fields": ["data"]}


def test_publish_ros_topic_rejects_rate_limited_commands() -> None:
    audit_log = InMemoryRuntimeAuditLog()
    clock = ControlledClock()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            ros_publisher_gateway=RecordingRosPublisherGateway(),
            runtime_audit_log=audit_log,
            runtime_command_rate_limiter=RuntimeCommandRateLimiter(max_commands_per_second=1, clock=clock),
        )
    )
    payload = {
        "topic": "/ui/ros_toggle",
        "message_type": "std_msgs/msg/Int32MultiArray",
        "payload": {"data": [13, 1]},
    }

    assert client.post("/api/v1/ros/topics/publish", json=payload).status_code == 200
    response = client.post("/api/v1/ros/topics/publish", json=payload)

    assert response.status_code == 429
    assert "rate limit exceeded" in response.json()["detail"]
    record = audit_log.list_records()[0]
    assert record.channel == "http_ros_publish"
    assert record.status == "rejected"
    assert record.topic == "/ui/ros_toggle"


class ControlledClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now
