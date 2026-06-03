from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.sessions import (
    RuntimeTopicSample,
    RuntimeTopicSubscription,
    RuntimeTopicSubscriptionHandle,
    RuntimeTopicSampleCallback,
    TeleopCommand,
    TeleopPublishReceipt,
    TeleopVector3,
)


class RecordingTeleopGateway:
    def __init__(self) -> None:
        self.commands: list[TeleopCommand] = []

    def publish(self, command: TeleopCommand) -> TeleopPublishReceipt:
        self.commands.append(command)
        return TeleopPublishReceipt(detail="Teleop command recorded.", status="accepted", target=command.target)


class FailingTeleopGateway:
    def publish(self, command: TeleopCommand) -> TeleopPublishReceipt:
        raise RuntimeError("extender_msgs is required to publish teleop commands")


class RecordingTopicSubscriptionHandle:
    def __init__(self) -> None:
        self.closed = False

    def close(self) -> None:
        self.closed = True


class RecordingTopicSubscriptionGateway:
    def __init__(self) -> None:
        self.handle = RecordingTopicSubscriptionHandle()
        self.subscriptions: list[RuntimeTopicSubscription] = []

    def subscribe(
        self,
        subscription: RuntimeTopicSubscription,
        on_sample: RuntimeTopicSampleCallback,
    ) -> RuntimeTopicSubscriptionHandle:
        self.subscriptions.append(subscription)
        on_sample(
            RuntimeTopicSample(
                message_type=subscription.message_type,
                received_at="2026-06-03T10:00:00+00:00",
                topic=subscription.topic,
                value={"data": 0.42},
            )
        )
        return self.handle


def test_runtime_websocket_accepts_ping_messages() -> None:
    app = create_app(Settings(environment="test"), InMemoryConfigurationRepository())
    client = TestClient(app)

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        connected = websocket.receive_json()
        websocket.send_json({"type": "ping"})
        pong = websocket.receive_json()

    assert connected["type"] == "session_connected"
    assert connected["active_sessions"] == 1
    assert pong == {
        "type": "pong",
        "active_sessions": None,
        "detail": "Runtime session is alive.",
        "payload": {},
        "session_id": connected["session_id"],
    }
    assert app.state.runtime_session_manager.active_session_count == 0


def test_runtime_websocket_accepts_topic_subscriptions() -> None:
    client = TestClient(create_app(Settings(environment="test"), InMemoryConfigurationRepository()))

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        connected = websocket.receive_json()
        websocket.send_json(
            {
                "type": "subscribe_topic",
                "field_path": "data",
                "message_type": "std_msgs/msg/Float64",
                "topic": "/sandbox_controller/velocity_command",
            }
        )
        response = websocket.receive_json()

    assert response == {
        "type": "subscription_ack",
        "active_sessions": None,
        "detail": "Subscribed to /sandbox_controller/velocity_command.",
        "payload": {
            "field_path": "data",
            "message_type": "std_msgs/msg/Float64",
            "topic": "/sandbox_controller/velocity_command",
        },
        "session_id": connected["session_id"],
    }


def test_runtime_websocket_streams_topic_samples_after_subscription() -> None:
    gateway = RecordingTopicSubscriptionGateway()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            runtime_topic_subscription_gateway=gateway,
        )
    )

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        connected = websocket.receive_json()
        websocket.send_json(
            {
                "type": "subscribe_topic",
                "field_path": "data",
                "message_type": "std_msgs/msg/Float64",
                "topic": "/cmd/max_velocity",
            }
        )
        ack = websocket.receive_json()
        sample = websocket.receive_json()

    assert ack["type"] == "subscription_ack"
    assert sample == {
        "type": "topic_sample",
        "active_sessions": None,
        "detail": "Received /cmd/max_velocity.",
        "payload": {
            "message_type": "std_msgs/msg/Float64",
            "received_at": "2026-06-03T10:00:00+00:00",
            "topic": "/cmd/max_velocity",
            "value": {"data": 0.42},
        },
        "session_id": connected["session_id"],
    }
    assert gateway.subscriptions == [
        RuntimeTopicSubscription(
            field_path="data",
            message_type="std_msgs/msg/Float64",
            topic="/cmd/max_velocity",
        )
    ]
    assert gateway.handle.closed is True


