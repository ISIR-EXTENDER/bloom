"""Session state forgets only what actually reached the robot, and every mode-request topic is checked alike."""

from __future__ import annotations

import threading
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.routes.runtime_socket import disconnect_runtime_session, reset_orphaned_modes
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository, load_configuration_file
from libs.ros_adapters import RosPublishReceipt, RosPublishRequest
from libs.ros_adapters.safety import (
    KINOVA_POSE_TARGET_REFUSAL,
    RuntimeCommandPolicy,
    RuntimePayloadShapeError,
    robot_refused_mode_requests,
)
from libs.sessions import RuntimeSessionManager
from libs.sessions.audit import InMemoryRuntimeAuditLog
from libs.sessions.stop import RuntimeStopAssertionError, RuntimeStopController
from libs.sessions.teleop import TeleopCommand, TeleopPublishReceipt, TeleopVector3

EXPLORER_FIXTURE_PATH = Path(__file__).parents[1] / "seed" / "applications" / "explorer-manager.json"
PUBLISH = "/api/v1/ros/topics/publish"


class RclError(Exception):
    """Stands in for an rclpy error, which is not a RuntimeError."""


class TeleopGateway:
    def __init__(self, failing: tuple[str, ...] = (), error: type[Exception] = RclError) -> None:
        self.failing = failing
        self.error = error
        self.commands: list[TeleopCommand] = []

    def publish(self, command: TeleopCommand) -> TeleopPublishReceipt:
        if command.target in self.failing:
            raise self.error(f"{command.target} is down")
        self.commands.append(command)
        return TeleopPublishReceipt(detail="ok", status="accepted", target=command.target)


class RosGateway:
    def __init__(self) -> None:
        self.requests: list[RosPublishRequest] = []

    def publish(self, request: RosPublishRequest) -> RosPublishReceipt:
        self.requests.append(request)
        return RosPublishReceipt(
            detail="ok", message_type=request.message_type, status="published", topic=request.topic
        )

    def sent(self, topic: str) -> list[object]:
        return [r.payload.get("data") for r in self.requests if r.topic == topic]


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def moving(target: str) -> TeleopCommand:
    return TeleopCommand(angular=TeleopVector3(), linear=TeleopVector3(x=0.5), mode=1, seq=7, target=target)


def test_stop_keeps_a_moving_command_whose_zero_did_not_publish() -> None:
    manager = RuntimeSessionManager()
    session = manager.connect()
    manager.record_teleop_command(session, moving("/arm2/cmd"))
    manager.record_teleop_command(session, moving("/joystick_cartesian_command"))
    controller = RuntimeStopController(
        teleop_gateway=TeleopGateway(failing=("/arm2/cmd",)),
        ros_publisher_gateway=RosGateway(),
        teleop_targets=manager.moving_teleop_targets,
        on_asserted=manager.record_runtime_stop,
    )

    with pytest.raises(RuntimeStopAssertionError):
        controller.engage()

    # Still recorded, so the deadman retries it and the next STOP zeroes it again.
    assert manager.moving_teleop_targets() == ("/arm2/cmd",)


def test_an_orphaned_zero_stays_owed_until_it_publishes() -> None:
    clock = Clock()
    manager = RuntimeSessionManager(lease_timeout_sec=10.0, clock=clock, zero_orphaned_teleop=True)
    stale, successor = manager.connect(), manager.connect()
    manager.claim_control(stale)
    manager.record_teleop_command(stale, moving("/teleop_cmd"))
    clock.now = 11.0
    assert manager.claim_control(successor).is_owner

    failing = TeleopGateway(failing=("/teleop_cmd",))
    reset_orphaned_modes(manager, successor, RosStop(), InMemoryRuntimeAuditLog(), failing)
    assert manager.has_orphaned_mode_resets()
    # STOP zeroes it meanwhile too.
    assert manager.moving_teleop_targets() == ("/teleop_cmd",)

    working = TeleopGateway()
    reset_orphaned_modes(manager, successor, RosStop(), InMemoryRuntimeAuditLog(), working)
    assert [zero.target for zero in working.commands] == ["/teleop_cmd"]
    assert not manager.has_orphaned_mode_resets()


