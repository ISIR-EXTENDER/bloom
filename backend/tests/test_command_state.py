"""The command-state store and the tracker that writes it (ADR 0142)."""

from __future__ import annotations

import threading
from datetime import datetime, timezone

import pytest

from libs.sessions.command_state import (
    BY_OTHER,
    BY_ROBOT,
    BY_SERVER,
    INTENT_SCALING_ACTIVE_KEY,
    PETANQUE_STATE_KEY,
    SERVOING_ACTIVE_KEY,
    SHARED_CONTROL_ACTIVE_KEY,
    CommandStateStore,
    CommandStateTracker,
    EchoExpectingGateway,
    GripperFeedback,
    PoseTargetSpec,
    build_command_state_message,
    manager_key,
    normalize_payload,
    session_alias,
)

STRING = "std_msgs/msg/String"
BOOL = "std_msgs/msg/Bool"
FLOAT_ARRAY = "std_msgs/msg/Float64MultiArray"
GRIPPER = "/gripper_controller/commands"
SHAPING = manager_key("shaping")
BEHAVIOUR = manager_key("behaviour")
TARGET = manager_key("target")


class Clock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


def mode(data: str) -> dict:
    return {"data": data}


def entry(store: CommandStateStore, key: str) -> tuple[object, str, str]:
    held = store.get(key)
    assert held is not None, key
    return held.value, held.source, held.by


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def store() -> CommandStateStore:
    return CommandStateStore(wall_clock=lambda: datetime(2026, 9, 28, tzinfo=timezone.utc))


@pytest.fixture
def tracker(store: CommandStateStore, clock: Clock) -> CommandStateTracker:
    return CommandStateTracker(store, clock=clock)


# Store


def test_each_change_bumps_the_global_revision_and_stamps_the_entry(store: CommandStateStore) -> None:
    assert store.write("/a", 1, "commanded", "s1")
    assert store.write("/b", 2, "measured", BY_ROBOT)

    revision, snapshot = store.snapshot()

    assert revision == 2
    assert snapshot["/a"] == {
        "value": 1,
        "source": "commanded",
        "updated_at": "2026-09-28T00:00:00+00:00",
        "by": "s1",
        "revision": 1,
    }
    assert snapshot["/b"]["revision"] == 2


def test_an_identical_write_changes_nothing(store: CommandStateStore) -> None:
    store.write("/a", 1, "commanded", "s1")

    assert not store.write("/a", 1, "commanded", "s1")
    assert store.revision == 1
    assert store.write("/a", 1, "commanded", "s2")
    assert store.revision == 2


def test_keep_if_equal_leaves_an_equal_value_from_those_sources(store: CommandStateStore) -> None:
    store.write("/a", 1, "reset", BY_SERVER)

    assert not store.write("/a", 1, "commanded", BY_OTHER, keep_if_equal=("reset",))
    assert entry(store, "/a") == (1, "reset", BY_SERVER)
    assert store.write("/a", 2, "commanded", BY_OTHER, keep_if_equal=("reset",))


def test_mark_unknown_touches_only_held_keys(store: CommandStateStore) -> None:
    store.write("/a", 1, "commanded", "s1")

    assert store.mark_unknown(("/a", "/never"), BY_SERVER) == 1
    assert entry(store, "/a") == (None, "unknown", BY_SERVER)
    assert store.get("/never") is None
    assert store.mark_unknown(("/a",), BY_SERVER) == 0


def test_listeners_hear_each_change_and_can_leave(store: CommandStateStore) -> None:
    heard: list[int] = []
    unsubscribe = store.subscribe(lambda: heard.append(store.revision))

    store.write("/a", 1, "commanded", "s1")
    store.write("/a", 1, "commanded", "s1")
    unsubscribe()
    store.write("/a", 2, "commanded", "s1")

    assert heard == [1]


