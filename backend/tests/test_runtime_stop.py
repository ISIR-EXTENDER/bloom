"""The runtime STOP latch: engage, assert toward the robot, outrank every path."""

import base64
from pathlib import Path
from threading import Event, Thread

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository, load_configuration_file
from libs.ros_adapters import RosPublishReceipt, RosPublishRequest
from libs.sessions import (
    CANCEL_MODE_REQUEST,
    InMemoryRuntimeAuditLog,
    RuntimeStopAssertionError,
    RuntimeStopController,
    RuntimeStoppedError,
    TeleopCommand,
    TeleopPublishReceipt,
    TeleopVector3,
)

JPEG_MARKERS = b"\xff\xd8\xff\xd9"
EXPLORER_FIXTURE_PATH = Path(__file__).parents[1] / "seed" / "applications" / "explorer-manager.json"


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
        raise RuntimeError("rclpy is required to publish Cartesian commands")


class FailingRosPublisherGateway:
    def publish(self, request: RosPublishRequest) -> RosPublishReceipt:
        raise RuntimeError("rclpy is required to publish ROS messages")


class BlockingStopTeleopGateway:
    def __init__(self) -> None:
        self.publish_started = Event()
        self.release_publish = Event()

    def publish(self, command: TeleopCommand) -> TeleopPublishReceipt:
        self.publish_started.set()
        assert self.release_publish.wait(timeout=2)
        return TeleopPublishReceipt(detail="Zero command recorded.", status="accepted", target=command.target)


class StopAtFinalGate:
    def rejection_reason(self) -> None:
        return None

    def execute_if_running(self, operation):
        raise RuntimeStoppedError("Runtime stop engaged during command validation.")


def create_stop_test_client(
    teleop_gateway: RecordingTeleopGateway | FailingTeleopGateway | None = None,
    ros_publisher_gateway: RecordingRosPublisherGateway | FailingRosPublisherGateway | None = None,
    audit_log: InMemoryRuntimeAuditLog | None = None,
) -> TestClient:
    return TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository({"explorer-manager": load_configuration_file(EXPLORER_FIXTURE_PATH)}),
            ros_publisher_gateway=ros_publisher_gateway,
            runtime_audit_log=audit_log,
            teleop_command_gateway=teleop_gateway,
        )
    )


def test_stop_state_starts_not_engaged() -> None:
    client = create_stop_test_client()

    response = client.get("/api/v1/runtime/stop")

    assert response.status_code == 200
    assert response.json() == {
        "stopped": False,
        "asserted": False,
        "engaged_at": "",
        "detail": "Runtime stop is not engaged.",
        "simulated": False,
    }


def test_engaging_stop_publishes_zero_twist_and_joint_target_cancel() -> None:
    teleop_gateway = RecordingTeleopGateway()
    ros_gateway = RecordingRosPublisherGateway()
    client = create_stop_test_client(teleop_gateway, ros_gateway)

    response = client.post("/api/v1/runtime/stop")

    assert response.status_code == 200
    body = response.json()
    assert body["stopped"] is True
    assert body["asserted"] is True
    assert body["engaged_at"] != ""

    # Every accepted target is zeroed: the latch cannot know which one a session was driving.
    assert [command.target for command in teleop_gateway.commands] == [
        "/joystick_cartesian_command",
    ]
    for zero_command in teleop_gateway.commands:
        assert (zero_command.linear.x, zero_command.linear.y, zero_command.linear.z) == (0.0, 0.0, 0.0)
        assert (zero_command.angular.x, zero_command.angular.y, zero_command.angular.z) == (0.0, 0.0, 0.0)

    # behaviour/passthrough is the manager's own joint-target cancel, geometric/both undoes a held Snake; the
    # servoing node keeps commanding while its switch is on, so STOP turns it off too.
    [cancel_request, shaping_reset, servo_off] = ros_gateway.requests
    assert cancel_request.topic == "/mode_request"
    assert cancel_request.message_type == "std_msgs/msg/String"
    assert cancel_request.payload == {"data": CANCEL_MODE_REQUEST}
    assert shaping_reset.topic == "/mode_request"
    assert shaping_reset.payload == {"data": "geometric/both"}
    assert servo_off.topic == "/ui/visual_servoing/on"
    assert servo_off.message_type == "std_msgs/msg/Bool"
    assert servo_off.payload == {"data": False}