class RosStop:
    """The parts of the STOP controller a session cleanup uses, recording what it published."""

    def __init__(self) -> None:
        self.published: list[tuple[str, str]] = []
        self.engaged = 0

    def execute_if_running(self, operation):
        return operation()

    def cancel_joint_target(self, topic: str | None = None) -> str:
        self.published.append((topic or "/mode_request", "behaviour/passthrough"))
        return "cancelled"

    def publish_mode_reset(self, topic: str, mode: str) -> str:
        self.published.append((topic, mode))
        return mode

    def turn_off_visual_servoing(self) -> str:
        self.published.append(("/ui/visual_servoing/on", "off"))
        return "off"

    def engage(self) -> None:
        self.engaged += 1


def test_a_failed_teleop_zero_does_not_skip_the_cancel_reset_or_stop() -> None:
    manager = RuntimeSessionManager()
    session = manager.connect()
    manager.claim_control(session)
    manager.record_teleop_command(session, moving("/joystick_cartesian_command"))
    manager.record_mode_request(session.id, "behaviour/joint_target/home", "/arm2/mode_request")
    manager.record_mode_request(session.id, "geometric/snake", "/arm2/mode_request")
    stop = RosStop()
    assert manager.begin_control_release(session)

    disconnect_runtime_session(
        manager,
        session,
        TeleopGateway(failing=("/joystick_cartesian_command",)),
        stop,
        InMemoryRuntimeAuditLog(),
    )

    assert stop.published == [
        ("/arm2/mode_request", "behaviour/passthrough"),
        ("/arm2/mode_request", "geometric/both"),
    ]
    assert stop.engaged == 1


def test_owner_mode_reports_shaping_not_behaviour() -> None:
    manager = RuntimeSessionManager()
    owner = manager.connect()
    manager.claim_control(owner)
    manager.record_mode_request(owner.id, "geometric/snake")
    manager.record_mode_request(owner.id, "behaviour/passthrough")

    assert manager.control_snapshot("").owner_mode_request == "geometric/snake"


def test_a_stale_lease_drop_resets_the_recorded_shaping_mode() -> None:
    clock = Clock()
    manager = RuntimeSessionManager(lease_timeout_sec=10.0, clock=clock)
    stale, successor = manager.connect(), manager.connect()
    manager.claim_control(stale)
    manager.record_mode_request(stale.id, "geometric/snake")
    clock.now = 11.0
    manager.claim_control(successor)
    manager.release_control(successor)

    assert manager.claim_control(stale).is_owner
    assert manager.control_snapshot("").owner_mode_request == "geometric/both"


def test_a_published_shaping_reset_resets_the_recorded_mode() -> None:
    manager = RuntimeSessionManager()
    owner = manager.connect()
    manager.claim_control(owner)
    manager.record_mode_request(owner.id, "geometric/snake")

    manager.clear_shaping_reset(owner)

    assert manager.control_snapshot("").owner_mode_request == "geometric/both"


def make_client(robot_name: str, allow: bool = False) -> tuple[TestClient, RosGateway]:
    gateway = RosGateway()
    app = create_app(
        Settings(
            environment="test",
            runtime_control_required=False,
            robot_name=robot_name,
            allow_kinova_pose_targets=allow,
            allowed_ros_publish_topics=("/mode_request", "/arm2/mode_request"),
        ),
        InMemoryConfigurationRepository({"explorer-manager": load_configuration_file(EXPLORER_FIXTURE_PATH)}),
        ros_publisher_gateway=gateway,
    )
    return TestClient(app), gateway


def mode(topic: str, data: str) -> dict:
    return {"topic": topic, "message_type": "std_msgs/msg/String", "payload": {"data": data}}


