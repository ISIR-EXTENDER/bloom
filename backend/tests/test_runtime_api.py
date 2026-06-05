from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.sessions import (
    InMemoryRuntimeAuditLog,
    RuntimeCommandRateLimiter,
    RuntimeAuditRecord,
    RuntimeRecordingReceipt,
    RuntimeRecordingRequest,
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


class RecordingRuntimeRecordingGateway:
    def __init__(self) -> None:
        self.started_requests: list[RuntimeRecordingRequest] = []
        self.stopped_recording_ids: list[str] = []

    def start(self, request: RuntimeRecordingRequest) -> RuntimeRecordingReceipt:
        self.started_requests.append(request)
        return RuntimeRecordingReceipt(
            detail="Recording started.",
            output_folder=request.output_folder,
            recording_id="recording-1",
            status="recording",
            topics=request.topics,
        )

    def stop(self, recording_id: str) -> RuntimeRecordingReceipt:
        self.stopped_recording_ids.append(recording_id)
        return RuntimeRecordingReceipt(
            detail="Recording stopped.",
            output_folder="data/recordings",
            recording_id=recording_id,
            status="stopped",
            topics=(),
        )


class FailingRuntimeRecordingGateway:
    def start(self, request: RuntimeRecordingRequest) -> RuntimeRecordingReceipt:
        raise RuntimeError("ros2 executable is not available for rosbag recording")

    def stop(self, recording_id: str) -> RuntimeRecordingReceipt:
        raise RuntimeError("recording gateway unavailable")


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
                "widget_id": "velocity-plot",
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
            "widget_id": "velocity-plot",
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
                "widget_id": "max-velocity-echo",
            }
        )
        ack = websocket.receive_json()
        sample = websocket.receive_json()

    assert ack["type"] == "subscription_ack"
    assert ack["payload"]["widget_id"] == "max-velocity-echo"
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


def test_runtime_websocket_rejects_teleop_targets_outside_allowlist() -> None:
    audit_log = InMemoryRuntimeAuditLog()
    gateway = RecordingTeleopGateway()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            runtime_audit_log=audit_log,
            teleop_command_gateway=gateway,
        )
    )

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        connected = websocket.receive_json()
        websocket.send_json(
            {
                "type": "teleop_cmd",
                "mode": 4,
                "seq": 1,
                "target": "/dangerous/teleop",
                "linear": {"x": 0.1, "y": 0.0, "z": 0.0},
                "angular": {"x": 0.0, "y": 0.0, "z": 0.0},
            }
        )
        response = websocket.receive_json()

    assert response["type"] == "runtime_error"
    assert response["detail"] == "Teleop command was rejected by runtime policy."
    assert response["session_id"] == connected["session_id"]
    assert gateway.commands == []
    record = audit_log.list_records()[0]
    assert record.channel == "websocket_teleop"
    assert record.status == "rejected"
    assert record.session_id == connected["session_id"]
    assert record.target == "/dangerous/teleop"


def test_runtime_websocket_rejects_rate_limited_teleop_commands() -> None:
    audit_log = InMemoryRuntimeAuditLog()
    clock = ControlledClock()
    gateway = RecordingTeleopGateway()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            runtime_audit_log=audit_log,
            runtime_command_rate_limiter=RuntimeCommandRateLimiter(max_commands_per_second=1, clock=clock),
            teleop_command_gateway=gateway,
        )
    )
    command = {
        "type": "teleop_cmd",
        "mode": 4,
        "seq": 1,
        "target": "/teleop_cmd",
        "linear": {"x": 0.1, "y": 0.0, "z": 0.0},
        "angular": {"x": 0.0, "y": 0.0, "z": 0.0},
    }

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json(command)
        accepted = websocket.receive_json()
        websocket.send_json({**command, "seq": 2})
        rejected = websocket.receive_json()

    assert accepted["type"] == "teleop_ack"
    assert rejected["type"] == "runtime_error"
    assert rejected["detail"] == "Teleop command was rejected by runtime rate limit."
    assert len(gateway.commands) == 1
    record = audit_log.list_records()[0]
    assert record.channel == "websocket_teleop"
    assert record.status == "rejected"
    assert record.target == "/teleop_cmd"