def test_stop_zeros_the_legacy_teleop_topic_on_the_teleop_command_backend() -> None:
    # The rollback backend is opt-in now: its target left the defaults with the
    # Sandbox and Petanque rebases, so a lab reviving it names it explicitly.
    teleop_gateway = RecordingTeleopGateway()
    client = TestClient(
        create_app(
            Settings(
                environment="test",
                ros_command_backend="teleop_command",
                allowed_teleop_targets=("/teleop_cmd", "/joystick_cartesian_command"),
            ),
            InMemoryConfigurationRepository(),
            ros_publisher_gateway=RecordingRosPublisherGateway(),
            teleop_command_gateway=teleop_gateway,
        )
    )

    assert client.post("/api/v1/runtime/stop").status_code == 200
    assert [command.target for command in teleop_gateway.commands] == ["/teleop_cmd", "/joystick_cartesian_command"]


def test_camera_frames_are_refused_while_stopped() -> None:
    published: list[str] = []

    class RecordingCameraGateway:
        def publish(self, topic, frame, frame_id):
            published.append(topic)

    client = TestClient(
        create_app(
            Settings(environment="test", allowed_ros_publish_topics=("/ui/camera/compressed",)),
            InMemoryConfigurationRepository(),
        )
    )
    client.app.state.camera_frame_gateway = RecordingCameraGateway()
    frame = "data:image/jpeg;base64," + base64.b64encode(JPEG_MARKERS * 16).decode("ascii")
    request = {"topic": "/ui/camera/compressed", "image_data_url": frame, "frame_id": "tablet"}

    client.post("/api/v1/runtime/stop")
    refused = client.post("/api/v1/runtime/camera-frames", json=request)
    client.post("/api/v1/runtime/stop/resume")
    accepted = client.post("/api/v1/runtime/camera-frames", json=request)

    assert (refused.status_code, accepted.status_code) == (409, 200)
    assert published == ["/ui/camera/compressed"]


def test_stop_latches_even_when_every_publish_fails() -> None:
    client = create_stop_test_client(FailingTeleopGateway(), FailingRosPublisherGateway())

    response = client.post("/api/v1/runtime/stop")

    assert response.status_code == 503
    # The body carries the whole state, so a client can tell a latched-but-unasserted STOP from a refused one.
    body = response.json()["detail"]
    assert body["stopped"] is True
    assert body["asserted"] is False
    assert "ROS assertion failed" in body["detail"]

    state = client.get("/api/v1/runtime/stop").json()
    assert state["stopped"] is True
    assert state["asserted"] is False
    assert "Zero velocity could not be published" in state["detail"]
    assert "Joint-target cancel could not be published" in state["detail"]


class InvalidHandleTeleopGateway:
    """rclpy raises its own errors, not RuntimeError, when a publisher handle is stale."""

    def publish(self, command: TeleopCommand) -> TeleopPublishReceipt:
        raise ValueError("publisher handle is invalid")


def test_a_gateway_error_that_is_not_a_runtime_error_still_cancels_the_joint_target() -> None:
    ros_gateway = RecordingRosPublisherGateway()
    client = create_stop_test_client(InvalidHandleTeleopGateway(), ros_gateway)

    response = client.post("/api/v1/runtime/stop")

    assert response.status_code == 503
    assert response.json()["detail"]["stopped"] is True
    # The cancel still went out: a joint-target move must not keep running because the zero failed.
    assert [request.payload for request in ros_gateway.requests] == [
        {"data": CANCEL_MODE_REQUEST},
        {"data": "geometric/both"},
        {"data": False},
    ]


