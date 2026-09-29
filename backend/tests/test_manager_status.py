"""cartesian_manager's latched ~/status as the measurement for the manager's keys (ADR 0142, 2026-09-29)."""

from __future__ import annotations

import time
from types import SimpleNamespace
from typing import Any

import pytest

from libs.ros_adapters import RosPublishReceipt, RosPublishRequest
from libs.ros_adapters.command_state_feedback import RclpyCommandStateFeedback
from libs.ros_adapters.qos import LATCHED_QOS, RELIABLE, TRANSIENT_LOCAL, LatchedSubscription, QosChoice
from libs.sessions.command_state import (
    BY_OTHER,
    BY_ROBOT,
    BY_SERVER,
    INTENT_SCALING_ACTIVE_KEY,
    CommandStateStore,
    CommandStateTracker,
    PoseTargetSpec,
    manager_key,
    parse_manager_status,
    session_alias,
)
from libs.sessions.stop import RuntimeStopController
from libs.sessions.teleop import NoopTeleopCommandGateway

STRING = "std_msgs/msg/String"
SHAPING = manager_key("shaping")
BEHAVIOUR = manager_key("behaviour")
TARGET = manager_key("target")
INPUTS = manager_key("inputs")
OTHER_TOPIC = "/ui/mode_request"
S1 = session_alias("s1")


class Clock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


def status(
    geometric: str = "geometric/both",
    behaviour: str = "behaviour/passthrough",
    target: str = "",
    inputs: str = "joystick,tablet",
) -> dict[str, Any]:
    parsed = parse_manager_status(
        "cartesian_manager",
        [("geometric", geometric), ("behaviour", behaviour), ("target", target), ("inputs", inputs)],
    )
    assert parsed is not None
    return parsed


def mode(data: str) -> dict:
    return {"data": data}


def entry(store: CommandStateStore, key: str) -> tuple[object, str]:
    held = store.get(key)
    assert held is not None, key
    return held.value, held.source


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def store() -> CommandStateStore:
    return CommandStateStore()


@pytest.fixture
def tracker(store: CommandStateStore, clock: Clock) -> CommandStateTracker:
    return CommandStateTracker(store, clock=clock)


# Parsing


def test_a_full_status_maps_to_the_values_the_controls_compare_against() -> None:
    assert status("geometric/jaco", "behaviour/joint_target", "home", "joystick,tablet,visual_servoing") == {
        "shaping": "geometric/jaco",
        "behaviour": "behaviour/joint_target",
        "target": "behaviour/joint_target/home",
        "inputs": ["joystick", "tablet", "visual_servoing"],
    }
    assert status(behaviour="behaviour/pose_target", target="ready")["target"] == "behaviour/pose_target/ready"
    assert status()["target"] is None
    assert status(inputs="")["inputs"] == []


def test_a_later_behaviour_is_accepted_by_its_shape() -> None:
    assert status(behaviour="behaviour/intent_scaling")["behaviour"] == "behaviour/intent_scaling"
    assert status(behaviour="Behaviour/Shared-Control")["behaviour"] == "behaviour/shared_control"


def test_another_nodes_status_is_ignored() -> None:
    assert parse_manager_status("qontrol", [("geometric", "geometric/snake")]) is None
    assert parse_manager_status(None, []) is None


@pytest.mark.parametrize(
    ("pairs", "expected"),
    [
        ([], {}),
        ([("geometric", "geometric/translation")], {}),
        ([("geometric", "snake")], {}),
        ([("behaviour", "passthrough"), ("target", "home")], {}),
        ([("behaviour", "behaviour/"), ("target", "")], {}),
        ([("behaviour", "behaviour/pose_target/ready")], {}),
        ([("behaviour", "behaviour/pose_target")], {"behaviour": "behaviour/pose_target"}),
        (
            [("behaviour", "behaviour/pose_target"), ("target", "a/b")],
            {"behaviour": "behaviour/pose_target"},
        ),
        (
            [("behaviour", "behaviour/pose_target"), ("target", "Far-Left")],
            {"behaviour": "behaviour/pose_target", "target": "behaviour/pose_target/far_left"},
        ),
        ([("geometric", 3), (None, "x"), ("geometric", "geometric/snake")], {"shaping": "geometric/snake"}),
        ([("geometric", "geometric/jaco"), ("geometric", "geometric/snake")], {"shaping": "geometric/jaco"}),
        ([("inputs", " joystick , ,tablet ")], {"inputs": ["joystick", "tablet"]}),
    ],
)
def test_a_key_missing_or_unreadable_is_left_out(pairs: list, expected: dict) -> None:
    assert parse_manager_status("cartesian_manager", pairs) == expected