def test_runtime_websocket_accepts_teleop_commands() -> None:
    gateway = RecordingTeleopGateway()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            teleop_command_gateway=gateway,
        )
    )

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        connected = websocket.receive_json()
        websocket.send_json(
            {
                "type": "teleop_cmd",
                "angular": {"x": 0.0, "y": 0.0, "z": 0.3},
                "linear": {"x": 0.1, "y": -0.2, "z": 0.0},
                "mode": 4,
                "seq": 42,
                "target": "/teleop_cmd",
            }
        )
        response = websocket.receive_json()

    assert response == {
        "type": "teleop_ack",
        "active_sessions": None,
        "detail": "Teleop command recorded.",
        "payload": {
            "angular": {"x": 0.0, "y": 0.0, "z": 0.3},
            "linear": {"x": 0.1, "y": -0.2, "z": 0.0},
            "mode": 4,
            "seq": 42,
            "status": "accepted",
            "target": "/teleop_cmd",
        },
        "session_id": connected["session_id"],
    }
    assert gateway.commands == [
        TeleopCommand(
            angular=TeleopVector3(x=0.0, y=0.0, z=0.3),
            linear=TeleopVector3(x=0.1, y=-0.2, z=0.0),
            mode=4,
            seq=42,
            target="/teleop_cmd",
        )
    ]


def test_runtime_websocket_keeps_legacy_axes_alias_for_teleop_commands() -> None:
    client = TestClient(create_app(Settings(environment="test"), InMemoryConfigurationRepository()))

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "teleop_cmd",
                "axes": {"x": 0.1, "y": -0.2, "z": 0.0},
                "mode": 2,
                "seq": 7,
            }
        )
        response = websocket.receive_json()

    assert response["payload"]["linear"] == {"x": 0.1, "y": -0.2, "z": 0.0}
    assert response["payload"]["status"] == "simulated"
    assert response["payload"]["target"] == "/teleop_cmd"


def test_runtime_websocket_rejects_out_of_range_teleop_modes() -> None:
    client = TestClient(create_app(Settings(environment="test"), InMemoryConfigurationRepository()))

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json({"type": "teleop_cmd", "mode": 5, "seq": 1})
        response = websocket.receive_json()

    assert response["type"] == "runtime_error"
    assert "less than or equal to 4" in response["payload"]["message"]


def test_runtime_websocket_returns_errors_when_teleop_gateway_fails() -> None:
    client = TestClient(
        create_app(
            configuration_repository=InMemoryConfigurationRepository(),
            teleop_command_gateway=FailingTeleopGateway(),
        )
    )

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "teleop_cmd",
                "mode": 3,
                "seq": 1,
                "target": "/teleop_cmd",
                "linear": {"x": 0.1, "y": 0.0, "z": 0.0},
                "angular": {"x": 0.0, "y": 0.0, "z": 0.0},
            }
        )

        response = websocket.receive_json()

    assert response == {
        "type": "runtime_error",
        "active_sessions": None,
        "detail": "Teleop command could not be published.",
        "payload": {
            "message": "extender_msgs is required to publish teleop commands",
            "target": "/teleop_cmd",
        },
        "session_id": response["session_id"],
    }


def test_runtime_websocket_reports_invalid_messages_without_closing() -> None:
    client = TestClient(create_app(Settings(environment="test"), InMemoryConfigurationRepository()))

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        connected = websocket.receive_json()
        websocket.send_json({"type": "subscribe_topic", "topic": "not/absolute"})
        error = websocket.receive_json()
        websocket.send_json({"type": "ping"})
        pong = websocket.receive_json()

    assert error["type"] == "runtime_error"
    assert error["detail"] == "Invalid runtime message."
    assert error["session_id"] == connected["session_id"]
    assert "topic must start with '/'" in error["payload"]["message"]
    assert pong["type"] == "pong"