def test_engaging_stop_twice_reasserts_instead_of_failing() -> None:
    teleop_gateway = RecordingTeleopGateway()
    ros_gateway = RecordingRosPublisherGateway()
    client = create_stop_test_client(teleop_gateway, ros_gateway)

    first = client.post("/api/v1/runtime/stop")
    second = client.post("/api/v1/runtime/stop")

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["stopped"] is True
    # Each accepted teleop target is zeroed once per engage; cancel, shaping reset and servo-off go out each time.
    assert len(teleop_gateway.commands) == 2
    assert len(ros_gateway.requests) == 6


def test_teleop_is_rejected_while_stopped_and_accepted_after_resume() -> None:
    teleop_gateway = RecordingTeleopGateway()
    client = create_stop_test_client(teleop_gateway, RecordingRosPublisherGateway())
    client.post("/api/v1/runtime/stop")
    commands_after_engage = len(teleop_gateway.commands)

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "teleop_cmd",
                "linear": {"x": 0.4, "y": 0.0, "z": 0.0},
                "angular": {"x": 0.0, "y": 0.0, "z": 0.0},
                "seq": 1,
            }
        )
        rejection = websocket.receive_json()

        assert rejection["type"] == "runtime_error"
        assert rejection["payload"]["code"] == "runtime_stopped"
        assert len(teleop_gateway.commands) == commands_after_engage

        client.post("/api/v1/runtime/stop/resume")
        websocket.send_json(
            {
                "type": "teleop_cmd",
                "linear": {"x": 0.4, "y": 0.0, "z": 0.0},
                "angular": {"x": 0.0, "y": 0.0, "z": 0.0},
                "seq": 2,
            }
        )
        acceptance = websocket.receive_json()

        assert acceptance["type"] == "teleop_ack"
        assert len(teleop_gateway.commands) == commands_after_engage + 1


def test_runtime_actions_are_rejected_while_stopped() -> None:
    ros_gateway = RecordingRosPublisherGateway()
    client = create_stop_test_client(RecordingTeleopGateway(), ros_gateway)
    client.post("/api/v1/runtime/stop")
    requests_after_engage = len(ros_gateway.requests)

    response = client.post(
        "/api/v1/runtime/actions",
        json={
            "app_id": "explorer-manager",
            "command": "behaviour/passthrough",
            "config_id": "explorer-manager",
        },
    )

    assert response.status_code == 409
    assert "stop" in response.json()["detail"].lower()
    assert len(ros_gateway.requests) == requests_after_engage


def test_generic_ros_publish_is_rejected_while_stopped() -> None:
    ros_gateway = RecordingRosPublisherGateway()
    client = create_stop_test_client(RecordingTeleopGateway(), ros_gateway)
    client.post("/api/v1/runtime/stop")
    requests_after_engage = len(ros_gateway.requests)

    response = client.post(
        "/api/v1/ros/topics/publish",
        json={
            "topic": "/mode_request",
            "message_type": "std_msgs/msg/String",
            "payload": {"data": "behaviour/joint_target/home"},
        },
    )

    assert response.status_code == 409
    assert len(ros_gateway.requests) == requests_after_engage


def test_a_topic_name_ros_refuses_is_a_clear_422() -> None:
    client = create_stop_test_client(RecordingTeleopGateway(), RecordingRosPublisherGateway())

    response = client.post(
        "/api/v1/ros/topics/publish",
        json={"topic": "/ui/my-toggle", "message_type": "std_msgs/msg/Bool", "payload": {"data": True}},
    )

    assert response.status_code == 422
    assert "not a valid name" in response.text


