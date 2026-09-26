"""A release that cannot zero the arm engages STOP on the STOP worker, never beside an HTTP resume."""

from __future__ import annotations

import threading
import time

from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.sessions.teleop import TeleopCommand, TeleopPublishReceipt, TeleopVector3


class FailingNeutralTeleopGateway:
    def publish(self, command: TeleopCommand) -> TeleopPublishReceipt:
        if command.linear == TeleopVector3() and command.angular == TeleopVector3():
            raise RuntimeError("neutral command could not reach ROS")
        return TeleopPublishReceipt(detail="recorded", status="accepted", target=command.target)


def test_a_failed_socket_release_engages_stop_on_the_stop_worker() -> None:
    app = create_app(
        Settings(environment="test", runtime_control_required=True),
        InMemoryConfigurationRepository(),
        teleop_command_gateway=FailingNeutralTeleopGateway(),
    )
    controller = app.state.runtime_stop_controller
    engage = controller.engage
    engaged_on: list[str] = []

    def recording_engage():
        engaged_on.append(threading.current_thread().name)
        return engage()

    controller.engage = recording_engage
    client = TestClient(app)

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json({"type": "claim_control"})
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "teleop_cmd",
                "linear": {"x": 0.2, "y": 0, "z": 0},
                "mode": 3,
                "seq": 1,
                "target": "/joystick_cartesian_command",
            }
        )
        assert websocket.receive_json()["type"] == "teleop_ack"
        websocket.send_json({"type": "release_control"})
        assert websocket.receive_json()["payload"]["code"] == "control_release_failed"

    assert len(engaged_on) == 1
    assert engaged_on[0].startswith("bloom-stop")


def test_a_disconnect_that_cannot_zero_the_arm_engages_stop_on_the_stop_worker() -> None:
    app = create_app(
        Settings(environment="test", runtime_control_required=True),
        InMemoryConfigurationRepository(),
        teleop_command_gateway=FailingNeutralTeleopGateway(),
    )
    controller = app.state.runtime_stop_controller
    engage = controller.engage
    engaged_on: list[str] = []

    def recording_engage():
        engaged_on.append(threading.current_thread().name)
        return engage()

    controller.engage = recording_engage
    client = TestClient(app)

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json({"type": "claim_control"})
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "teleop_cmd",
                "linear": {"x": 0.2, "y": 0, "z": 0},
                "mode": 3,
                "seq": 1,
                "target": "/joystick_cartesian_command",
            }
        )
        assert websocket.receive_json()["type"] == "teleop_ack"

    deadline = time.monotonic() + 2.0
    while not engaged_on and time.monotonic() < deadline:
        time.sleep(0.01)
    assert len(engaged_on) == 1
    assert engaged_on[0].startswith("bloom-stop")
