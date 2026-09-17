from threading import Event, Thread

import pytest

from libs.sessions import RuntimeControlNotOwnedError, RuntimeSessionManager, TeleopCommand, TeleopVector3


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
            target="/joystick_cartesian_command",
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
        target="/joystick_cartesian_command",
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
    assert seen.owner_frame_id == ""
