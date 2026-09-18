from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from apps.bloom_api.main import create_app
from apps.bloom_api.routes.runtime import audit_session_alias, build_runtime_ack
from apps.bloom_api.settings import Settings
from libs.config import (
    ConfigurationBundle,
    InMemoryConfigurationRepository,
    RuntimeActionPreset,
    load_configuration_file,
)
from libs.ros_adapters import RosPublishReceipt, RosPublishRequest
from libs.sessions import (
    InMemoryRuntimeAuditLog,
    RuntimeAuditRecord,
    RuntimeCommandRateLimiter,
    RuntimeRecordingReceipt,
    RuntimeRecordingRequest,
    RuntimeSessionManager,
    RuntimeTopicSample,
    RuntimeTopicSampleCallback,
    RuntimeTopicSubscription,
    RuntimeTopicSubscriptionHandle,
    TeleopCommand,
    TeleopPublishReceipt,
    TeleopVector3,
    parse_runtime_client_message,
)

EXPLORER_FIXTURE_PATH = Path(__file__).parents[1] / "seed" / "applications" / "explorer-user-tests.json"
BLOOM_DEBUG_FIXTURE_PATH = Path(__file__).parents[1] / "seed" / "applications" / "bloom-debug.json"


class MovableClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


class RecordingRosPublisherGateway:
    def __init__(self) -> None:
        self.requests: list[RosPublishRequest] = []

    def publish(self, request: RosPublishRequest) -> RosPublishReceipt:
        self.requests.append(request)
        return RosPublishReceipt(
            detail=f"Published {request.topic}.",
            message_type=request.message_type,
            status="published",
            topic=request.topic,
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


class FailingNeutralTeleopGateway(RecordingTeleopGateway):
    def publish(self, command: TeleopCommand) -> TeleopPublishReceipt:
        if command.linear == TeleopVector3() and command.angular == TeleopVector3():
            raise RuntimeError("neutral command could not reach ROS")
        return super().publish(command)


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


class MultiHandleTopicSubscriptionGateway:
    """One handle per subscribe, so a replaced subscription is observable."""

    def __init__(self) -> None:
        self.handles: list[RecordingTopicSubscriptionHandle] = []
        self.subscriptions: list[RuntimeTopicSubscription] = []

    def subscribe(
        self,
        subscription: RuntimeTopicSubscription,
        on_sample: RuntimeTopicSampleCallback,
    ) -> RecordingTopicSubscriptionHandle:
        self.subscriptions.append(subscription)
        handle = RecordingTopicSubscriptionHandle()
        self.handles.append(handle)
        return handle


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


def test_runtime_control_is_exclusive_and_requires_explicit_handover() -> None:
    gateway = RecordingTeleopGateway()
    app = create_app(
        Settings(environment="test", runtime_control_required=True),
        InMemoryConfigurationRepository(),
        teleop_command_gateway=gateway,
    )
    client = TestClient(app)
    command = {
        "type": "teleop_cmd",
        "angular": {"x": 0.0, "y": 0.0, "z": 0.0},
        "linear": {"x": 0.2, "y": 0.0, "z": 0.0},
        "mode": 3,
        "seq": 1,
        "target": "/joystick_cartesian_command",
    }

    with client.websocket_connect("/api/v1/runtime/ws") as owner:
        owner_connected = owner.receive_json()
        owner.send_json({"type": "claim_control"})
        assert owner.receive_json()["payload"]["is_owner"] is True

        with client.websocket_connect("/api/v1/runtime/ws") as waiting:
            waiting_connected = waiting.receive_json()
            waiting.send_json({"type": "claim_control"})
            blocked = waiting.receive_json()
            assert blocked["type"] == "control_state"
            assert blocked["payload"]["is_owner"] is False
            assert blocked["payload"]["owner_present"] is True

            waiting.send_json(command)
            rejected = waiting.receive_json()
            assert rejected["payload"]["code"] == "control_not_owned"
            assert gateway.commands == []

            owner.send_json(command)
            assert owner.receive_json()["type"] == "teleop_ack"
            owner.send_json({"type": "release_control"})
            released = owner.receive_json()
            assert released["payload"]["owner_present"] is False
            assert gateway.commands[-1].linear == TeleopVector3()

            waiting.send_json({"type": "claim_control"})
            claimed = waiting.receive_json()
            assert claimed["payload"]["is_owner"] is True
            assert claimed["session_id"] == waiting_connected["session_id"]

        assert owner_connected["session_id"] != waiting_connected["session_id"]


def test_a_silent_owner_is_displaced_and_the_next_operator_can_resume() -> None:
    # The owner's tablet drops off Wi-Fi with its socket open: without a
    # liveness rule, resume answered 409 until that socket finally died.
    clock = MovableClock()
    app = create_app(Settings(environment="test", runtime_control_required=True), InMemoryConfigurationRepository())
    app.state.runtime_session_manager = RuntimeSessionManager(lease_timeout_sec=10.0, clock=clock)
    client = TestClient(app)

    with client.websocket_connect("/api/v1/runtime/ws") as owner:
        owner.receive_json()
        owner.send_json({"type": "claim_control"})
        assert owner.receive_json()["payload"]["is_owner"] is True

        with client.websocket_connect("/api/v1/runtime/ws") as waiting:
            waiting_session = waiting.receive_json()["session_id"]
            # STOP never needs the lease, from either operator.
            assert client.post("/api/v1/runtime/stop").status_code == 200

            clock.now = 11.0
            waiting.send_json({"type": "claim_control"})

            assert waiting.receive_json()["payload"]["is_owner"] is True
            resumed = client.post("/api/v1/runtime/stop/resume", headers={"X-Bloom-Runtime-Session": waiting_session})
            assert resumed.status_code == 200


def test_an_idle_owner_that_keeps_pinging_is_not_displaced() -> None:
    clock = MovableClock()
    app = create_app(Settings(environment="test", runtime_control_required=True), InMemoryConfigurationRepository())
    app.state.runtime_session_manager = RuntimeSessionManager(lease_timeout_sec=10.0, clock=clock)
    client = TestClient(app)

    with client.websocket_connect("/api/v1/runtime/ws") as owner:
        owner.receive_json()
        owner.send_json({"type": "claim_control"})
        owner.receive_json()

        with client.websocket_connect("/api/v1/runtime/ws") as waiting:
            waiting_session = waiting.receive_json()["session_id"]
            for tick in (3.0, 6.0, 9.0, 12.0):
                clock.now = tick
                owner.send_json({"type": "ping"})
                assert owner.receive_json()["type"] == "pong"

            waiting.send_json({"type": "claim_control"})

            assert waiting.receive_json()["payload"]["is_owner"] is False
            refused = client.post("/api/v1/runtime/stop/resume", headers={"X-Bloom-Runtime-Session": waiting_session})
            assert refused.status_code == 409


def test_robot_facing_http_commands_require_the_control_owner_session() -> None:
    gateway = RecordingRosPublisherGateway()
    app = create_app(
        Settings(environment="test", runtime_control_required=True),
        InMemoryConfigurationRepository(),
        ros_publisher_gateway=gateway,
    )
    client = TestClient(app)
    request = {
        "message_type": "std_msgs/msg/Int32",
        "payload": {"data": 3},
        "topic": "/cmd/mode",
    }

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        connected = websocket.receive_json()
        websocket.send_json({"type": "claim_control"})
        websocket.receive_json()

        assert client.post("/api/v1/ros/topics/publish", json=request).status_code == 409
        response = client.post(
            "/api/v1/ros/topics/publish",
            headers={"X-Bloom-Runtime-Session": connected["session_id"]},
            json=request,
        )
        assert response.status_code == 200

        observer = client.get("/api/v1/runtime/control").json()
        owner = client.get(
            "/api/v1/runtime/control",
            headers={"X-Bloom-Runtime-Session": connected["session_id"]},
        ).json()
        assert observer["active_sessions"] == 1
        assert observer["is_owner"] is False
        assert observer["owner_present"] is True
        assert observer["session_id"] == ""
        assert owner["is_owner"] is True

        # STOP stays available without the lease; only resume is owner-only.
        assert client.post("/api/v1/runtime/stop").status_code == 200
        assert client.post("/api/v1/runtime/stop/resume").status_code == 409
        assert (
            client.post(
                "/api/v1/runtime/stop/resume",
                headers={"X-Bloom-Runtime-Session": connected["session_id"]},
            ).status_code
            == 200
        )


def test_disconnect_latches_stop_when_the_owner_cannot_be_neutralized() -> None:
    gateway = FailingNeutralTeleopGateway()
    app = create_app(
        Settings(environment="test", runtime_control_required=True),
        InMemoryConfigurationRepository(),
        teleop_command_gateway=gateway,
    )
    client = TestClient(app)

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json({"type": "claim_control"})
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "teleop_cmd",
                "angular": {"x": 0.0, "y": 0.0, "z": 0.0},
                "linear": {"x": 0.2, "y": 0.0, "z": 0.0},
                "mode": 3,
                "seq": 1,
                "target": "/joystick_cartesian_command",
            }
        )
        assert websocket.receive_json()["type"] == "teleop_ack"

    state = client.get("/api/v1/runtime/stop").json()
    assert state["stopped"] is True
    assert state["asserted"] is False
    assert app.state.runtime_session_manager.control_snapshot().owner_present is False


