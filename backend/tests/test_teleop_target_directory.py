from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters.parameters import RosParameterReading
from libs.ros_adapters.teleop_targets import TeleopTargetDirectory
from libs.sessions import InMemoryRuntimeAuditLog
from libs.sessions.teleop import TeleopCommand, TeleopPublishReceipt

MANAGER_INPUTS = (
    "/cartesian_manager:topics.joystick_command",
    "/cartesian_manager:topics.visual_servoing_command",
)


class RecordingTeleopGateway:
    def __init__(self) -> None:
        self.commands: list[TeleopCommand] = []

    def publish(self, command: TeleopCommand) -> TeleopPublishReceipt:
        self.commands.append(command)
        return TeleopPublishReceipt(
            detail="recorded", frame_id=command.frame_id or "base_link", status="accepted", target=command.target
        )


class ManagerParameters:
    """The manager's input topics as its parameter service reports them; None while it is not running."""

    def __init__(self, topics: dict[str, str] | None) -> None:
        self.topics = topics

    def get(self, node: str, names: tuple[str, ...]) -> tuple[RosParameterReading, ...]:
        if self.topics is None:
            raise RuntimeError(f"Node {node} does not offer its parameter services.")
        return tuple(RosParameterReading(node=node, name=name, value=self.topics.get(name)) for name in names)

    def set(self, request):  # pragma: no cover - not used here
        raise NotImplementedError


def test_the_manager_says_which_topics_a_joystick_may_drive() -> None:
    parameters = ManagerParameters(
        {"topics.joystick_command": "/lab_joystick", "topics.visual_servoing_command": "/lab_servo"}
    )
    directory = TeleopTargetDirectory(("/joystick_cartesian_command",), parameters, MANAGER_INPUTS)

    directory.refresh()

    assert directory.targets() == ("/joystick_cartesian_command", "/lab_joystick", "/lab_servo")


def test_a_manager_that_is_not_up_leaves_the_default_and_keeps_what_it_last_said() -> None:
    parameters = ManagerParameters(None)
    directory = TeleopTargetDirectory(("/joystick_cartesian_command",), parameters, MANAGER_INPUTS)

    directory.refresh()
    assert directory.targets() == ("/joystick_cartesian_command",)

    parameters.topics = {"topics.joystick_command": "/joystick_cartesian_command"}
    directory.refresh()
    parameters.topics = None
    directory.refresh()
    assert directory.targets() == ("/joystick_cartesian_command",)


def test_nothing_but_a_topic_name_is_taken_from_the_manager() -> None:
    parameters = ManagerParameters({"topics.joystick_command": "", "topics.visual_servoing_command": "relative"})
    directory = TeleopTargetDirectory((), parameters, MANAGER_INPUTS)

    directory.refresh()

    assert directory.targets() == ()


def _client(parameters: ManagerParameters, gateway, audit_log=None) -> TestClient:
    app = create_app(
        Settings(environment="test"),
        InMemoryConfigurationRepository(),
        ros_parameter_gateway=parameters,
        runtime_audit_log=audit_log or InMemoryRuntimeAuditLog(),
        teleop_command_gateway=gateway,
    )
    app.state.teleop_target_directory.refresh()
    return TestClient(app)


def _teleop(target: str) -> dict:
    return {
        "type": "teleop_cmd",
        "mode": 0,
        "seq": 1,
        "target": target,
        "linear": {"x": 0.1, "y": 0.0, "z": 0.0},
        "angular": {"x": 0.0, "y": 0.0, "z": 0.0},
    }


def test_every_manager_input_is_accepted_and_zeroed_by_stop_with_nothing_to_configure() -> None:
    recording_teleop_gateway = RecordingTeleopGateway()
    parameters = ManagerParameters(
        {
            "topics.joystick_command": "/joystick_cartesian_command",
            "topics.visual_servoing_command": "/visual_servoing_cartesian_command",
        }
    )
    client = _client(parameters, recording_teleop_gateway)

    assert client.get("/api/v1/capabilities").json()["teleop_targets"] == [
        "/joystick_cartesian_command",
        "/visual_servoing_cartesian_command",
    ]
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json(_teleop("/visual_servoing_cartesian_command"))
        assert websocket.receive_json()["type"] == "teleop_ack"
        websocket.send_json(_teleop("/somewhere_else"))
        assert websocket.receive_json()["type"] == "runtime_error"

    recording_teleop_gateway.commands.clear()
    client.post("/api/v1/runtime/stop")
    zeroed = {command.target for command in recording_teleop_gateway.commands}
    assert {"/joystick_cartesian_command", "/visual_servoing_cartesian_command"} <= zeroed


def test_an_input_the_manager_adds_while_a_tablet_is_connected_is_accepted() -> None:
    recording_teleop_gateway = RecordingTeleopGateway()
    parameters = ManagerParameters(None)
    client = _client(parameters, recording_teleop_gateway)

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        parameters.topics = {"topics.joystick_command": "/lab_joystick"}
        client.app.state.teleop_target_directory.refresh()
        websocket.send_json(_teleop("/lab_joystick"))
        assert websocket.receive_json()["type"] == "teleop_ack"


def test_a_namespace_or_a_wildcard_is_never_taken_as_a_topic() -> None:
    parameters = ManagerParameters({"topics.joystick_command": "/ui/", "topics.visual_servoing_command": "/any*"})
    directory = TeleopTargetDirectory((), parameters, MANAGER_INPUTS)

    directory.refresh()

    assert directory.targets() == ()


def test_stop_zeroes_topics_and_skips_permissions_that_are_not_topics() -> None:
    gateway = RecordingTeleopGateway()
    settings = Settings(environment="test", allowed_teleop_targets=("/joystick_cartesian_command", "/ui/", "*"))
    client = TestClient(create_app(settings, InMemoryConfigurationRepository(), teleop_command_gateway=gateway))

    response = client.post("/api/v1/runtime/stop")

    assert response.status_code == 200
    assert {command.target for command in gateway.commands} == {"/joystick_cartesian_command"}
