"""A silent sender's twist on the legacy /teleop_cmd is zeroed by the backend: that controller never expires it."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import TypeVar

from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.sessions import RuntimeSessionManager, RuntimeStoppedError
from libs.sessions.audit import InMemoryRuntimeAuditLog
from libs.sessions.deadman import zero_stale_teleop
from libs.sessions.teleop import TeleopCommand, TeleopPublishReceipt, TeleopVector3

T = TypeVar("T")


class MovableClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


class RecordingTeleopGateway:
    def __init__(self, fail: bool = False) -> None:
        self.commands: list[TeleopCommand] = []
        self.fail = fail

    def publish(self, command: TeleopCommand) -> TeleopPublishReceipt:
        if self.fail:
            raise RuntimeError("publisher is gone")
        self.commands.append(command)
        return TeleopPublishReceipt(detail="recorded", status="accepted", target=command.target)


class PassThroughStop:
    def __init__(self, stopped: bool = False) -> None:
        self.stopped = stopped

    def execute_if_running(self, operation: Callable[[], T]) -> T:
        if self.stopped:
            raise RuntimeStoppedError("stopped")
        return operation()


def moving(seq: int = 7, x: float = 0.5, target: str = "/teleop_cmd") -> TeleopCommand:
    return TeleopCommand(angular=TeleopVector3(), linear=TeleopVector3(x=x), mode=2, seq=seq, target=target)


def sweep(manager, gateway, audit_log, stop=None) -> int:
    return zero_stale_teleop(manager, gateway, stop or PassThroughStop(), audit_log, 0.5)


def test_a_twist_nobody_refreshes_is_zeroed_once_and_audited() -> None:
    clock = MovableClock()
    manager = RuntimeSessionManager(clock=clock)
    session = manager.connect()
    gateway, audit_log = RecordingTeleopGateway(), InMemoryRuntimeAuditLog()
    manager.record_teleop_command(session, moving())

    clock.now = 0.4
    assert sweep(manager, gateway, audit_log) == 0
    assert gateway.commands == []

    clock.now = 0.6
    assert sweep(manager, gateway, audit_log) == 1
    assert [(c.target, c.mode, c.linear.x, c.angular.z) for c in gateway.commands] == [("/teleop_cmd", 2, 0.0, 0.0)]
    assert manager.moving_teleop_commands(session) == ()
    record = audit_log.list_records()[0]
    assert (record.channel, record.status, record.session_id, record.target) == (
        "runtime_control",
        "accepted",
        session.id,
        "/teleop_cmd",
    )
    assert "deadman" in record.detail

    clock.now = 5.0
    assert sweep(manager, gateway, audit_log) == 0
    assert len(gateway.commands) == 1


def test_a_streaming_operator_never_trips_it() -> None:
    clock = MovableClock()
    manager = RuntimeSessionManager(clock=clock)
    session = manager.connect()
    gateway, audit_log = RecordingTeleopGateway(), InMemoryRuntimeAuditLog()

    for frame in range(40):
        clock.now = frame * 0.05
        manager.record_teleop_command(session, moving(seq=frame))
        sweep(manager, gateway, audit_log)

    assert gateway.commands == []
    assert len(manager.moving_teleop_commands(session)) == 1


def test_only_the_silent_target_is_zeroed() -> None:
    clock = MovableClock()
    manager = RuntimeSessionManager(clock=clock)
    session = manager.connect()
    gateway, audit_log = RecordingTeleopGateway(), InMemoryRuntimeAuditLog()
    manager.record_teleop_command(session, moving(target="/teleop_cmd"))
    clock.now = 0.4
    manager.record_teleop_command(session, moving(target="/other_teleop"))

    clock.now = 0.7
    sweep(manager, gateway, audit_log)

    assert [c.target for c in gateway.commands] == ["/teleop_cmd"]
    assert [c.target for c in manager.moving_teleop_commands(session)] == ["/other_teleop"]


def test_a_failed_zero_stays_owed_and_a_latched_stop_still_gets_it() -> None:
    clock = MovableClock()
    manager = RuntimeSessionManager(clock=clock)
    session = manager.connect()
    audit_log = InMemoryRuntimeAuditLog()
    manager.record_teleop_command(session, moving())
    clock.now = 1.0

    sweep(manager, RecordingTeleopGateway(fail=True), audit_log)
    assert audit_log.list_records()[0].status == "rejected"
    assert len(manager.moving_teleop_commands(session)) == 1

    gateway = RecordingTeleopGateway()
    sweep(manager, gateway, audit_log, PassThroughStop(stopped=True))
    assert [c.linear.x for c in gateway.commands] == [0.0]
    assert manager.moving_teleop_commands(session) == ()


def test_a_fresh_command_recorded_during_the_zero_is_not_forgotten() -> None:
    clock = MovableClock()
    manager = RuntimeSessionManager(clock=clock)
    session = manager.connect()
    manager.record_teleop_command(session, moving(seq=1))
    clock.now = 1.0

    class RacingGateway(RecordingTeleopGateway):
        def publish(self, command: TeleopCommand) -> TeleopPublishReceipt:
            manager.record_teleop_command(session, moving(seq=9))
            return super().publish(command)

    sweep(manager, RacingGateway(), InMemoryRuntimeAuditLog())

    assert [c.seq for c in manager.moving_teleop_commands(session)] == [9]


def legacy_app(**overrides):
    gateway = RecordingTeleopGateway()
    settings = Settings(
        environment="test",
        ros_command_backend="teleop_command",
        allowed_teleop_targets=("/teleop_cmd",),
        **overrides,
    )
    return create_app(settings, InMemoryConfigurationRepository(), teleop_command_gateway=gateway), gateway


def test_the_lifespan_runs_it_only_for_the_legacy_backend() -> None:
    app, _ = legacy_app()
    with TestClient(app):
        assert app.state.teleop_deadman_task is not None
        assert not app.state.teleop_deadman_task.done()

    manager_app = create_app(Settings(environment="test"), InMemoryConfigurationRepository())
    with TestClient(manager_app):
        assert manager_app.state.teleop_deadman_task is None


def test_a_half_open_socket_stops_driving_the_legacy_arm() -> None:
    app, gateway = legacy_app(teleop_deadman_timeout_sec=0.05)
    command = {"type": "teleop_cmd", "linear": {"x": 0.5, "y": 0, "z": 0}, "mode": 2, "seq": 3, "target": "/teleop_cmd"}

    with TestClient(app) as client, client.websocket_connect("/api/v1/runtime/ws") as socket:
        socket.receive_json()
        socket.send_json(command)
        assert socket.receive_json()["type"] == "teleop_ack"
        deadline = time.monotonic() + 3.0
        while len(gateway.commands) < 2 and time.monotonic() < deadline:
            time.sleep(0.02)

        assert [(c.target, c.linear.x) for c in gateway.commands[:2]] == [("/teleop_cmd", 0.5), ("/teleop_cmd", 0.0)]