def test_failed_explicit_release_latches_stop_and_relinquishes_control() -> None:
    gateway = FailingNeutralTeleopGateway()
    app = create_app(
        Settings(environment="test", runtime_control_required=True),
        InMemoryConfigurationRepository(),
        teleop_command_gateway=gateway,
    )
    client = TestClient(app)

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json({"type": "claim_control"})
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "teleop_cmd",
                "angular": {"x": 0.0, "y": 0.0, "z": 0.0},
                "linear": {"x": 0.2, "y": 0.0, "z": 0.0},
                "mode": 3,
                "seq": 1,
                "target": "/joystick_cartesian_command",
            }
        )
        websocket.receive_json()
        websocket.send_json({"type": "release_control"})
        error = websocket.receive_json()

        assert error["payload"]["code"] == "control_release_failed"
        assert error["payload"]["is_owner"] is False
        assert error["payload"]["owner_present"] is False
        assert error["payload"]["session_id"] == error["session_id"]
        assert app.state.runtime_stop_controller.state.stopped is True
        assert app.state.runtime_session_manager.control_snapshot().owner_present is False


def test_release_zeros_a_nondefault_target_even_when_stop_is_already_latched() -> None:
    gateway = RecordingTeleopGateway()
    app = create_app(
        Settings(environment="test", runtime_control_required=True),
        InMemoryConfigurationRepository(),
        teleop_command_gateway=gateway,
    )
    client = TestClient(app)

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json({"type": "claim_control"})
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "teleop_cmd",
                "angular": {"x": 0.0, "y": 0.0, "z": 0.0},
                "linear": {"x": 0.2, "y": 0.0, "z": 0.0},
                "mode": 3,
                "seq": 1,
                "target": "/teleop_cmd",
            }
        )
        websocket.receive_json()
        client.post("/api/v1/runtime/stop")
        websocket.send_json({"type": "release_control"})
        assert websocket.receive_json()["type"] == "control_state"

    assert gateway.commands[-1].target == "/teleop_cmd"
    assert gateway.commands[-1].linear == TeleopVector3()
    assert gateway.commands[-1].angular == TeleopVector3()


