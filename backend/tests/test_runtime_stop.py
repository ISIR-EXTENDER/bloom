"""The runtime STOP latch: engage, assert toward the robot, outrank every path.

Finding 3 of the UX review. The previous "Emergency stop" published on a topic
nothing subscribed to and reported success; this suite exists so its
replacement can never quietly degrade the same way. The contract under test:

- Engaging publishes a zero twist on the teleop target and a
  ``behaviour/passthrough`` mode request on ``/mode_request`` -- the message on
  which ``cartesian_manager`` publishes its empty-``JointState`` joint-target
  cancel downstream.
- The latch is set even when the publishes fail: a STOP that cannot reach ROS
  must still stop Bloom from commanding.
- While stopped, WebSocket teleop, runtime action dispatch, and the generic
  ROS publish route all reject.
- Resume clears the latch and publishes nothing.
"""

from pathlib import Path

from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository, load_configuration_file
from libs.ros_adapters import RosPublishReceipt, RosPublishRequest
from libs.sessions import (
    CANCEL_MODE_REQUEST,
    InMemoryRuntimeAuditLog,
    RuntimeStopController,
    TeleopCommand,
    TeleopPublishReceipt,
)

EXPLORER_FIXTURE_PATH = Path(__file__).parents[1] / "seed" / "applications" / "explorer-user-tests.json"


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


def create_stop_test_client(
    teleop_gateway: RecordingTeleopGateway | FailingTeleopGateway | None = None,
    ros_publisher_gateway: RecordingRosPublisherGateway | FailingRosPublisherGateway | None = None,
    audit_log: InMemoryRuntimeAuditLog | None = None,
) -> TestClient:
    return TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository({"explorer-user-tests": load_configuration_file(EXPLORER_FIXTURE_PATH)}),
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
        "engaged_at": "",
        "detail": "Runtime stop is not engaged.",
    }


def test_engaging_stop_publishes_zero_twist_and_joint_target_cancel() -> None:
    teleop_gateway = RecordingTeleopGateway()
    ros_gateway = RecordingRosPublisherGateway()
    client = create_stop_test_client(teleop_gateway, ros_gateway)

    response = client.post("/api/v1/runtime/stop")

    assert response.status_code == 200
    body = response.json()
    assert body["stopped"] is True
    assert body["engaged_at"] != ""

    [zero_command] = teleop_gateway.commands
    assert zero_command.target == "/joystick_cartesian_command"
    assert (zero_command.linear.x, zero_command.linear.y, zero_command.linear.z) == (0.0, 0.0, 0.0)
    assert (zero_command.angular.x, zero_command.angular.y, zero_command.angular.z) == (0.0, 0.0, 0.0)

    # The manager answers behaviour/passthrough by publishing an empty
    # JointState on /joint_target_command -- its own cancel signal. Bloom must
    # request the cancel rather than fake one.
    [cancel_request] = ros_gateway.requests
    assert cancel_request.topic == "/mode_request"
    assert cancel_request.message_type == "std_msgs/msg/String"
    assert cancel_request.payload == {"data": CANCEL_MODE_REQUEST}


def test_stop_latches_even_when_every_publish_fails() -> None:
    client = create_stop_test_client(FailingTeleopGateway(), FailingRosPublisherGateway())

    response = client.post("/api/v1/runtime/stop")

    assert response.status_code == 200
    body = response.json()
    assert body["stopped"] is True
    assert "Zero velocity could not be published" in body["detail"]
    assert "Joint-target cancel could not be published" in body["detail"]

    # The latch, not the publish, is what gates Bloom's own command paths.
    assert client.get("/api/v1/runtime/stop").json()["stopped"] is True


def test_engaging_stop_twice_reasserts_instead_of_failing() -> None:
    teleop_gateway = RecordingTeleopGateway()
    ros_gateway = RecordingRosPublisherGateway()
    client = create_stop_test_client(teleop_gateway, ros_gateway)

    first = client.post("/api/v1/runtime/stop")
    second = client.post("/api/v1/runtime/stop")

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["stopped"] is True
    assert len(teleop_gateway.commands) == 2
    assert len(ros_gateway.requests) == 2


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
            "app_id": "explorer-user-tests",
            "command": "explorer.deploy",
            "config_id": "explorer-user-tests",
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
        "engaged_at": "",
        "detail": "Runtime stop is not engaged.",
    }
    # Motion restarts only when the operator commands it, never as a side
    # effect of resuming.
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

    state = controller.engage()

    assert state.stopped is True
    assert controller.rejection_reason() is not None
    assert controller.resume().stopped is False
    assert controller.rejection_reason() is None
