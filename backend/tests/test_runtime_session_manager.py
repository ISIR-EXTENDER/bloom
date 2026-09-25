from dataclasses import replace
from threading import Event, Thread

import pytest

from libs.sessions import (
    RuntimeControlNotOwnedError,
    RuntimeSessionLimitError,
    RuntimeSessionManager,
    TeleopCommand,
    TeleopVector3,
)


class MovableClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def test_control_must_be_released_before_another_session_can_claim_it() -> None:
    manager = RuntimeSessionManager()
    first = manager.connect()
    second = manager.connect()

    assert manager.claim_control(first).is_owner is True
    blocked = manager.claim_control(second)
    assert blocked.is_owner is False
    assert blocked.owner_present is True

    manager.release_control(first)

    assert manager.claim_control(second).is_owner is True


def test_a_silent_owner_loses_the_lease_to_a_waiting_session() -> None:
    # A tablet off Wi-Fi keeps its socket open; without this its lease blocks
    # every other operator, and every resume, until the socket finally dies.
    clock = MovableClock()
    manager = RuntimeSessionManager(lease_timeout_sec=10.0, clock=clock)
    owner = manager.connect()
    waiting = manager.connect()
    manager.claim_control(owner)

    clock.now = 11.0

    assert manager.claim_control(waiting).is_owner is True
    assert manager.is_control_owner(owner.id) is False


def test_a_live_but_idle_owner_keeps_the_lease() -> None:
    clock = MovableClock()
    manager = RuntimeSessionManager(lease_timeout_sec=10.0, clock=clock)
    owner = manager.connect()
    waiting = manager.connect()
    manager.claim_control(owner)

    # The dashboard pings while the operator reads the screen and moves nothing.
    for tick in (3.0, 6.0, 9.0, 12.0):
        clock.now = tick
        manager.record_activity(owner.id)

    blocked = manager.claim_control(waiting)

    assert blocked.is_owner is False
    assert blocked.owner_present is True
    assert manager.is_control_owner(owner.id) is True


def test_a_lease_stuck_mid_release_is_also_dropped_once_stale() -> None:
    clock = MovableClock()
    manager = RuntimeSessionManager(lease_timeout_sec=10.0, clock=clock)
    owner = manager.connect()
    waiting = manager.connect()
    manager.claim_control(owner)
    assert manager.begin_control_release(owner) is True

    clock.now = 11.0

    assert manager.claim_control(waiting).is_owner is True


def test_disconnect_releases_control_without_promoting_a_waiting_session() -> None:
    manager = RuntimeSessionManager()
    owner = manager.connect()
    waiting = manager.connect()
    manager.claim_control(owner)
    manager.claim_control(waiting)

    manager.disconnect(owner)

    snapshot = manager.control_snapshot(waiting.id)
    assert snapshot.owner_present is False
    assert snapshot.is_owner is False


def test_only_tracks_targets_that_still_have_nonzero_teleop() -> None:
    manager = RuntimeSessionManager()
    session = manager.connect()
    moving = TeleopCommand(
        angular=TeleopVector3(),
        linear=TeleopVector3(x=0.4),
        mode=3,
        seq=1,
    )
    zero = TeleopCommand(
        angular=TeleopVector3(),
        linear=TeleopVector3(),
        mode=3,
        seq=2,
    )

    manager.record_teleop_command(session, moving)
    assert manager.moving_teleop_commands(session) == (moving,)

    manager.record_teleop_command(session, zero)
    assert manager.moving_teleop_commands(session) == ()


def test_release_waits_for_inflight_command_then_blocks_commands_and_handover() -> None:
    manager = RuntimeSessionManager()
    owner = manager.connect()
    waiting = manager.connect()
    manager.claim_control(owner)
    operation_started = Event()
    allow_operation_to_finish = Event()
    release_finished = Event()

    def blocking_operation() -> None:
        operation_started.set()
        assert allow_operation_to_finish.wait(timeout=2)

    command_thread = Thread(target=lambda: manager.execute_if_control_owner(owner.id, blocking_operation))
    command_thread.start()
    assert operation_started.wait(timeout=2)

    assert manager.begin_control_release(owner) is True
    assert manager.claim_control(waiting).is_owner is False

    def wait_for_release() -> None:
        manager.wait_for_control_operations(owner)
        release_finished.set()

    release_thread = Thread(target=wait_for_release)
    release_thread.start()
    assert not release_finished.wait(timeout=0.05)

    allow_operation_to_finish.set()
    command_thread.join(timeout=2)
    release_thread.join(timeout=2)

    assert release_finished.is_set()
    with pytest.raises(RuntimeControlNotOwnedError):
        manager.execute_if_control_owner(owner.id, lambda: None)

    manager.finish_control_release(owner)
    assert manager.claim_control(waiting).is_owner is True


