"""The command store on inputs the wire can carry but the model does not expect (ADR 0142)."""

from __future__ import annotations

from libs.sessions.command_state import (
    INTENT_SCALING_ACTIVE_KEY,
    SERVOING_ACTIVE_KEY,
    SHARED_CONTROL_ACTIVE_KEY,
    CommandStateStore,
    CommandStateTracker,
    manager_key,
    normalize_payload,
)


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def build() -> tuple[CommandStateStore, CommandStateTracker, Clock]:
    store = CommandStateStore()
    clock = Clock()
    tracker = CommandStateTracker(store, servoing_window_sec=0.5, behaviour_window_sec=0.5, clock=clock)
    return store, tracker, clock


def test_a_payload_that_is_not_a_mapping_or_whose_items_cannot_convert_is_kept_as_sent() -> None:
    assert normalize_payload("std_msgs/msg/Float64", [1.0]) == [1.0]
    assert normalize_payload("std_msgs/msg/Float64", "1.0") == "1.0"
    assert normalize_payload("std_msgs/msg/Float64MultiArray", {"data": [1.0, "x"]}) == {"data": [1.0, "x"]}
    assert normalize_payload("std_msgs/msg/Int32MultiArray", {"data": [1, None]}) == {"data": [1, None]}
    assert normalize_payload("std_msgs/msg/Int32", {"data": True}) == {"data": True}


def test_a_mode_request_the_manager_would_refuse_is_recorded_on_its_topic_and_moves_no_state() -> None:
    store, tracker, _clock = build()

    tracker.record_publish("/mode_request", "std_msgs/msg/String", {"data": "geometric/"})
    tracker.record_publish("/mode_request", "std_msgs/msg/String", {"data": "behaviour"})

    assert store.get("/mode_request").value == {"data": "behaviour"}
    assert store.get(manager_key("shaping")) is None
    assert store.get(manager_key("behaviour")) is None
    assert store.get(manager_key("target")) is None


def test_feedback_for_a_behaviour_the_store_does_not_model_is_ignored() -> None:
    store, tracker, _clock = build()

    tracker.record_behaviour_active("behaviour/pose_target")
    tracker.record_behaviour_active("")

    assert store.snapshot()[1] == {}


def test_a_behaviour_stays_active_while_its_feedback_keeps_coming_and_ends_once_it_stops() -> None:
    store, tracker, clock = build()
    tracker.record_publish("/mode_request", "std_msgs/msg/String", {"data": "behaviour/shared_control"})
    clock.now = 1.0
    tracker.record_behaviour_active("behaviour/shared_control")
    assert store.get(SHARED_CONTROL_ACTIVE_KEY).value is True
    assert store.get(manager_key("behaviour")).source == "measured"

    clock.now = 1.4
    tracker.tick()
    assert store.get(SHARED_CONTROL_ACTIVE_KEY).value is True
    assert store.get(manager_key("behaviour")).value == "behaviour/shared_control"

    clock.now = 2.0
    tracker.tick()
    assert store.get(SHARED_CONTROL_ACTIVE_KEY).value is False
    assert store.get(manager_key("behaviour")).source == "unknown"
    assert store.get(INTENT_SCALING_ACTIVE_KEY) is None


def test_servoing_seen_before_its_liveness_started_begins_the_window_itself() -> None:
    store, tracker, clock = build()

    tracker.record_servoing_velocity()
    assert store.get(SERVOING_ACTIVE_KEY).value is True

    clock.now = 0.4
    tracker.tick()
    assert store.get(SERVOING_ACTIVE_KEY).value is True
    clock.now = 0.6
    tracker.tick()
    assert store.get(SERVOING_ACTIVE_KEY).value is False


def test_an_end_effector_pose_with_no_target_running_writes_nothing() -> None:
    store, tracker, _clock = build()

    tracker.record_ee_pose("base_link", (0.0, 0.0, 0.0), (0.0, 0.0, 0.0, 1.0))

    assert store.snapshot() == (0, {})


def test_an_echo_on_a_topic_bloom_never_published_is_another_publishers() -> None:
    store, tracker, _clock = build()

    tracker.record_echo("/ui/lamp", "std_msgs/msg/Bool", {"data": True})

    assert store.get("/ui/lamp").by == "other-publisher"
    assert store.get("/ui/lamp").source == "commanded"