def test_runtime_websocket_accepts_topic_subscriptions() -> None:
    client = TestClient(create_app(Settings(environment="test"), InMemoryConfigurationRepository()))

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        connected = websocket.receive_json()
        websocket.send_json(
            {
                "type": "subscribe_topic",
                "field_path": "data",
                "message_type": "std_msgs/msg/Float64",
                "topic": "/cartesian_command",
                "widget_id": "velocity-plot",
            }
        )
        response = websocket.receive_json()

    # No ROS here, so the subscription is accepted but can never deliver. Saying
    # "Subscribed" would leave the widget on "Waiting for messages..." forever,
    # looking exactly like a robot that has not started publishing yet.
    assert response == {
        "type": "subscription_ack",
        "active_sessions": None,
        "detail": "Accepted /cartesian_command, but no ROS subscriber is connected, so no samples will arrive.",
        "payload": {
            "field_path": "data",
            "live": False,
            "message_type": "std_msgs/msg/Float64",
            "topic": "/cartesian_command",
            "widget_id": "velocity-plot",
        },
        "session_id": connected["session_id"],
    }


def test_resubscribing_a_widget_replaces_its_subscription() -> None:
    # A screen resubscribes whenever the socket reconnects. Stacking a second
    # subscription on the same topic would double every sample and leak the
    # first one for the life of the session.
    gateway = MultiHandleTopicSubscriptionGateway()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            runtime_topic_subscription_gateway=gateway,
        )
    )
    request = {
        "type": "subscribe_topic",
        "field_path": "data",
        "message_type": "std_msgs/msg/Float64",
        "topic": "/cmd/max_velocity",
        "widget_id": "max-velocity-echo",
    }

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json(request)
        websocket.receive_json()
        websocket.send_json(request)
        websocket.receive_json()

    assert len(gateway.handles) == 2
    # The first is closed the moment the second replaces it; both are closed
    # when the session ends.
    assert [handle.closed for handle in gateway.handles] == [True, True]