@pytest.mark.parametrize("data", ["behaviour/pose_target/ready/", "Behaviour//Pose-Target/Ready"])
def test_a_malformed_pose_target_on_another_mode_topic_is_refused(data: str) -> None:
    client, gateway = make_client("Kinova Gen3")

    response = client.post(PUBLISH, json=mode("/arm2/mode_request", data))

    assert response.status_code == 422
    assert gateway.requests == []


def test_another_mode_topic_publishes_the_normalized_form() -> None:
    client, gateway = make_client("Explorer")

    assert client.post(PUBLISH, json=mode("/arm2/mode_request", "Geometric/Snake")).status_code == 200
    assert client.post(PUBLISH, json=mode("/arm2/mode_request", "geometric/snake/")).status_code == 422
    assert gateway.sent("/arm2/mode_request") == ["geometric/snake"]


def test_the_kinova_refusal_compares_the_normalized_form() -> None:
    policy = RuntimeCommandPolicy(
        allowed_message_types=("*",),
        allowed_publish_topics=("*",),
        allowed_teleop_targets=(),
        refused_mode_requests=robot_refused_mode_requests("Kinova Gen3", False),
    )
    with pytest.raises(RuntimePayloadShapeError, match="Pose targets"):
        policy.ensure_mode_request_allowed("/arm2/mode_request", {"data": "Behaviour//Pose-Target/Ready/"})
    policy.ensure_mode_request_allowed("/arm2/mode_request", {"data": "behaviour/joint_target/home/"})


@pytest.mark.parametrize("topic", ["/mode_request", "/arm2/mode_request"])
@pytest.mark.parametrize("data", ["behaviour/pose_target/ready", "Behaviour/Pose-Target/Anything"])
def test_pose_targets_are_refused_on_a_kinova(topic: str, data: str) -> None:
    client, gateway = make_client("Kinova Gen3")

    response = client.post(PUBLISH, json=mode(topic, data))

    assert response.status_code == 422
    assert response.json()["detail"] == KINOVA_POSE_TARGET_REFUSAL
    assert "Explorer" in KINOVA_POSE_TARGET_REFUSAL
    assert gateway.requests == []


@pytest.mark.parametrize(("robot_name", "allow"), [("Explorer", False), ("Kinova Gen3", True)])
def test_pose_targets_publish_on_the_explorer_and_when_allowed(robot_name: str, allow: bool) -> None:
    client, gateway = make_client(robot_name, allow)

    assert client.post(PUBLISH, json=mode("/mode_request", "behaviour/pose_target/ready")).status_code == 200
    assert gateway.sent("/mode_request") == ["behaviour/pose_target/ready"]


def test_the_kinova_publishes_go_home() -> None:
    client, gateway = make_client("Kinova Gen3")

    response = client.post(PUBLISH, json=mode("/mode_request", "behaviour/joint_target/home"))

    assert response.status_code == 200
    assert gateway.sent("/mode_request") == ["behaviour/joint_target/home"]


def test_a_stop_racing_a_joint_target_on_another_topic_still_cancels_it() -> None:
    client, gateway = make_client("Explorer")
    app = client.app
    manager = app.state.runtime_session_manager
    stop_controller = app.state.runtime_stop_controller
    stop_done = threading.Event()
    record = manager.record_published_mode_request

    def record_after_a_racing_stop(*args, **kwargs) -> None:
        # Start a STOP the moment the target publishes and give it the chance to finish before recording.
        stopper = threading.Thread(target=lambda: (stop_controller.engage(), stop_done.set()))
        stopper.start()
        stop_done.wait(0.5)
        record(*args, **kwargs)

    manager.record_published_mode_request = record_after_a_racing_stop

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        headers = {"X-Bloom-Runtime-Session": websocket.receive_json()["session_id"]}
        response = client.post(PUBLISH, headers=headers, json=mode("/arm2/mode_request", "behaviour/joint_target/home"))
        assert response.status_code == 200
        assert stop_done.wait(2.0)
        # Before the socket closes: its disconnect would cancel the target on its own.
        assert gateway.sent("/arm2/mode_request") == ["behaviour/joint_target/home", "behaviour/passthrough"]