def test_stop_zeros_a_target_granted_through_a_namespace_entry() -> None:
    # "/ui/" lets a session drive /ui/arm_twist, but a namespace is no topic to zero: STOP skipped it.
    gateway = RecordingTeleopGateway()
    client = TestClient(
        create_app(
            Settings(environment="test", allowed_teleop_targets=("/joystick_cartesian_command", "/ui/")),
            InMemoryConfigurationRepository(),
            teleop_command_gateway=gateway,
        )
    )

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "teleop_cmd",
                "angular": {"x": 0.0, "y": 0.0, "z": 0.0},
                "linear": {"x": 0.4, "y": 0.0, "z": 0.0},
                "mode": 0,
                "seq": 1,
                "target": "/ui/arm_twist",
            }
        )
        assert websocket.receive_json()["type"] == "teleop_ack"
        client.post("/api/v1/runtime/stop")
        zeroed = [command.target for command in gateway.commands if command.linear == TeleopVector3()]

    assert "/ui/arm_twist" in zeroed


def test_a_runtime_widget_publishes_only_what_its_app_allows() -> None:
    # The HTTP route checked the deployment only: an app that does not list a topic could still publish to it.
    ros_gateway = RecordingRosPublisherGateway()
    client = create_stop_test_client(RecordingTeleopGateway(), ros_gateway)
    message = {"topic": "/ui/lamp", "message_type": "std_msgs/msg/Bool", "payload": {"data": True}}

    scoped = client.post(
        "/api/v1/ros/topics/publish", json={**message, "config_id": "explorer-manager", "app_id": "explorer-manager"}
    )
    unknown = client.post(
        "/api/v1/ros/topics/publish", json={**message, "config_id": "explorer-manager", "app_id": "x"}
    )
    deployment = client.post("/api/v1/ros/topics/publish", json=message)

    assert scoped.status_code == 403
    assert unknown.status_code == 404
    assert deployment.status_code == 200


def test_resume_clears_the_latch_and_publishes_nothing() -> None:
    teleop_gateway = RecordingTeleopGateway()
    ros_gateway = RecordingRosPublisherGateway()
    client = create_stop_test_client(teleop_gateway, ros_gateway)
    client.post("/api/v1/runtime/stop")
    commands_after_engage = len(teleop_gateway.commands)
    requests_after_engage = len(ros_gateway.requests)

    response = client.post("/api/v1/runtime/stop/resume")

    assert response.status_code == 200
    assert response.json() == {
        "stopped": False,
        "asserted": False,
        "engaged_at": "",
        "detail": "Runtime stop is not engaged.",
        "simulated": False,
    }
    assert len(teleop_gateway.commands) == commands_after_engage
    assert len(ros_gateway.requests) == requests_after_engage


def test_stop_transitions_are_audited() -> None:
    audit_log = InMemoryRuntimeAuditLog()
    client = create_stop_test_client(RecordingTeleopGateway(), RecordingRosPublisherGateway(), audit_log)

    client.post("/api/v1/runtime/stop")
    client.post("/api/v1/runtime/stop/resume")

    stop_records = [record for record in audit_log.list_records() if record.channel == "runtime_stop"]
    assert [record.status for record in stop_records] == ["accepted", "accepted"]
    assert "resumed" in stop_records[0].detail
    assert "engaged" in stop_records[1].detail


def test_controller_engage_survives_publish_failures_without_http() -> None:
    controller = RuntimeStopController(FailingTeleopGateway(), FailingRosPublisherGateway())

    with pytest.raises(RuntimeStopAssertionError) as error:
        controller.engage()

    state = error.value.state
    assert state.stopped is True
    assert state.asserted is False
    assert controller.rejection_reason() is not None
    assert controller.resume().stopped is False
    assert controller.rejection_reason() is None