def test_unsubscribing_closes_the_subscription_a_screen_no_longer_shows() -> None:
    gateway = MultiHandleTopicSubscriptionGateway()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            runtime_topic_subscription_gateway=gateway,
        )
    )
    subscription = {"topic": "/cartesian_command", "widget_id": "feedback-plot:/cartesian_command"}

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json({"type": "subscribe_topic", **subscription})
        websocket.receive_json()
        websocket.send_json({"type": "unsubscribe_topic", **subscription})
        removed = websocket.receive_json()
        closed_while_connected = gateway.handles[0].closed
        websocket.send_json({"type": "unsubscribe_topic", **subscription})
        missing = websocket.receive_json()

    assert removed["type"] == "unsubscription_ack"
    assert removed["payload"] == {"removed": True, **subscription}
    assert closed_while_connected is True
    assert missing["payload"]["removed"] is False


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
            "frame_id": "",
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
    assert response["payload"]["target"] == "/joystick_cartesian_command"


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
            Settings(environment="test"),
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


def test_runtime_websocket_never_rate_limits_an_explicit_zero() -> None:
    clock = ControlledClock()
    gateway = RecordingTeleopGateway()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            runtime_command_rate_limiter=RuntimeCommandRateLimiter(max_commands_per_second=1, clock=clock),
            teleop_command_gateway=gateway,
        )
    )
    moving_command = {
        "type": "teleop_cmd",
        "mode": 4,
        "seq": 1,
        "target": "/teleop_cmd",
        "linear": {"x": 0.1, "y": 0.0, "z": 0.0},
        "angular": {"x": 0.0, "y": 0.0, "z": 0.0},
    }

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json(moving_command)
        assert websocket.receive_json()["type"] == "teleop_ack"
        websocket.send_json(
            {
                **moving_command,
                "seq": 2,
                "linear": {"x": 0.0, "y": 0.0, "z": 0.0},
            }
        )
        zero_ack = websocket.receive_json()

    assert zero_ack["type"] == "teleop_ack"
    assert len(gateway.commands) == 2
    assert gateway.commands[-1].linear.x == 0


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
        "repeats": 1,
        "session_id": audit_session_alias("session-1"),
        "status": "accepted",
        "target": "/teleop_cmd",
        "topic": "",
    }


