"""A saved pose sent to the manager's pose_target topic, followed in the command state and kept in the store."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import pytest

from libs.db.sqlite import apply_sqlite_migrations, sqlite_connection
from libs.sessions.command_state import (
    BY_ROBOT,
    BY_SERVER,
    CommandStateStore,
    CommandStateTracker,
    PoseTargetSpec,
    manager_key,
)
from libs.sessions.positions import (
    CartesianPose,
    JointPose,
    PositionLibraryError,
    SQLitePositionStore,
    pose_target_payload,
)

BEHAVIOUR = manager_key("behaviour")
TARGET = manager_key("target")
POSE_TYPE = "geometry_msgs/msg/PoseStamped"
HAND = CartesianPose(frame_id="base_link", position=(0.6, 0.27, 0.22), orientation=(0.0, 0.0, 0.0, 1.0))


class Clock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def store() -> CommandStateStore:
    return CommandStateStore(wall_clock=lambda: datetime(2026, 9, 29, tzinfo=timezone.utc))


@pytest.fixture
def tracker(store: CommandStateStore, clock: Clock) -> CommandStateTracker:
    return CommandStateTracker(store, clock=clock, pose_target_timeout_sec=30.0)


def value_source(store: CommandStateStore, key: str) -> tuple[object, str]:
    held = store.get(key)
    assert held is not None, key
    return held.value, held.source


def test_a_pose_target_publish_is_the_managers_pose_target_with_no_name(
    tracker: CommandStateTracker, store: CommandStateStore
) -> None:
    tracker.record_publish("/pose_target", POSE_TYPE, pose_target_payload(HAND), "s1")

    assert value_source(store, BEHAVIOUR) == ("behaviour/pose_target", "commanded")
    assert value_source(store, TARGET) == (None, "commanded")


def test_without_a_status_the_hand_reaching_the_pose_ends_it(
    tracker: CommandStateTracker, store: CommandStateStore
) -> None:
    tracker.record_publish("/pose_target", POSE_TYPE, pose_target_payload(HAND))

    tracker.record_ee_pose("base_link", (0.5, 0.27, 0.22), (0.0, 0.0, 0.0, 1.0))
    assert value_source(store, BEHAVIOUR) == ("behaviour/pose_target", "commanded")

    # Inside the manager's default 5 cm tolerance, with the slack for measurement noise.
    tracker.record_ee_pose("base_link", (0.63, 0.27, 0.22), (0.0, 0.0, 0.0, 1.0))
    assert value_source(store, BEHAVIOUR) == ("behaviour/passthrough", "measured")
    assert store.get(BEHAVIOUR).by == BY_ROBOT


def test_the_managers_configured_tolerance_applies_to_a_saved_pose(
    tracker: CommandStateTracker, store: CommandStateStore
) -> None:
    ready = PoseTargetSpec("base_link", (0.6, 0.27, 0.22), (-0.22, 0.85, 0.11, 0.45), 0.01, 0.05)
    tracker.set_pose_targets("/mode_request", {"ready": ready})
    tracker.record_publish("/pose_target", POSE_TYPE, pose_target_payload(HAND))

    tracker.record_ee_pose("base_link", (0.63, 0.27, 0.22), (0.0, 0.0, 0.0, 1.0))
    assert value_source(store, BEHAVIOUR) == ("behaviour/pose_target", "commanded")
    tracker.record_ee_pose("base_link", (0.605, 0.27, 0.22), (0.0, 0.0, 0.0, 1.0))
    assert value_source(store, BEHAVIOUR) == ("behaviour/passthrough", "measured")


def test_a_hand_pose_in_another_frame_does_not_end_it(tracker: CommandStateTracker, store: CommandStateStore) -> None:
    tracker.record_publish("/pose_target", POSE_TYPE, pose_target_payload(HAND))

    tracker.record_ee_pose("world", (0.6, 0.27, 0.22), (0.0, 0.0, 0.0, 1.0))
    assert value_source(store, BEHAVIOUR) == ("behaviour/pose_target", "commanded")


def test_a_pose_target_nobody_can_see_end_reads_unknown(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    tracker.record_publish("/pose_target", POSE_TYPE, pose_target_payload(HAND))

    clock.now += 31
    tracker.tick()
    assert value_source(store, BEHAVIOUR)[1] == "unknown"
    assert store.get(BEHAVIOUR).by == BY_SERVER


def test_with_a_status_the_manager_reports_the_move_and_its_end(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    passthrough = {"shaping": "geometric/both", "behaviour": "behaviour/passthrough", "target": None}
    tracker.record_manager_status(passthrough)
    tracker.record_publish("/pose_target", POSE_TYPE, pose_target_payload(HAND))
    assert value_source(store, BEHAVIOUR) == ("behaviour/pose_target", "commanded")

    tracker.record_manager_status({**passthrough, "behaviour": "behaviour/pose_target"})
    assert value_source(store, BEHAVIOUR) == ("behaviour/pose_target", "measured")
    # The status, not the hand pose, says when it ended.
    tracker.record_ee_pose("base_link", (0.6, 0.27, 0.22), (0.0, 0.0, 0.0, 1.0))
    assert value_source(store, BEHAVIOUR) == ("behaviour/pose_target", "measured")

    clock.now += 4
    tracker.record_manager_status(passthrough)
    assert value_source(store, BEHAVIOUR) == ("behaviour/passthrough", "measured")


def test_a_pose_target_the_status_never_took_up_returns_to_what_it_reports(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    # Already at the pose, the manager goes in and out between two status publishes; or it refused the frame.
    passthrough = {"shaping": "geometric/both", "behaviour": "behaviour/passthrough", "target": None}
    tracker.record_manager_status(passthrough)
    tracker.record_publish("/pose_target", POSE_TYPE, pose_target_payload(HAND))

    clock.now += 1.1
    tracker.tick()
    assert value_source(store, BEHAVIOUR) == ("behaviour/passthrough", "measured")


def test_a_payload_that_is_not_a_pose_changes_no_manager_state(
    tracker: CommandStateTracker, store: CommandStateStore
) -> None:
    tracker.record_publish("/pose_target", POSE_TYPE, {"pose": {"position": {"x": "far"}}})

    assert store.get(BEHAVIOUR) is None


# The hand pose itself


def test_a_hand_pose_is_validated_and_normalized() -> None:
    pose = CartesianPose(frame_id="base_link", position=(1, 2, 3), orientation=(0, 0, 0, 2))
    assert pose.orientation == (0.0, 0.0, 0.0, 1.0)
    assert pose.position == (1.0, 2.0, 3.0)
    for frame_id, position, orientation in (
        ("base link", (0, 0, 0), (0, 0, 0, 1)),
        ("base_link", (0, 0, float("inf")), (0, 0, 0, 1)),
        ("base_link", (0, 0, 0), (0, 0, 0, 0)),
        ("base_link", (0, 0), (0, 0, 0, 1)),
    ):
        with pytest.raises(PositionLibraryError):
            CartesianPose(frame_id=frame_id, position=position, orientation=orientation)


def test_an_unreadable_stored_hand_pose_loads_as_none() -> None:
    assert CartesianPose.from_json({"frame_id": "base_link", "position": [0, 0]}) is None
    assert CartesianPose.from_json("nope") is None
    assert CartesianPose.from_json(HAND.to_json()) == HAND


def test_the_hand_pose_survives_a_restart(tmp_path: Path) -> None:
    store = SQLitePositionStore(tmp_path / "bloom.db")
    store.replace(
        "cfg",
        "app",
        [
            JointPose(name="pose_1", joint_names=("j1",), positions=(0.1,), ee_pose=HAND),
            JointPose(name="pose_2", joint_names=("j1",), positions=(0.2,)),
        ],
    )

    loaded = SQLitePositionStore(tmp_path / "bloom.db").load("cfg", "app")
    assert [pose.ee_pose for pose in loaded] == [HAND, None]


def test_a_store_from_before_the_hand_pose_gains_the_column_and_keeps_its_poses(tmp_path: Path) -> None:
    path = tmp_path / "bloom.db"
    with sqlite_connection(path) as connection:
        apply_sqlite_migrations(connection)
        connection.execute("ALTER TABLE saved_positions DROP COLUMN ee_pose_json")
        connection.execute("DELETE FROM schema_migrations WHERE version = 10")
        connection.execute(
            "INSERT INTO saved_positions (config_id, app_id, position, name, joint_names_json, positions_json)"
            " VALUES ('cfg', 'app', 0, 'home', ?, ?)",
            (json.dumps(["j1"]), json.dumps([0.5])),
        )
        connection.commit()

    loaded = SQLitePositionStore(path).load("cfg", "app")
    assert [(pose.name, pose.ee_pose) for pose in loaded] == [("home", None)]
    with sqlite3.connect(path) as connection:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(saved_positions)")}
    assert "ee_pose_json" in columns


# The Go to monitor: progress, arrival and the watchdog

from libs.sessions.command_state import parameter_key  # noqa: E402
from libs.sessions.go_to import GO_KEY, GoToMonitor, read_manager_facts  # noqa: E402

GO_TARGET = CartesianPose("base_link", (0.6, 0.27, 0.22), (0.0, 0.0, 0.0, 1.0))


class Hand:
    def __init__(self, x: float, measured: bool = True) -> None:
        self.x = x
        self.measured = measured

    def __call__(self) -> tuple[CartesianPose, bool]:
        return CartesianPose("base_link", (self.x, 0.27, 0.22), (0.0, 0.0, 0.0, 1.0)), self.measured


def monitor_for(store: CommandStateStore, clock: Clock, hand: Hand) -> tuple[GoToMonitor, list[str]]:
    cancelled: list[str] = []
    monitor = GoToMonitor(store, hand=hand, cancel=cancelled.append, clock=clock)
    monitor.start("pose_1", "cfg", "app", GO_TARGET, "/mode_request", linear_speed=0.05, angular_speed=0.2)
    return monitor, cancelled


def go_record(store: CommandStateStore) -> dict:
    return store.get(GO_KEY).value


def test_the_monitor_reports_moving_then_arrived_on_the_measured_tip(store: CommandStateStore, clock: Clock) -> None:
    hand = Hand(0.5)
    monitor, cancelled = monitor_for(store, clock, hand)
    store.write(BEHAVIOUR, "behaviour/pose_target", "measured", BY_ROBOT)

    clock.now += 1
    hand.x = 0.55
    monitor.tick()
    assert go_record(store) | {} == {
        "name": "pose_1",
        "config_id": "cfg",
        "app_id": "app",
        "state": "moving",
        "offset_mm": 50,
        "offset_deg": 0,
        "measured": True,
    }

    clock.now += 1
    hand.x = 0.595
    store.write(BEHAVIOUR, "behaviour/passthrough", "measured", BY_ROBOT)
    monitor.tick()
    assert go_record(store)["state"] == "arrived"
    assert go_record(store)["offset_mm"] == 5
    assert monitor.active_name("cfg", "app") is None
    assert cancelled == []


def test_passthrough_far_from_the_pose_is_stopped_before_it(store: CommandStateStore, clock: Clock) -> None:
    hand = Hand(0.4, measured=False)
    monitor, _ = monitor_for(store, clock, hand)
    store.write(BEHAVIOUR, "behaviour/passthrough", "reset", BY_SERVER)

    monitor.tick()
    assert go_record(store)["state"] == "stopped"
    assert go_record(store)["measured"] is False
    assert store.get(GO_KEY).source == "commanded"


def test_a_pose_the_tip_stops_closing_in_on_is_cancelled(store: CommandStateStore, clock: Clock) -> None:
    hand = Hand(0.5)
    monitor, cancelled = monitor_for(store, clock, hand)
    store.write(BEHAVIOUR, "behaviour/pose_target", "measured", BY_ROBOT)

    clock.now += 1
    hand.x = 0.52
    monitor.tick()
    clock.now += 2.5
    hand.x = 0.521
    monitor.tick()
    assert cancelled == []
    clock.now += 1
    monitor.tick()
    assert cancelled == ["/mode_request"]
    assert go_record(store)["state"] == "unreachable"


def test_a_move_that_takes_three_times_too_long_is_cancelled(store: CommandStateStore, clock: Clock) -> None:
    hand = Hand(0.5)
    monitor, cancelled = monitor_for(store, clock, hand)
    store.write(BEHAVIOUR, "behaviour/pose_target", "measured", BY_ROBOT)

    # 10 cm at 5 cm/s: 3 x 2 s + 5 s. Keep closing in, slowly, so only the deadline trips.
    for _ in range(10):
        clock.now += 1.0
        hand.x += 0.003
        monitor.tick()
    assert cancelled == []
    clock.now += 1.5
    hand.x += 0.003
    monitor.tick()
    assert cancelled == ["/mode_request"]


def test_a_cancel_that_fails_still_ends_the_record(store: CommandStateStore, clock: Clock) -> None:
    def refuse(_topic: str) -> None:
        raise RuntimeError("no publisher")

    monitor = GoToMonitor(store, hand=Hand(0.5), cancel=refuse, clock=clock)
    monitor.start("pose_1", "cfg", "app", GO_TARGET, "/mode_request", 0.05, 0.2)
    store.write(BEHAVIOUR, "behaviour/pose_target", "measured", BY_ROBOT)
    clock.now += 4
    monitor.tick()
    assert go_record(store)["state"] == "unreachable"


def test_the_monitor_waits_while_the_behaviour_is_unknown(store: CommandStateStore, clock: Clock) -> None:
    monitor, _ = monitor_for(store, clock, Hand(0.5))
    store.write(BEHAVIOUR, None, "unknown", BY_SERVER)
    monitor.tick()
    assert go_record(store)["state"] == "going"
    assert monitor.active_name("cfg", "app") == "pose_1"
    assert monitor.active_name("cfg", "other") is None


def test_the_facts_prefer_what_the_manager_and_controller_report(store: CommandStateStore) -> None:
    facts = read_manager_facts(store, "/cartesian_manager", "/qontrol_explorer")
    assert (facts.base_frame, facts.pose_target_topic, facts.mode_topic) == (None, "/pose_target", "/mode_request")
    assert (facts.linear_speed, facts.angular_speed) == (0.025, 0.1)

    store.write(
        parameter_key("/cartesian_manager", "behaviours.pose_targets.max_linear_velocity"), 0.5, "measured", BY_ROBOT
    )
    store.write(parameter_key("/qontrol_explorer", "command_max_linear_velocity"), 0.03, "measured", BY_ROBOT)
    store.write("/max_linear", {"data": 0.08}, "commanded", BY_SERVER)
    facts = read_manager_facts(store, "/cartesian_manager", "/qontrol_explorer", "tool0", ("/max_linear", ""))
    # The live speed limit outranks the controller's configured one, and the smaller of it and the cap wins.
    assert facts.linear_speed == 0.08
    assert facts.tip_frame == "tool0"
