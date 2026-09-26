"""A stale lease is never taken mid-operation, and a displaced legacy owner's twist is zeroed."""

from __future__ import annotations

import threading

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.routes.runtime_socket import reset_orphaned_modes
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.sessions import RuntimeSessionManager
from libs.sessions.audit import InMemoryRuntimeAuditLog
from libs.sessions.teleop import TeleopCommand, TeleopPublishReceipt, TeleopVector3


class MovableClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


class RecordingStopController:
    def __init__(self) -> None:
        self.resets: list[tuple[str, str]] = []

    def publish_mode_reset(self, topic: str, mode: str) -> str:
        self.resets.append((topic, mode))
        return mode


class RecordingTeleopGateway:
    def __init__(self) -> None:
        self.commands: list[TeleopCommand] = []

    def publish(self, command: TeleopCommand) -> TeleopPublishReceipt:
        self.commands.append(command)
        return TeleopPublishReceipt(detail="recorded", status="accepted", target=command.target)


def moving(target: str = "/teleop_cmd") -> TeleopCommand:
    return TeleopCommand(angular=TeleopVector3(), linear=TeleopVector3(x=0.5), mode=1, seq=7, target=target)


def test_a_stale_owners_joint_target_in_flight_is_not_lost_to_a_claim() -> None:
    clock = MovableClock()
    manager = RuntimeSessionManager(lease_timeout_sec=10.0, clock=clock)
    stale, claimer = manager.connect(), manager.connect()
    manager.claim_control(stale)
    publishing, finish = threading.Event(), threading.Event()

    def blocked_joint_target_publish() -> None:
        publishing.set()
        assert finish.wait(2.0)
        manager.record_mode_request(stale.id, "behaviour/joint_target/home", require_owner=True)

    worker = threading.Thread(target=manager.execute_if_control_owner, args=(stale.id, blocked_joint_target_publish))
    worker.start()
    assert publishing.wait(2.0)
    clock.now = 11.0
    assert not manager.claim_control(claimer).is_owner
    finish.set()
    worker.join(2.0)
    assert manager.pending_joint_target(stale) == "/mode_request"

    # The operation is over: the next claim takes the lease and inherits the cancel.
    assert manager.claim_control(claimer).is_owner
    stop_controller = RecordingStopController()
    reset_orphaned_modes(manager, claimer, stop_controller, InMemoryRuntimeAuditLog())
    assert stop_controller.resets == [("/mode_request", "behaviour/passthrough")]


def test_an_owner_driving_over_http_only_is_not_stale() -> None:
    clock = MovableClock()
    manager = RuntimeSessionManager(lease_timeout_sec=10.0, clock=clock)
    owner, claimer = manager.connect(), manager.connect()
    manager.claim_control(owner)
    clock.now = 8.0
    manager.execute_if_control_owner(owner.id, lambda: None)
    clock.now = 15.0
    assert not manager.claim_control(claimer).is_owner
    assert manager.is_control_owner(owner.id)


@pytest.mark.parametrize("legacy", [True, False])
def test_a_displaced_owners_moving_teleop_is_zeroed_on_the_legacy_backend_only(legacy: bool) -> None:
    clock = MovableClock()
    manager = RuntimeSessionManager(lease_timeout_sec=10.0, clock=clock, zero_orphaned_teleop=legacy)
    stale, successor = manager.connect(), manager.connect()
    manager.claim_control(stale)
    manager.record_teleop_command(stale, moving())
    clock.now = 11.0
    assert manager.claim_control(successor).is_owner
    assert manager.has_orphaned_mode_resets() is legacy

    gateway = RecordingTeleopGateway()
    reset_orphaned_modes(manager, successor, RecordingStopController(), InMemoryRuntimeAuditLog(), gateway)
    if legacy:
        [zero] = gateway.commands
        assert (zero.target, zero.linear, zero.mode, zero.seq) == ("/teleop_cmd", TeleopVector3(), 1, 8)
    else:
        assert gateway.commands == []


def test_the_legacy_app_zeros_a_displaced_owners_teleop_for_the_next_claim() -> None:
    gateway = RecordingTeleopGateway()
    app = create_app(
        Settings(
            environment="test",
            runtime_control_required=True,
            ros_command_backend="teleop_command",
            allowed_teleop_targets=("/teleop_cmd",),
        ),
        InMemoryConfigurationRepository(),
        teleop_command_gateway=gateway,
    )
    clock = MovableClock()
    app.state.runtime_session_manager._clock = clock
    client = TestClient(app)
    command = {"type": "teleop_cmd", "linear": {"x": 0.5, "y": 0, "z": 0}, "mode": 1, "seq": 3, "target": "/teleop_cmd"}

    with client.websocket_connect("/api/v1/runtime/ws") as stale, client.websocket_connect("/api/v1/runtime/ws") as nxt:
        stale.receive_json()
        nxt.receive_json()
        stale.send_json({"type": "claim_control"})
        assert stale.receive_json()["payload"]["is_owner"]
        stale.send_json(command)
        assert stale.receive_json()["type"] == "teleop_ack"
        clock.now = 11.0
        nxt.send_json({"type": "claim_control"})
        assert nxt.receive_json()["payload"]["is_owner"]
        assert [(c.target, c.linear.x) for c in gateway.commands] == [("/teleop_cmd", 0.5), ("/teleop_cmd", 0.0)]