def test_runtime_action_dispatches_saved_explorer_adapters_through_ros_policy() -> None:
    audit_log = InMemoryRuntimeAuditLog()
    gateway = RecordingRosPublisherGateway()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository({"explorer-user-tests": load_configuration_file(EXPLORER_FIXTURE_PATH)}),
            ros_publisher_gateway=gateway,
            runtime_audit_log=audit_log,
        )
    )

    expected_requests = [
        ("explorer.deploy", "/ui/robot_action", "std_msgs/msg/String", {"data": "deploy"}),
        ("explorer.repli", "/ui/robot_action", "std_msgs/msg/String", {"data": "repli"}),
        ("explorer.pose.load.home", "/ui/load_pose", "std_msgs/msg/String", {"data": "home"}),
        ("explorer.favorite.mode.both", "/cmd/mode", "std_msgs/msg/Int32", {"data": 3}),
        ("close_gripper", "/gripper_controller/commands", "std_msgs/msg/Float64MultiArray", {"data": [0.8]}),
    ]

    responses = [
        client.post(
            "/api/v1/runtime/actions",
            json={
                "app_id": "explorer-user-tests",
                "command": command,
                "config_id": "explorer-user-tests",
            },
        )
        for command, _, _, _ in expected_requests
    ]

    assert [response.status_code for response in responses] == [200, 200, 200, 200, 200]
    assert [(request.topic, request.message_type, request.payload) for request in gateway.requests] == [
        (topic, message_type, payload) for _, topic, message_type, payload in expected_requests
    ]
    assert responses[0].json() | {"detail": ""} == {
        "app_id": "explorer-user-tests",
        "command": "explorer.deploy",
        "config_id": "explorer-user-tests",
        "detail": "",
        "message_type": "std_msgs/msg/String",
        "preset_id": "explorer-deploy",
        "status": "published",
        "topic": "/ui/robot_action",
    }
    assert all(record.channel == "http_ros_publish" for record in audit_log.list_records())


def test_runtime_action_dispatch_can_resolve_by_preset_id() -> None:
    gateway = RecordingRosPublisherGateway()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository({"explorer-user-tests": load_configuration_file(EXPLORER_FIXTURE_PATH)}),
            ros_publisher_gateway=gateway,
        )
    )

    response = client.post(
        "/api/v1/runtime/actions",
        json={
            "app_id": "explorer-user-tests",
            "config_id": "explorer-user-tests",
            "preset_id": "explorer-pose-load-meal",
        },
    )

    assert response.status_code == 200
    assert response.json()["command"] == "explorer.pose.load.meal"
    assert gateway.requests == [
        RosPublishRequest(
            message_type="std_msgs/msg/String",
            payload={"data": "meal"},
            topic="/ui/load_pose",
        )
    ]


def test_runtime_action_dispatch_rejects_commands_not_backed_by_saved_presets() -> None:
    gateway = RecordingRosPublisherGateway()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository({"explorer-user-tests": load_configuration_file(EXPLORER_FIXTURE_PATH)}),
            ros_publisher_gateway=gateway,
        )
    )

    response = client.post(
        "/api/v1/runtime/actions",
        json={
            "app_id": "explorer-user-tests",
            "command": "explorer.unsaved.command",
            "config_id": "explorer-user-tests",
        },
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "runtime action preset not found"}
    assert gateway.requests == []


def test_runtime_action_dispatch_rejects_app_policy_before_ros_publish() -> None:
    audit_log = InMemoryRuntimeAuditLog()
    gateway = RecordingRosPublisherGateway()
    bundle = load_configuration_file(EXPLORER_FIXTURE_PATH)
    application = bundle.applications[0].model_copy(
        update={
            "action_presets": bundle.applications[0].action_presets
            + (
                RuntimeActionPreset(
                    command="explorer.policy.escape",
                    id="explorer-policy-escape",
                    message_type="std_msgs/msg/String",
                    name="Policy escape",
                    payload_text="{data: 'escape'}",
                    topic="/dangerous/topic",
                ),
            )
        }
    )
    blocked_bundle = ConfigurationBundle(metadata=bundle.metadata, applications=(application,))
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository({"explorer-user-tests": blocked_bundle}),
            ros_publisher_gateway=gateway,
            runtime_audit_log=audit_log,
        )
    )

    response = client.post(
        "/api/v1/runtime/actions",
        json={
            "app_id": "explorer-user-tests",
            "command": "explorer.policy.escape",
            "config_id": "explorer-user-tests",
        },
    )

    assert response.status_code == 403
    assert "ROS topic '/dangerous/topic' is not allowed" in response.json()["detail"]
    assert gateway.requests == []
    record = audit_log.list_records()[0]
    assert record.channel == "runtime_action"
    assert record.status == "rejected"
    assert record.target == "explorer.policy.escape"


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


