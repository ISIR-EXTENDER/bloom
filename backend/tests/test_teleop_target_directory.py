from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters.parameters import RosParameterReading
from libs.ros_adapters.teleop_targets import TeleopTargetDirectory
from libs.sessions import InMemoryRuntimeAuditLog
from libs.sessions.teleop import TeleopCommand, TeleopPublishReceipt

MANAGER = "/cartesian_manager"
TOPICS = {
    "topics.joystick_command": "/joystick_cartesian_command",
    "topics.tablet_command": "/tablet_cartesian_command",
    "topics.visual_servoing_command": "/visual_servoing_cartesian_command",
}


class RecordingTeleopGateway:
    def __init__(self) -> None:
        self.commands: list[TeleopCommand] = []

    def publish(self, command: TeleopCommand) -> TeleopPublishReceipt:
        self.commands.append(command)
        return TeleopPublishReceipt(
            detail="recorded", frame_id=command.frame_id or "base_link", status="accepted", target=command.target
        )


class ManagerParameters:
    """The manager's declared sources and their topics; None while it is not running."""

    def __init__(self, sources: list[str] | None, topics: dict[str, str] | None = None) -> None:
        self.sources = sources
        self.topics = TOPICS if topics is None else topics

    def get_string_list(self, node: str, name: str) -> tuple[str, ...] | None:
        if self.sources is None:
            raise RuntimeError(f"Node {node} does not offer its parameter services.")
        return tuple(self.sources) if name == "inputs.sources" else None

    def get(self, node: str, names: tuple[str, ...]) -> tuple[RosParameterReading, ...]:
        if self.sources is None:
            raise RuntimeError(f"Node {node} does not offer its parameter services.")
        return tuple(RosParameterReading(node=node, name=name, value=self.topics.get(name)) for name in names)

    def set(self, request):  # pragma: no cover - not used here
        raise NotImplementedError


def test_only_the_inputs_the_manager_declares_are_offered() -> None:
    directory = TeleopTargetDirectory((), ManagerParameters(["joystick", "tablet"]), MANAGER)

    directory.refresh()

    # visual_servoing has a topic but is not a declared source, so the manager does not read it.
    assert directory.targets() == ("/joystick_cartesian_command", "/tablet_cartesian_command")


def test_a_renamed_input_is_followed() -> None:
    parameters = ManagerParameters(["tablet"], {"topics.tablet_command": "/lab_tablet"})
    directory = TeleopTargetDirectory(("/tablet_cartesian_command",), parameters, MANAGER)

    directory.refresh()

    assert directory.targets() == ("/tablet_cartesian_command", "/lab_tablet")


def test_a_manager_that_is_not_up_leaves_the_default_and_keeps_what_it_last_said() -> None:
    parameters = ManagerParameters(None)
    directory = TeleopTargetDirectory(("/tablet_cartesian_command",), parameters, MANAGER)

    directory.refresh()
    assert directory.targets() == ("/tablet_cartesian_command",)

    parameters.sources = ["joystick", "tablet"]
    directory.refresh()
    parameters.sources = None
    directory.refresh()
    assert directory.targets() == ("/tablet_cartesian_command", "/joystick_cartesian_command")


def test_nothing_but_a_topic_name_is_taken_from_the_manager() -> None:
    parameters = ManagerParameters(
        ["joystick", "tablet"], {"topics.joystick_command": "", "topics.tablet_command": "x"}
    )
    directory = TeleopTargetDirectory((), parameters, MANAGER)

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


def test_every_declared_input_is_accepted_and_zeroed_by_stop_and_no_other() -> None:
    recording_teleop_gateway = RecordingTeleopGateway()
    client = _client(ManagerParameters(["joystick", "tablet"]), recording_teleop_gateway)

    assert client.get("/api/v1/capabilities").json()["teleop_targets"] == [
        "/tablet_cartesian_command",
        "/joystick_cartesian_command",
    ]
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json(_teleop("/tablet_cartesian_command"))
        assert websocket.receive_json()["type"] == "teleop_ack"
        # Declared a topic, but not a source: the manager would not read it.
        websocket.send_json(_teleop("/visual_servoing_cartesian_command"))
        assert websocket.receive_json()["type"] == "runtime_error"

    recording_teleop_gateway.commands.clear()
    client.post("/api/v1/runtime/stop")
    zeroed = {command.target for command in recording_teleop_gateway.commands}
    assert {"/tablet_cartesian_command", "/joystick_cartesian_command"} <= zeroed


def test_an_input_the_manager_adds_while_a_tablet_is_connected_is_accepted() -> None:
    recording_teleop_gateway = RecordingTeleopGateway()
    parameters = ManagerParameters(None)
    client = _client(parameters, recording_teleop_gateway)

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        parameters.sources = ["tablet"]
        parameters.topics = {"topics.tablet_command": "/lab_tablet"}
        client.app.state.teleop_target_directory.refresh()
        websocket.send_json(_teleop("/lab_tablet"))
        assert websocket.receive_json()["type"] == "teleop_ack"