def test_command_gate_rejects_a_command_waiting_behind_stop_assertion() -> None:
    teleop_gateway = BlockingStopTeleopGateway()
    controller = RuntimeStopController(teleop_gateway, RecordingRosPublisherGateway())
    stop_finished = Event()
    command_executed = Event()
    command_rejected = Event()

    def engage() -> None:
        controller.engage()
        stop_finished.set()

    def command() -> None:
        try:
            controller.execute_if_running(command_executed.set)
        except RuntimeStoppedError:
            command_rejected.set()

    stop_thread = Thread(target=engage)
    stop_thread.start()
    assert teleop_gateway.publish_started.wait(timeout=2)

    command_thread = Thread(target=command)
    command_thread.start()
    assert not command_executed.wait(timeout=0.05)

    teleop_gateway.release_publish.set()
    stop_thread.join(timeout=2)
    command_thread.join(timeout=2)

    assert stop_finished.is_set()
    assert command_rejected.is_set()
    assert not command_executed.is_set()


def test_teleop_checks_stop_again_at_the_publish_gate() -> None:
    teleop_gateway = RecordingTeleopGateway()
    client = create_stop_test_client(teleop_gateway, RecordingRosPublisherGateway())
    client.app.state.runtime_stop_controller = StopAtFinalGate()

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "teleop_cmd",
                "linear": {"x": 0.4, "y": 0.0, "z": 0.0},
                "angular": {"x": 0.0, "y": 0.0, "z": 0.0},
                "seq": 1,
            }
        )
        rejection = websocket.receive_json()

    assert rejection["type"] == "runtime_error"
    assert rejection["payload"]["code"] == "runtime_stopped"
    assert teleop_gateway.commands == []


def test_runtime_action_checks_stop_again_at_the_publish_gate() -> None:
    ros_gateway = RecordingRosPublisherGateway()
    client = create_stop_test_client(RecordingTeleopGateway(), ros_gateway)
    client.app.state.runtime_stop_controller = StopAtFinalGate()

    response = client.post(
        "/api/v1/runtime/actions",
        json={
            "app_id": "explorer-manager",
            "command": "behaviour/passthrough",
            "config_id": "explorer-manager",
        },
    )

    assert response.status_code == 409
    assert ros_gateway.requests == []


def test_generic_publish_checks_stop_again_at_the_publish_gate() -> None:
    ros_gateway = RecordingRosPublisherGateway()
    client = create_stop_test_client(RecordingTeleopGateway(), ros_gateway)
    client.app.state.runtime_stop_controller = StopAtFinalGate()

    response = client.post(
        "/api/v1/ros/topics/publish",
        json={
            "topic": "/mode_request",
            "message_type": "std_msgs/msg/String",
            "payload": {"data": "behaviour/joint_target/home"},
        },
    )

    assert response.status_code == 409
    assert ros_gateway.requests == []


def test_the_mirror_follows_generic_mode_publishes_and_stop() -> None:
    client = TestClient(
        create_app(
            Settings(environment="test", runtime_control_required=True),
            InMemoryConfigurationRepository(),
            ros_publisher_gateway=RecordingRosPublisherGateway(),
            teleop_command_gateway=RecordingTeleopGateway(),
        )
    )

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        headers = {"X-Bloom-Runtime-Session": websocket.receive_json()["session_id"]}
        websocket.send_json({"type": "claim_control"})
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "teleop_cmd",
                "frame_id": "hybrid_frame",
                "linear": {"x": 0.2, "y": 0.0, "z": 0.0},
                "seq": 1,
                "target": "/joystick_cartesian_command",
            }
        )
        assert websocket.receive_json()["type"] == "teleop_ack"
        published = client.post(
            "/api/v1/ros/topics/publish",
            headers=headers,
            json={
                "topic": "/mode_request",
                "message_type": "std_msgs/msg/String",
                "payload": {"data": "geometric/both"},
            },
        )
        assert published.status_code == 200
        driving = client.get("/api/v1/runtime/control").json()

        assert client.post("/api/v1/runtime/stop").status_code == 200
        stopped = client.get("/api/v1/runtime/control").json()

    assert (driving["owner_moving"], driving["owner_mode_request"]) == (True, "geometric/both")
    assert (stopped["owner_moving"], stopped["owner_mode_request"]) == (False, "behaviour/passthrough")
    assert stopped["owner_frame_id"] == "hybrid_frame"