def test_a_live_subscription_says_it_is_live() -> None:
    """The counterpart: with a real gateway the ack must not warn."""
    gateway = RecordingTopicSubscriptionGateway()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            runtime_topic_subscription_gateway=gateway,
        )
    )

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "subscribe_topic",
                "field_path": "data",
                "message_type": "std_msgs/msg/Float64",
                "topic": "/cartesian_command",
                "widget_id": "velocity-plot",
            }
        )
        response = websocket.receive_json()

    assert response["payload"]["live"] is True
    assert response["detail"] == "Subscribed to /cartesian_command."


def test_a_teleop_stream_is_one_audit_record_with_a_count() -> None:
    audit_log = InMemoryRuntimeAuditLog(max_records=5)
    audit_log.record(RuntimeAuditRecord(channel="runtime_stop", detail="Runtime stop engaged.", status="accepted"))
    for _ in range(900):
        audit_log.record(
            RuntimeAuditRecord(
                channel="websocket_teleop",
                detail="Cartesian command published in frame 'base_link'.",
                session_id="session-1",
                status="accepted",
                target="/joystick_cartesian_command",
            )
        )

    stream, stop = audit_log.list_records()

    assert (stream.channel, stream.repeats) == ("websocket_teleop", 900)
    assert stop.channel == "runtime_stop"


def teleop_command(target: str = "/joystick_cartesian_command") -> dict:
    return {
        "type": "teleop_cmd",
        "angular": {"x": 0.0, "y": 0.0, "z": 0.0},
        "linear": {"x": 0.2, "y": 0.0, "z": 0.0},
        "mode": 3,
        "seq": 1,
        "target": target,
    }


def test_an_app_that_allows_no_teleop_target_cannot_stream_teleop() -> None:
    # Bloom Debug and the webcam app declare allowed_teleop_targets: [], and
    # the socket used to know only the deployment-wide policy.
    gateway = RecordingTeleopGateway()
    bundle = load_configuration_file(BLOOM_DEBUG_FIXTURE_PATH)
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository({"bloom-debug": bundle}),
            teleop_command_gateway=gateway,
        )
    )

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json({"type": "app_context", "app_id": "bloom-debug", "config_id": "bloom-debug"})
        acknowledged = websocket.receive_json()
        websocket.send_json(teleop_command())
        refused = websocket.receive_json()

    assert acknowledged["type"] == "app_context_ack"
    assert acknowledged["payload"]["allowed_teleop_targets"] == []
    assert refused["type"] == "runtime_error"
    assert "not allowed by the runtime policy" in refused["payload"]["message"]
    assert gateway.commands == []


def test_an_app_keeps_the_teleop_target_it_declares() -> None:
    gateway = RecordingTeleopGateway()
    bundle = load_configuration_file(EXPLORER_FIXTURE_PATH)
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository({"explorer": bundle}),
            teleop_command_gateway=gateway,
        )
    )

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json({"type": "app_context", "app_id": "explorer-user-tests", "config_id": "explorer"})
        websocket.receive_json()
        websocket.send_json(teleop_command())
        acknowledged = websocket.receive_json()

    assert acknowledged["type"] == "teleop_ack"
    assert [command.target for command in gateway.commands] == ["/joystick_cartesian_command"]


def test_a_socket_that_names_no_app_keeps_the_deployment_policy() -> None:
    gateway = RecordingTeleopGateway()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            teleop_command_gateway=gateway,
        )
    )

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json(teleop_command())
        acknowledged = websocket.receive_json()

    assert acknowledged["type"] == "teleop_ack"
    assert len(gateway.commands) == 1


def test_an_unknown_app_context_is_refused_and_changes_nothing() -> None:
    gateway = RecordingTeleopGateway()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            teleop_command_gateway=gateway,
        )
    )

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json({"type": "app_context", "app_id": "nowhere", "config_id": "nowhere"})
        refused = websocket.receive_json()
        websocket.send_json(teleop_command())
        acknowledged = websocket.receive_json()

    assert refused["payload"]["code"] == "app_context_unknown"
    assert acknowledged["type"] == "teleop_ack"


