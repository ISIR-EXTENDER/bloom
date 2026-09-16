from threading import Event, Thread

import pytest

from libs.sessions import RuntimeSessionManager, TeleopCommand, TeleopVector3
from libs.sessions import RuntimeControlNotOwnedError


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