def test_a_failing_listener_does_not_break_the_writer(store: CommandStateStore) -> None:
    def broken() -> None:
        raise RuntimeError("loop closed")

    store.subscribe(broken)

    assert store.write("/a", 1, "commanded", "s1")


def test_concurrent_writers_never_lose_a_revision(store: CommandStateStore) -> None:
    def write(prefix: str) -> None:
        for index in range(500):
            store.write(f"{prefix}{index % 7}", index, "commanded", prefix)

    threads = [threading.Thread(target=write, args=(f"/t{n}/",)) for n in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    revision, snapshot = store.snapshot()
    assert revision == 2000
    assert max(item["revision"] for item in snapshot.values()) == revision


def test_the_socket_message_carries_the_whole_snapshot(store: CommandStateStore) -> None:
    store.write("/a", {"data": True}, "commanded", "s1")

    message = build_command_state_message(store)

    assert message["type"] == "command_state"
    assert message["revision"] == 1
    assert set(message["snapshot"]) == {"/a"}


def test_payloads_reduce_to_one_shape_for_both_directions() -> None:
    assert normalize_payload(FLOAT_ARRAY, {"data": [1], "layout": {"dim": []}}) == {"data": [1.0]}
    assert normalize_payload("std_msgs/msg/Float64", {"data": 1}) == {"data": 1.0}
    assert normalize_payload("std_msgs/msg/Int32MultiArray", {"data": [1.0, 2.0]}) == {"data": [1, 2]}
    assert normalize_payload(BOOL, {"data": True}) == {"data": True}
    assert normalize_payload("pkg/msg/Other", {"x": 1}) == {"x": 1}


def test_sessions_are_named_by_alias_never_by_their_secret_id() -> None:
    alias = session_alias("secret-session")

    assert alias != "secret-session" and len(alias) == 12
    assert session_alias("") == "api"


# Bloom publishes and mode requests


def test_a_geometric_request_sets_shaping_only(tracker: CommandStateTracker, store: CommandStateStore) -> None:
    tracker.record_publish("/mode_request", STRING, mode("Geometric/Snake"), "s1")

    assert entry(store, SHAPING) == ("geometric/snake", "commanded", session_alias("s1"))
    assert entry(store, "/mode_request") == ({"data": "geometric/snake"}, "commanded", session_alias("s1"))
    assert store.get(BEHAVIOUR) is None


def test_a_joint_target_is_one_shot(tracker: CommandStateTracker, store: CommandStateStore) -> None:
    tracker.record_publish("/mode_request", STRING, mode("behaviour/joint_target/home"), "s1")

    assert entry(store, TARGET)[0] == "behaviour/joint_target/home"
    assert entry(store, BEHAVIOUR)[0] == "behaviour/passthrough"


def test_passthrough_clears_the_target(tracker: CommandStateTracker, store: CommandStateStore) -> None:
    tracker.record_publish("/mode_request", STRING, mode("behaviour/pose_target/ready"), "s1")
    tracker.record_publish("/mode_request", STRING, mode("behaviour/passthrough"), "s1")

    assert entry(store, BEHAVIOUR)[0] == "behaviour/passthrough"
    assert entry(store, TARGET)[0] is None


def test_intent_scaling_and_shared_control_last_and_replace_each_other(
    tracker: CommandStateTracker, store: CommandStateStore
) -> None:
    tracker.record_publish("/mode_request", STRING, mode("behaviour/joint_target/home"), "s1")
    tracker.record_publish("/mode_request", STRING, mode("Behaviour/Intent-Scaling"), "s1")
    assert entry(store, BEHAVIOUR) == ("behaviour/intent_scaling", "commanded", session_alias("s1"))
    assert entry(store, TARGET)[0] is None

    tracker.record_publish("/mode_request", STRING, mode("behaviour/shared_control"), "s1")
    assert entry(store, BEHAVIOUR)[0] == "behaviour/shared_control"

    # The reset enters shared control too, with the confidences cleared on the manager's side.
    tracker.record_publish("/mode_request", STRING, mode("behaviour/passthrough"), "s1")
    tracker.record_publish("/mode_request", STRING, mode("behaviour/shared_control/reset"), "s1")
    assert entry(store, BEHAVIOUR)[0] == "behaviour/shared_control"
    assert entry(store, "/mode_request")[0] == {"data": "behaviour/shared_control/reset"}

    tracker.record_publish("/mode_request", STRING, mode("behaviour/passthrough"), "s1")
    assert entry(store, BEHAVIOUR)[0] == "behaviour/passthrough"


def test_a_behaviour_is_measured_while_its_feedback_streams(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    tracker.record_publish("/mode_request", STRING, mode("behaviour/intent_scaling"), "s1")
    clock.now += 0.1
    tracker.record_behaviour_active("behaviour/intent_scaling")
    assert entry(store, INTENT_SCALING_ACTIVE_KEY) == (True, "measured", BY_ROBOT)
    assert entry(store, BEHAVIOUR) == ("behaviour/intent_scaling", "measured", BY_ROBOT)

    # A request just sent may not have reached the manager: its old feedback does not undo the request.
    tracker.record_publish("/mode_request", STRING, mode("behaviour/shared_control"), "s1")
    clock.now += 0.1
    tracker.record_behaviour_active("behaviour/intent_scaling")
    assert entry(store, BEHAVIOUR)[0] == "behaviour/shared_control"

    # Past the settle window, feedback that disagrees is the manager's word: someone else switched it.
    clock.now += 1.0
    tracker.record_behaviour_active("behaviour/intent_scaling")
    assert entry(store, BEHAVIOUR) == ("behaviour/intent_scaling", "measured", BY_ROBOT)

    # Silence ends it: the manager left, and only a request nobody saw says for what.
    clock.now += 0.6
    tracker.tick()
    assert entry(store, INTENT_SCALING_ACTIVE_KEY) == (False, "measured", BY_ROBOT)
    assert entry(store, BEHAVIOUR)[1] == "unknown"
    assert store.get(SHARED_CONTROL_ACTIVE_KEY) is None


def test_behaviour_feedback_on_another_mode_topic_ends_that_topics_behaviour(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    tracker.record_publish("/arm2/mode_request", STRING, mode("behaviour/intent_scaling"), "s1")
    clock.now += 1.0
    tracker.record_behaviour_active("behaviour/intent_scaling", "/arm2/mode_request")
    assert entry(store, "manager:behaviour@/arm2/mode_request")[1] == "measured"

    clock.now += 0.6
    tracker.tick()
    assert entry(store, "manager:behaviour@/arm2/mode_request")[1] == "unknown"
    assert store.get(BEHAVIOUR) is None


def test_a_lost_manager_forgets_its_behaviour_feedback(tracker: CommandStateTracker, store: CommandStateStore) -> None:
    tracker.record_behaviour_active("behaviour/shared_control")
    assert entry(store, SHARED_CONTROL_ACTIVE_KEY)[0] is True

    tracker.mark_manager_lost()
    assert entry(store, SHARED_CONTROL_ACTIVE_KEY) == (None, "unknown", BY_SERVER)


def test_another_mode_topic_keeps_its_own_manager_states(
    tracker: CommandStateTracker, store: CommandStateStore
) -> None:
    tracker.record_publish("/arm2/mode_request", STRING, mode("geometric/jaco"), "s1")

    assert entry(store, "manager:shaping@/arm2/mode_request")[0] == "geometric/jaco"
    assert store.get(SHAPING) is None


def test_digital_outputs_are_kept_per_pin(tracker: CommandStateTracker, store: CommandStateStore) -> None:
    tracker.record_publish("/hub/digital_output", "std_msgs/msg/Float32MultiArray", {"data": [3, 1, 5, 0]}, "s1")
    tracker.record_publish("/hub/digital_output", "std_msgs/msg/Float32MultiArray", {"data": [5, 1]}, "s1")

    assert entry(store, "/hub/digital_output:3")[0] is True
    assert entry(store, "/hub/digital_output:5")[0] is True
    assert store.get("/hub/digital_output") is None


def test_a_service_call_is_recorded_unless_the_service_refused(
    tracker: CommandStateTracker, store: CommandStateStore
) -> None:
    tracker.record_service("/fault_controller/reset_fault", {}, False, "s1")
    assert store.get("service:/fault_controller/reset_fault") is None

    tracker.record_service("/fault_controller/reset_fault", {}, True, "s1")
    assert entry(store, "service:/fault_controller/reset_fault")[0] == {"request": {}, "success": True}


def test_a_reset_is_the_servers(tracker: CommandStateTracker, store: CommandStateStore) -> None:
    tracker.record_publish("/mode_request", STRING, mode("geometric/snake"), "s1")
    tracker.record_reset("/mode_request", STRING, mode("geometric/both"))

    assert entry(store, SHAPING) == ("geometric/both", "reset", BY_SERVER)


# Echoes


def test_another_publisher_shows_up_as_commanded(tracker: CommandStateTracker, store: CommandStateStore) -> None:
    tracker.record_echo("/mode_request", STRING, mode("geometric/snake"))

    assert entry(store, SHAPING) == ("geometric/snake", "commanded", BY_OTHER)


def test_blooms_own_echo_changes_nothing_even_after_a_newer_reset(
    tracker: CommandStateTracker, store: CommandStateStore
) -> None:
    for sent in ("geometric/snake", "geometric/both"):
        tracker.expect_echo("/mode_request", STRING, mode(sent))
    tracker.record_publish("/mode_request", STRING, mode("geometric/snake"), "s1")
    tracker.record_reset("/mode_request", STRING, mode("geometric/both"))
    revision = store.revision

    tracker.record_echo("/mode_request", STRING, mode("geometric/snake"))
    tracker.record_echo("/mode_request", STRING, mode("geometric/both"))

    assert store.revision == revision
    assert entry(store, SHAPING) == ("geometric/both", "reset", BY_SERVER)


def test_an_echo_that_arrives_before_the_record_is_still_known(
    tracker: CommandStateTracker, store: CommandStateStore
) -> None:
    tracker.expect_echo(GRIPPER, FLOAT_ARRAY, {"data": [1.1]})
    tracker.record_echo(GRIPPER, FLOAT_ARRAY, {"data": [1.1]})
    tracker.record_publish(GRIPPER, FLOAT_ARRAY, {"data": [1.1]}, "s1")

    assert entry(store, GRIPPER) == ({"data": [1.1]}, "commanded", session_alias("s1"))


def test_an_expectation_expires_so_a_later_equal_message_counts(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    tracker.expect_echo(GRIPPER, FLOAT_ARRAY, {"data": [1.1]})
    clock.now += 5

    tracker.record_echo(GRIPPER, FLOAT_ARRAY, {"data": [1.1]})

    assert entry(store, GRIPPER)[2] == BY_OTHER


def test_the_gateway_wrapper_forgets_a_publish_that_failed(
    tracker: CommandStateTracker, store: CommandStateStore
) -> None:
    class Failing:
        def publish(self, request: object) -> object:
            raise RuntimeError("down")

    class Request:
        topic = GRIPPER
        message_type = FLOAT_ARRAY
        payload = {"data": [0.2]}

    with pytest.raises(RuntimeError):
        EchoExpectingGateway(Failing(), tracker).publish(Request())
    tracker.record_echo(GRIPPER, FLOAT_ARRAY, {"data": [0.2]})

    assert entry(store, GRIPPER)[2] == BY_OTHER


def test_an_equal_echo_does_not_overwrite_a_reset(tracker: CommandStateTracker, store: CommandStateStore) -> None:
    tracker.record_reset("/ui/visual_servoing/on", BOOL, {"data": False})

    tracker.record_echo("/ui/visual_servoing/on", BOOL, {"data": False})

    assert entry(store, "/ui/visual_servoing/on") == ({"data": False}, "reset", BY_SERVER)


# Parameters


def test_parameters_follow_events_and_confirmed_sets(tracker: CommandStateTracker, store: CommandStateStore) -> None:
    key = "param:/cartesian_manager:shapers.snake.gain"
    tracker.record_parameter("/cartesian_manager", "shapers.snake.gain", 0.5)
    assert entry(store, key) == (0.5, "measured", BY_ROBOT)

    tracker.record_parameter_set("/cartesian_manager", "shapers.snake.gain", 0.7, "set", "s1")
    assert entry(store, key) == (0.7, "measured", session_alias("s1"))
    revision = store.revision
    tracker.record_parameter("/cartesian_manager", "shapers.snake.gain", 0.7)
    assert store.revision == revision

    tracker.record_parameter_set("/cartesian_manager", "shapers.snake.gain", 0.9, "simulated", "s1")
    assert entry(store, key)[1] == "commanded"

    tracker.record_parameter("/cartesian_manager", "shapers.snake.gain", None)
    assert entry(store, key)[1] == "unknown"


def test_a_lost_node_makes_its_parameters_unknown(tracker: CommandStateTracker, store: CommandStateStore) -> None:
    tracker.record_parameter("/petanque_throw", "alpha", 0.2)
    tracker.record_parameter("/cartesian_manager", "shapers.snake.gain", 0.5)

    tracker.mark_node_lost("/petanque_throw")

    assert entry(store, "param:/petanque_throw:alpha")[1] == "unknown"
    assert entry(store, "param:/cartesian_manager:shapers.snake.gain")[1] == "measured"


def test_a_lost_manager_makes_its_states_unknown(tracker: CommandStateTracker, store: CommandStateStore) -> None:
    tracker.record_publish("/mode_request", STRING, mode("geometric/snake"), "s1")
    tracker.record_publish("/mode_request", STRING, mode("behaviour/joint_target/home"), "s1")

    tracker.mark_manager_lost()

    for key in (SHAPING, BEHAVIOUR, TARGET, "/mode_request"):
        assert entry(store, key)[1] == "unknown"


# Measured feedback


def kinova_tracker(store: CommandStateStore, clock: Clock) -> CommandStateTracker:
    gripper = GripperFeedback(
        topic=GRIPPER, joint_name="robotiq_85_left_knuckle_joint", open_position=0.0, close_position=0.8, tolerance=0.15
    )
    return CommandStateTracker(store, gripper=gripper, clock=clock)


def test_the_kinova_finger_is_measured_as_the_nearer_payload(store: CommandStateStore, clock: Clock) -> None:
    tracker = kinova_tracker(store, clock)

    tracker.record_joint_states(["joint_1", "robotiq_85_left_knuckle_joint"], [0.3, 0.78])
    assert entry(store, GRIPPER) == ({"data": [0.8]}, "measured", BY_ROBOT)

    tracker.record_joint_states(["robotiq_85_left_knuckle_joint"], [0.4])
    assert entry(store, GRIPPER)[0] == {"data": [0.8]}

    tracker.record_joint_states(["robotiq_85_left_knuckle_joint"], [0.05])
    assert entry(store, GRIPPER)[0] == {"data": [0.0]}


def test_a_fresh_command_is_not_contradicted_while_the_finger_travels(store: CommandStateStore, clock: Clock) -> None:
    tracker = kinova_tracker(store, clock)
    tracker.record_joint_states(["robotiq_85_left_knuckle_joint"], [0.0])
    tracker.record_publish(GRIPPER, FLOAT_ARRAY, {"data": [0.8]}, "s1")

    tracker.record_joint_states(["robotiq_85_left_knuckle_joint"], [0.0])
    assert entry(store, GRIPPER)[1] == "commanded"

    clock.now += 3
    tracker.record_joint_states(["robotiq_85_left_knuckle_joint"], [0.0])
    assert entry(store, GRIPPER) == ({"data": [0.0]}, "measured", BY_ROBOT)


def test_without_finger_feedback_the_gripper_stays_commanded(tracker: CommandStateTracker, store: CommandStateStore):
    tracker.record_publish(GRIPPER, FLOAT_ARRAY, {"data": [1.1]}, "s1")

    tracker.record_joint_states(["robotiq_85_left_knuckle_joint"], [0.0])

    assert entry(store, GRIPPER)[1] == "commanded"


def test_petanque_state_is_measured(tracker: CommandStateTracker, store: CommandStateStore) -> None:
    tracker.record_petanque_state("THROW")

    assert entry(store, PETANQUE_STATE_KEY) == ("THROW", "measured", BY_ROBOT)


def test_servoing_is_active_while_its_velocity_streams(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    tracker.start_servoing_liveness()
    tracker.tick()
    assert store.get(SERVOING_ACTIVE_KEY) is None

    clock.now += 0.6
    tracker.tick()
    assert entry(store, SERVOING_ACTIVE_KEY)[0] is False

    tracker.record_servoing_velocity()
    clock.now += 0.3
    tracker.tick()
    assert entry(store, SERVOING_ACTIVE_KEY)[0] is True

    clock.now += 0.3
    tracker.tick()
    assert entry(store, SERVOING_ACTIVE_KEY) == (False, "measured", BY_ROBOT)


READY = PoseTargetSpec(
    frame_id="base_link",
    position=(0.6, 0.27, 0.22),
    orientation=(0.0, 0.0, 0.0, 1.0),
    position_tolerance=0.01,
    orientation_tolerance=0.05,
)


def test_a_pose_target_ends_when_the_arm_reaches_it(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    tracker.set_pose_targets("/mode_request", {"ready": READY})
    tracker.record_publish("/mode_request", STRING, mode("behaviour/pose_target/ready"), "s1")
    assert entry(store, BEHAVIOUR)[0] == "behaviour/pose_target"
    assert entry(store, TARGET)[0] == "behaviour/pose_target/ready"

    tracker.record_ee_pose("base_link", (0.3, 0.2, 0.2), (0.0, 0.0, 0.0, 1.0))
    clock.now += 40
    tracker.record_ee_pose("base_link", (0.3, 0.2, 0.2), (0.0, 0.0, 0.0, 1.0))
    tracker.tick()
    assert entry(store, BEHAVIOUR)[0] == "behaviour/pose_target"

    tracker.record_ee_pose("base_link", (0.601, 0.27, 0.22), (0.0, 0.0, 0.01, 1.0))
    assert entry(store, BEHAVIOUR) == ("behaviour/passthrough", "measured", BY_ROBOT)


def test_a_pose_target_nobody_can_see_end_turns_unknown(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    tracker.set_pose_targets("/mode_request", {"ready": READY})
    tracker.record_publish("/mode_request", STRING, mode("behaviour/pose_target/ready"), "s1")
    # A pose in another frame cannot be compared.
    tracker.record_ee_pose("world", (0.6, 0.27, 0.22), (0.0, 0.0, 0.0, 1.0))

    clock.now += 29
    tracker.tick()
    assert entry(store, BEHAVIOUR)[0] == "behaviour/pose_target"

    clock.now += 2
    tracker.tick()
    assert entry(store, BEHAVIOUR) == (None, "unknown", BY_SERVER)


def test_an_unconfigured_pose_target_turns_unknown_after_the_timeout(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    tracker.record_publish("/mode_request", STRING, mode("behaviour/pose_target/elsewhere"), "s1")

    clock.now += 31
    tracker.tick()

    assert entry(store, BEHAVIOUR)[1] == "unknown"