def test_the_backend_refuses_more_sessions_than_it_serves() -> None:
    # The 64-subscription cap is per session, so unbounded sessions were
    # unbounded subscriptions: a connect loop exhausted memory and ROS.
    client = TestClient(create_app(Settings(environment="test"), InMemoryConfigurationRepository()))
    manager = RuntimeSessionManager(max_sessions=2)
    client.app.state.runtime_session_manager = manager

    with client.websocket_connect("/api/v1/runtime/ws") as first:
        first.receive_json()
        with client.websocket_connect("/api/v1/runtime/ws") as second:
            second.receive_json()
            with client.websocket_connect("/api/v1/runtime/ws") as refused:
                reply = refused.receive_json()
                assert reply["type"] == "runtime_error"
                assert reply["payload"]["code"] == "session_limit"
                assert "Close a Bloom tab" in reply["payload"]["message"]
                with pytest.raises(WebSocketDisconnect):
                    refused.receive_json()

            # A refused connection registers nothing, so the seats it could not take stay free.
            assert manager.active_session_count == 2

    assert manager.active_session_count == 0
    with client.websocket_connect("/api/v1/runtime/ws") as reconnected:
        assert reconnected.receive_json()["type"] == "session_connected"


def test_a_session_cannot_hold_unbounded_topic_subscriptions() -> None:
    handles: dict = {}

    class Handle:
        def close(self) -> None:
            pass

    class Gateway:
        def subscribe(self, subscription, on_sample):
            return Handle()

    def subscribe(widget_id: str):
        message = parse_runtime_client_message(
            {"type": "subscribe_topic", "topic": "/joint_states", "widget_id": widget_id}
        )
        return build_runtime_ack(
            "s",
            message,
            topic_subscription_gateway=Gateway(),
            on_topic_sample=lambda sample: None,
            topic_subscription_handles=handles,
        )

    replies = [subscribe(f"widget-{index}").type for index in range(70)]

    assert replies.count("subscription_ack") == 64
    assert len(handles) == 64
    assert subscribe("widget-0").type == "subscription_ack"


def test_a_lease_that_moved_on_still_closes_the_sockets_subscriptions() -> None:
    """A handover that fails mid-release must not strand rclpy subscriptions for the life of the process."""

    class MovedOnManager(RuntimeSessionManager):
        def wait_for_control_operations(self, session: object) -> None:
            raise ValueError("Runtime session is not releasing robot control.")

    gateway = MultiHandleTopicSubscriptionGateway()
    app = create_app(
        Settings(environment="test", runtime_control_required=True),
        InMemoryConfigurationRepository(),
        runtime_topic_subscription_gateway=gateway,
    )
    app.state.runtime_session_manager = MovedOnManager()
    client = TestClient(app)

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json({"type": "claim_control"})
        websocket.receive_json()
        for index, topic in enumerate(("/ee_pose", "/joint_states", "/ee_jac")):
            websocket.send_json(
                {
                    "type": "subscribe_topic",
                    "field_path": "data",
                    "message_type": "std_msgs/msg/Float64",
                    "topic": topic,
                    "widget_id": f"widget-{index}",
                }
            )
            websocket.receive_json()

    assert len(gateway.handles) == 3
    assert [handle.closed for handle in gateway.handles] == [True, True, True]
    assert app.state.runtime_session_manager.control_snapshot().owner_present is False


def test_one_bad_frame_is_answered_rather_than_ending_the_session() -> None:
    """A stray frame from a reconnecting client must not cost the operator their lease and telemetry."""
    client = TestClient(create_app(Settings(environment="test"), InMemoryConfigurationRepository()))

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        connected = websocket.receive_json()
        websocket.send_text("not json at all")
        error = websocket.receive_json()

        assert error["type"] == "runtime_error"
        assert error["detail"] == "Invalid runtime message."

        # The socket is still the same session, and still usable.
        websocket.send_json({"type": "ping"})
        pong = websocket.receive_json()
        assert pong["type"] == "pong"
        assert pong["session_id"] == connected["session_id"]