def test_the_snapshot_reports_what_the_controlling_session_is_doing() -> None:
    # A supervisor on another screen must read the operating session, not its
    # own browser's copy of a frame and mode it never saw chosen.
    manager = RuntimeSessionManager()
    owner = manager.connect()
    observer = manager.connect()
    manager.claim_control(owner)

    assert manager.control_snapshot(observer.id).owner_moving is False

    manager.record_teleop_command(
        owner,
        TeleopCommand(
            angular=TeleopVector3(),
            frame_id="ft_frame",
            linear=TeleopVector3(x=0.2),
            mode=0,
            seq=1,
            target="/tablet_cartesian_command",
        ),
    )
    manager.record_mode_request(owner.id, "geometric/snake")

    seen = manager.control_snapshot(observer.id)
    assert seen.owner_moving is True
    assert seen.owner_frame_id == "ft_frame"
    assert seen.owner_mode_request == "geometric/snake"
    assert seen.is_owner is False


def test_a_released_command_stops_reading_as_movement() -> None:
    manager = RuntimeSessionManager()
    owner = manager.connect()
    manager.claim_control(owner)
    moving = TeleopCommand(
        angular=TeleopVector3(),
        frame_id="ft_frame",
        linear=TeleopVector3(x=0.2),
        mode=0,
        seq=1,
        target="/tablet_cartesian_command",
    )
    manager.record_teleop_command(owner, moving)
    manager.record_teleop_command(
        owner,
        TeleopCommand(
            angular=TeleopVector3(),
            frame_id="ft_frame",
            linear=TeleopVector3(),
            mode=0,
            seq=2,
            target=moving.target,
        ),
    )

    seen = manager.control_snapshot("")
    assert seen.owner_moving is False
    # The next command carries the frame the operator last chose, moving or not.
    assert seen.owner_frame_id == "ft_frame"


def moving_command(frame_id: str = "hybrid_frame") -> TeleopCommand:
    return TeleopCommand(
        angular=TeleopVector3(),
        frame_id=frame_id,
        linear=TeleopVector3(x=0.2),
        mode=0,
        seq=1,
        target="/tablet_cartesian_command",
    )


def test_stop_ends_the_mirrored_motion_and_mode() -> None:
    manager = RuntimeSessionManager()
    owner = manager.connect()
    manager.claim_control(owner)
    manager.record_teleop_command(owner, moving_command())
    manager.record_mode_request(owner.id, "geometric/both")

    manager.record_runtime_stop("/tablet_cartesian_command")

    seen = manager.control_snapshot("")
    assert seen.owner_moving is False
    assert seen.owner_mode_request == "behaviour/passthrough"
    assert seen.owner_frame_id == "hybrid_frame"


def test_a_joint_target_is_not_mirrored_as_a_lasting_mode() -> None:
    manager = RuntimeSessionManager()
    owner = manager.connect()
    manager.claim_control(owner)
    manager.record_mode_request(owner.id, "Geometric/Both")

    manager.record_mode_request(owner.id, "behaviour/joint_target/home")
    manager.record_mode_request(owner.id, "not a mode")

    assert manager.control_snapshot("").owner_mode_request == "geometric/both"


def test_a_frame_chosen_while_idle_is_mirrored() -> None:
    manager = RuntimeSessionManager()
    owner = manager.connect()
    manager.claim_control(owner)
    zero = replace(moving_command("ft_frame"), linear=TeleopVector3())

    manager.record_teleop_command(owner, zero)

    seen = manager.control_snapshot("")
    assert (seen.owner_moving, seen.owner_frame_id) == (False, "ft_frame")


def test_read_only_sessions_cannot_crowd_out_an_operator() -> None:
    """Filling every slot with mirrors left the operator unable to claim control or resume a STOP."""
    manager = RuntimeSessionManager(max_sessions=4)

    mirrors = []
    for _ in range(2):
        mirrors.append(manager.connect(read_only=True))

    with pytest.raises(RuntimeSessionLimitError):
        manager.connect(read_only=True)

    # The half kept back is still there for whoever can actually drive.
    operator = manager.connect()
    assert operator.id not in {mirror.id for mirror in mirrors}

    manager.disconnect(mirrors[0])
    assert manager.connect(read_only=True) is not None