def test_runtime_audit_endpoint_lists_recent_records() -> None:
    audit_log = InMemoryRuntimeAuditLog()
    audit_log.record(
        RuntimeAuditRecord(
            channel="websocket_teleop",
            detail="accepted for test",
            session_id="session-1",
            status="accepted",
            target="/teleop_cmd",
        )
    )
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            runtime_audit_log=audit_log,
        )
    )

    response = client.get("/api/v1/runtime/audit")

    assert response.status_code == 200
    assert response.json()["records"][0] | {"recorded_at": ""} == {
        "channel": "websocket_teleop",
        "detail": "accepted for test",
        "message_type": "",
        "payload_summary": {},
        "recorded_at": "",
        "session_id": "session-1",
        "status": "accepted",
        "target": "/teleop_cmd",
        "topic": "",
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


def test_runtime_recording_start_and_stop_use_configured_gateway() -> None:
    audit_log = InMemoryRuntimeAuditLog()
    gateway = RecordingRuntimeRecordingGateway()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            runtime_audit_log=audit_log,
            runtime_recording_gateway=gateway,
        )
    )

    start_response = client.post(
        "/api/v1/runtime/recordings",
        json={
            "topics": ["/teleop_cmd", "/teleop_cmd", "/joint_states"],
            "output_folder": "data/recordings",
            "label": "sandbox debug",
        },
    )
    stop_response = client.post("/api/v1/runtime/recordings/recording-1/stop")

    assert start_response.status_code == 200
    assert start_response.json() == {
        "detail": "Recording started.",
        "output_folder": "data/recordings",
        "recording_id": "recording-1",
        "status": "recording",
        "topics": ["/teleop_cmd", "/joint_states"],
    }
    assert stop_response.status_code == 200
    assert gateway.started_requests == [
        RuntimeRecordingRequest(
            label="sandbox debug",
            output_folder="data/recordings",
            topics=("/teleop_cmd", "/joint_states"),
        )
    ]
    assert gateway.stopped_recording_ids == ["recording-1"]
    assert audit_log.list_records()[1].channel == "runtime_recording"


def test_runtime_recording_rejects_unapproved_output_folders() -> None:
    audit_log = InMemoryRuntimeAuditLog()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            runtime_audit_log=audit_log,
        )
    )

    response = client.post(
        "/api/v1/runtime/recordings",
        json={"topics": ["/teleop_cmd"], "output_folder": "tmp"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Recording output folder is not allowed."}
    record = audit_log.list_records()[0]
    assert record.channel == "runtime_recording"
    assert record.status == "rejected"
    assert record.target == "tmp"


def test_runtime_recording_rejects_topics_outside_allowlist() -> None:
    audit_log = InMemoryRuntimeAuditLog()
    gateway = RecordingRuntimeRecordingGateway()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            runtime_audit_log=audit_log,
            runtime_recording_gateway=gateway,
        )
    )

    response = client.post(
        "/api/v1/runtime/recordings",
        json={"topics": ["/dangerous/topic"], "output_folder": "data/recordings"},
    )

    assert response.status_code == 403
    assert "recording topic '/dangerous/topic' is not allowed" in response.json()["detail"]
    assert gateway.started_requests == []
    record = audit_log.list_records()[0]
    assert record.channel == "runtime_recording"
    assert record.status == "rejected"
    assert record.topic == "/dangerous/topic"


def test_runtime_recording_reports_gateway_failures_as_service_unavailable() -> None:
    audit_log = InMemoryRuntimeAuditLog()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            runtime_audit_log=audit_log,
            runtime_recording_gateway=FailingRuntimeRecordingGateway(),
        )
    )

    response = client.post(
        "/api/v1/runtime/recordings",
        json={"topics": ["/teleop_cmd"], "output_folder": "data/recordings"},
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "ros2 executable is not available for rosbag recording"}
    record = audit_log.list_records()[0]
    assert record.channel == "runtime_recording"
    assert record.status == "rejected"


class ControlledClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now
