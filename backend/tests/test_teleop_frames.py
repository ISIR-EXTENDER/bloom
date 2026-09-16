"""frame_id selects the rotation frame in cartesian_manager; Bloom validates it."""

from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.sessions import TeleopCommand, TeleopPublishReceipt


class RecordingTeleopGateway:
    def __init__(self) -> None:
        self.commands: list[TeleopCommand] = []

    def publish(self, command: TeleopCommand) -> TeleopPublishReceipt:
        self.commands.append(command)
        return TeleopPublishReceipt(detail="recorded", status="accepted", target=command.target)


def create_frames_client(gateway: RecordingTeleopGateway) -> TestClient:
    return TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            teleop_command_gateway=gateway,
        )
    )


def send_teleop(websocket, frame_id: str) -> dict:
    websocket.send_json(
        {
            "type": "teleop_cmd",
            "frame_id": frame_id,
            "linear": {"x": 0.2, "y": 0.0, "z": 0.0},
            "angular": {"x": 0.0, "y": 0.0, "z": 0.1},
            "seq": 1,
        }
    )
    return websocket.receive_json()


def test_a_known_frame_travels_to_the_gateway() -> None:
    gateway = RecordingTeleopGateway()
    client = create_frames_client(gateway)

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        response = send_teleop(websocket, "ft_frame")

    assert response["type"] == "teleop_ack"
    [command] = gateway.commands
    assert command.frame_id == "ft_frame"


def test_an_empty_frame_means_the_configured_default() -> None:
    gateway = RecordingTeleopGateway()
    client = create_frames_client(gateway)

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        response = send_teleop(websocket, "")

    assert response["type"] == "teleop_ack"
    [command] = gateway.commands
    assert command.frame_id == ""


def test_an_unknown_frame_is_refused_loudly() -> None:
    # The manager skips a command in a frame it does not know; the arm stopping
    # must not be the first sign of a typo.
    gateway = RecordingTeleopGateway()
    client = create_frames_client(gateway)

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        response = send_teleop(websocket, "tool_frame")

    assert response["type"] == "runtime_error"
    assert response["payload"]["code"] == "unknown_frame"
    assert "base_link" in response["payload"]["message"]
    assert gateway.commands == []


def test_capabilities_report_the_command_frames_and_robot() -> None:
    client = create_frames_client(RecordingTeleopGateway())

    body = client.get("/api/v1/capabilities").json()

    assert body["command_frame_id"] == "base_link"
    # Union of the Explorer and Kinova bringups; deployments narrow via env.
    assert body["command_frame_ids"] == ["base_link", "effector_frame", "ft_frame", "hybrid_frame"]
    assert body["robot_name"] == ""


def test_capabilities_name_the_configured_robot() -> None:
    client = TestClient(
        create_app(
            Settings(environment="test", robot_name="Explorer"),
            InMemoryConfigurationRepository(),
        )
    )

    assert client.get("/api/v1/capabilities").json()["robot_name"] == "Explorer"