# Mapping and precedence


def test_the_first_status_seeds_every_manager_key_as_measured(
    tracker: CommandStateTracker, store: CommandStateStore
) -> None:
    tracker.record_manager_status(status("geometric/snake", "behaviour/pose_target", "ready"))

    assert entry(store, SHAPING) == ("geometric/snake", "measured")
    assert entry(store, BEHAVIOUR) == ("behaviour/pose_target", "measured")
    assert entry(store, TARGET) == ("behaviour/pose_target/ready", "measured")
    assert entry(store, INPUTS) == (["joystick", "tablet"], "measured")
    assert store.get(SHAPING).by == BY_ROBOT


def test_a_request_shows_as_asked_until_the_status_confirms_it(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    tracker.record_manager_status(status())
    tracker.record_publish("/mode_request", STRING, mode("geometric/jaco"), "s1")
    assert entry(store, SHAPING) == ("geometric/jaco", "commanded")

    clock.now += 0.02
    tracker.record_manager_status(status("geometric/jaco"))
    assert entry(store, SHAPING) == ("geometric/jaco", "measured")

    clock.now += 5
    tracker.tick()
    assert entry(store, SHAPING) == ("geometric/jaco", "measured")


def test_a_request_the_status_never_takes_up_reverts_to_the_status(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    tracker.record_manager_status(status())
    tracker.record_publish("/mode_request", STRING, mode("behaviour/pose_target/does_not_exist"), "s1")
    assert entry(store, BEHAVIOUR) == ("behaviour/pose_target", "commanded")
    assert entry(store, TARGET) == ("behaviour/pose_target/does_not_exist", "commanded")

    clock.now += 0.9
    tracker.tick()
    assert entry(store, BEHAVIOUR) == ("behaviour/pose_target", "commanded")

    clock.now += 0.1
    tracker.tick()
    assert entry(store, BEHAVIOUR) == ("behaviour/passthrough", "measured")
    assert entry(store, TARGET) == (None, "measured")


def test_an_unchanged_report_does_not_undo_a_request_still_travelling(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    tracker.record_manager_status(status())
    tracker.record_publish("/mode_request", STRING, mode("geometric/snake"), "s1")

    # Another input switched off before the manager read the request: its shaping line has not moved.
    tracker.record_manager_status(status(inputs="joystick"))
    assert entry(store, SHAPING) == ("geometric/snake", "commanded")
    assert entry(store, INPUTS) == (["joystick"], "measured")

    tracker.record_manager_status(status("geometric/snake", inputs="joystick"))
    assert entry(store, SHAPING) == ("geometric/snake", "measured")


def test_a_change_the_manager_reports_wins_over_a_pending_request(
    tracker: CommandStateTracker, store: CommandStateStore
) -> None:
    tracker.record_manager_status(status(behaviour="behaviour/pose_target", target="ready"))
    tracker.record_publish("/mode_request", STRING, mode("behaviour/pose_target/ready"), "s1")

    # The arm arrived: the manager went back to passthrough on its own.
    tracker.record_manager_status(status())
    assert entry(store, BEHAVIOUR) == ("behaviour/passthrough", "measured")
    assert entry(store, TARGET) == (None, "measured")


def test_a_joint_target_the_manager_ends_in_the_same_cycle_settles_on_passthrough(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    # cartesian_manager main dispatches a joint target and returns to passthrough before its next status.
    tracker.record_manager_status(status())
    tracker.record_publish("/mode_request", STRING, mode("behaviour/joint_target/home"), "s1")
    assert entry(store, TARGET) == ("behaviour/joint_target/home", "commanded")

    clock.now += 1
    tracker.tick()
    assert entry(store, TARGET) == (None, "measured")
    assert entry(store, BEHAVIOUR) == ("behaviour/passthrough", "measured")


def test_a_joint_target_the_manager_reports_reads_as_the_request(
    tracker: CommandStateTracker, store: CommandStateStore
) -> None:
    tracker.record_manager_status(status())
    tracker.record_publish("/mode_request", STRING, mode("behaviour/joint_target/home"), "s1")

    tracker.record_manager_status(status(behaviour="behaviour/joint_target", target="home"))

    assert entry(store, TARGET) == ("behaviour/joint_target/home", "measured")
    assert entry(store, BEHAVIOUR) == ("behaviour/joint_target", "measured")


def test_another_publishers_request_is_held_to_the_status_too(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    tracker.record_manager_status(status())
    tracker.record_echo("/mode_request", STRING, mode("geometric/snake"))
    assert store.get(SHAPING).by == BY_OTHER

    clock.now += 1
    tracker.tick()
    assert entry(store, SHAPING) == ("geometric/both", "measured")


def test_with_status_the_behaviour_feedback_no_longer_decides_the_behaviour(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    tracker.record_manager_status(status(behaviour="behaviour/intent_scaling"))
    tracker.record_behaviour_active("behaviour/shared_control")
    assert entry(store, BEHAVIOUR) == ("behaviour/intent_scaling", "measured")
    assert entry(store, "shared_control:active") == (True, "measured")

    tracker.record_behaviour_active("behaviour/intent_scaling")
    clock.now += 1
    tracker.tick()
    # The scale went quiet, but the status still reports intent scaling: the status stands.
    assert entry(store, INTENT_SCALING_ACTIVE_KEY) == (False, "measured")
    assert entry(store, BEHAVIOUR) == ("behaviour/intent_scaling", "measured")


def test_without_status_the_behaviour_feedback_is_the_fallback(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    tracker.record_publish("/mode_request", STRING, mode("geometric/jaco"), "s1")
    tracker.record_behaviour_active("behaviour/intent_scaling")
    assert entry(store, BEHAVIOUR) == ("behaviour/intent_scaling", "measured")

    clock.now += 1
    tracker.tick()
    assert entry(store, BEHAVIOUR) == (None, "unknown")
    # Nothing waits on a status that never came.
    clock.now += 5
    tracker.tick()
    assert entry(store, SHAPING) == ("geometric/jaco", "commanded")


def test_with_status_a_pose_target_ends_only_when_the_status_says_so(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    ready = PoseTargetSpec("base_link", (0.6, 0.27, 0.22), (0.0, 0.0, 0.0, 1.0), 0.01, 0.05)
    tracker.set_pose_targets("/mode_request", {"ready": ready})
    tracker.record_publish("/mode_request", STRING, mode("behaviour/pose_target/ready"), "s1")
    # A status seen after the request takes the pose target over from the ee_pose inference.
    tracker.record_manager_status(status(behaviour="behaviour/pose_target", target="ready"))

    tracker.record_ee_pose("base_link", (0.601, 0.27, 0.22), (0.0, 0.0, 0.0, 1.0))
    clock.now += 40
    tracker.tick()
    assert entry(store, BEHAVIOUR) == ("behaviour/pose_target", "measured")

    tracker.record_publish("/mode_request", STRING, mode("behaviour/pose_target/ready"), "s1")
    tracker.record_ee_pose("base_link", (0.601, 0.27, 0.22), (0.0, 0.0, 0.0, 1.0))
    clock.now += 40
    tracker.tick()
    assert entry(store, BEHAVIOUR) == ("behaviour/pose_target", "measured")


def test_a_lost_manager_forgets_its_status_and_the_next_one_reseeds(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    tracker.record_manager_status(status("geometric/snake"))
    tracker.record_publish("/mode_request", STRING, mode("geometric/jaco"), "s1")

    tracker.mark_manager_lost()
    for key in (SHAPING, BEHAVIOUR, TARGET, INPUTS):
        assert entry(store, key) == (None, "unknown")
    clock.now += 5
    tracker.tick()
    assert entry(store, SHAPING) == (None, "unknown")

    # Until the new manager reports, the feedback inference is back.
    tracker.record_behaviour_active("behaviour/intent_scaling")
    assert entry(store, BEHAVIOUR) == ("behaviour/intent_scaling", "measured")

    tracker.record_manager_status(status())
    assert entry(store, SHAPING) == ("geometric/both", "measured")
    assert entry(store, BEHAVIOUR) == ("behaviour/passthrough", "measured")


def test_stop_resets_show_as_reset_until_the_status_confirms_them(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    tracker.record_manager_status(status("geometric/snake", "behaviour/pose_target", "ready"))
    tracker.record_publish(OTHER_TOPIC, STRING, mode("geometric/jaco"), "s1")
    controller = RuntimeStopController(
        NoopTeleopCommandGateway(),
        Gateway(),
        on_reset=tracker.record_reset,
        shaping_topics=lambda: [OTHER_TOPIC],
    )

    assert controller.engage().asserted is True
    assert entry(store, SHAPING) == ("geometric/both", "reset")
    assert entry(store, BEHAVIOUR) == ("behaviour/passthrough", "reset")
    assert entry(store, TARGET) == (None, "reset")
    assert entry(store, manager_key("shaping", OTHER_TOPIC)) == ("geometric/both", "reset")

    tracker.record_manager_status(status())
    assert entry(store, SHAPING) == ("geometric/both", "measured")
    assert entry(store, BEHAVIOUR) == ("behaviour/passthrough", "measured")
    assert entry(store, TARGET) == (None, "measured")

    # The status covers the manager's own mode topic only; another topic's key stays what STOP sent.
    clock.now += 5
    tracker.tick()
    assert entry(store, manager_key("shaping", OTHER_TOPIC)) == ("geometric/both", "reset")
    assert store.get(manager_key("inputs", OTHER_TOPIC)) is None


def test_a_stop_the_manager_already_matched_turns_measured_after_the_window(
    tracker: CommandStateTracker, store: CommandStateStore, clock: Clock
) -> None:
    tracker.record_manager_status(status())
    tracker.record_reset("/mode_request", STRING, mode("geometric/both"))
    tracker.record_reset("/mode_request", STRING, mode("behaviour/passthrough"))
    assert entry(store, SHAPING) == ("geometric/both", "reset")
    assert store.get(SHAPING).by == BY_SERVER

    clock.now += 1
    tracker.tick()
    assert entry(store, SHAPING) == ("geometric/both", "measured")
    assert entry(store, BEHAVIOUR) == ("behaviour/passthrough", "measured")


class Gateway:
    def publish(self, request: RosPublishRequest) -> RosPublishReceipt:
        return RosPublishReceipt(
            detail="ok", message_type=request.message_type, status="published", topic=request.topic
        )


# The subscription


class Subscriptions:
    def __init__(self) -> None:
        self.callbacks: dict[str, Any] = {}
        self.latched: list[str] = []

    def __call__(self, node: Any, message_cls: type, topic: str, callback: Any, depth: int) -> Any:
        self.callbacks[topic] = callback
        return SimpleNamespace(close=lambda: None)

    def latched_factory(self, node: Any, message_cls: type, topic: str, callback: Any) -> Any:
        self.latched.append(topic)
        self.callbacks[topic] = callback
        return SimpleNamespace(close=lambda: None)


def feedback_for(manager_node: str, store: CommandStateStore) -> tuple[RclpyCommandStateFeedback, Subscriptions]:
    subscriptions = Subscriptions()
    feedback = RclpyCommandStateFeedback(
        SimpleNamespace(),
        CommandStateTracker(store),
        SimpleNamespace(),
        echo_topics={},
        manager_node=manager_node,
        message_class=lambda message_type: object,
        subscription_factory=subscriptions,
        latched_subscription_factory=subscriptions.latched_factory,
    )
    feedback.start(poll_in_background=False)
    return feedback, subscriptions


def key_values(**values: str) -> list[SimpleNamespace]:
    return [SimpleNamespace(key=key, value=value) for key, value in values.items()]


def test_the_status_topic_follows_the_manager_node_and_is_latched(store: CommandStateStore) -> None:
    feedback, subscriptions = feedback_for("/cartesian_manager", store)
    assert subscriptions.latched == ["/cartesian_manager/status"]
    assert feedback.manager_status_topic == "/cartesian_manager/status"

    _feedback, namespaced = feedback_for("/arm/cartesian_manager", store)
    assert namespaced.latched == ["/arm/cartesian_manager/status"]


def test_a_status_message_reaches_the_store_and_a_strangers_does_not(store: CommandStateStore) -> None:
    _feedback, subscriptions = feedback_for("/cartesian_manager", store)
    on_status = subscriptions.callbacks["/cartesian_manager/status"]

    on_status(SimpleNamespace(name="qontrol", level=0, values=key_values(geometric="geometric/snake")))
    assert store.get(SHAPING) is None

    on_status(
        SimpleNamespace(
            name="cartesian_manager",
            level=0,
            values=key_values(geometric="geometric/jaco", behaviour="behaviour/passthrough", target="", inputs=""),
        )
    )
    assert entry(store, SHAPING) == ("geometric/jaco", "measured")
    assert entry(store, TARGET) == (None, "measured")
    assert entry(store, INPUTS) == ([], "measured")


def test_the_latched_subscription_asks_for_reliable_transient_local_depth_one() -> None:
    created: list[tuple] = []
    destroyed: list[Any] = []
    node = SimpleNamespace(
        create_subscription=lambda cls, topic, callback, qos: created.append((topic, qos)) or "handle",
        destroy_subscription=destroyed.append,
    )
    subscription = LatchedSubscription(node, object, "/cartesian_manager/status", print, qos_factory=lambda qos: qos)

    assert LATCHED_QOS == QosChoice(RELIABLE, TRANSIENT_LOCAL, 1)
    assert created == [("/cartesian_manager/status", LATCHED_QOS)]
    assert subscription.qos == LATCHED_QOS
    subscription.close()
    assert destroyed == ["handle"]


def test_the_latched_profile_is_a_real_rclpy_profile() -> None:
    pytest.importorskip("rclpy")
    from rclpy.qos import HistoryPolicy, QoSDurabilityPolicy, QoSReliabilityPolicy

    from libs.ros_adapters.qos import build_qos_profile

    profile = build_qos_profile(LATCHED_QOS)
    assert profile.history == HistoryPolicy.KEEP_LAST
    assert profile.depth == 1
    assert profile.reliability == QoSReliabilityPolicy.RELIABLE
    assert profile.durability == QoSDurabilityPolicy.TRANSIENT_LOCAL


def test_a_status_latched_before_bloom_subscribed_arrives_over_real_ros(store: CommandStateStore) -> None:
    rclpy = pytest.importorskip("rclpy")
    diagnostic = pytest.importorskip("diagnostic_msgs.msg")
    from rclpy.executors import SingleThreadedExecutor
    from rclpy.qos import QoSDurabilityPolicy, QoSProfile, QoSReliabilityPolicy

    context = rclpy.Context()
    # A domain of its own, so a running simulation's manager cannot answer first.
    rclpy.init(context=context, domain_id=93)
    try:
        manager = rclpy.create_node("cartesian_manager", namespace="/bloom_status_test", context=context)
        bloom = rclpy.create_node("bloom_status_test", context=context)
        executor = SingleThreadedExecutor(context=context)
        executor.add_node(manager)
        executor.add_node(bloom)
        latched = QoSProfile(
            depth=1, reliability=QoSReliabilityPolicy.RELIABLE, durability=QoSDurabilityPolicy.TRANSIENT_LOCAL
        )
        publisher = manager.create_publisher(diagnostic.DiagnosticStatus, "~/status", latched)
        publisher.publish(
            diagnostic.DiagnosticStatus(
                name="cartesian_manager",
                values=[
                    diagnostic.KeyValue(key="geometric", value="geometric/snake"),
                    diagnostic.KeyValue(key="behaviour", value="behaviour/passthrough"),
                    diagnostic.KeyValue(key="target", value=""),
                    diagnostic.KeyValue(key="inputs", value="joystick"),
                ],
            )
        )
        feedback = RclpyCommandStateFeedback(
            bloom,
            CommandStateTracker(store),
            SimpleNamespace(),
            echo_topics={},
            manager_node="/bloom_status_test/cartesian_manager",
        )
        feedback.start(poll_in_background=False)
        deadline = time.monotonic() + 5.0
        while store.get(SHAPING) is None and time.monotonic() < deadline:
            executor.spin_once(timeout_sec=0.05)
        feedback.stop()
    finally:
        rclpy.shutdown(context=context)

    assert entry(store, SHAPING) == ("geometric/snake", "measured")
    assert entry(store, INPUTS) == (["joystick"], "measured")
