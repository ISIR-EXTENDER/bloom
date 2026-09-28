"""The command-state feedback under a ROS graph that misbehaves: it keeps what it knows and never raises."""

from __future__ import annotations

import time
from array import array
from types import SimpleNamespace
from typing import Any

from libs.ros_adapters.command_state_feedback import RclpyCommandStateFeedback
from libs.sessions.command_state import CommandStateStore, CommandStateTracker, manager_key
from tests.test_command_state_feedback import GRIPPER, MANAGER, Graph, Parameters, Subscriptions, build, value


class GetOnlyParameters(Parameters):
    """A gateway that can read scalars but has no bulk read, as an older adapter would."""

    get_values = None  # type: ignore[assignment]


def test_a_graph_that_cannot_be_read_changes_nothing() -> None:
    store, _tracker, graph, _subscriptions, _parameters, feedback = build()
    feedback.poll_once()
    assert value(store, f"param:{MANAGER}:shapers.snake.gain") == (0.5, "measured")

    def broken() -> list[tuple[str, str]]:
        raise RuntimeError("rcl context shut down")

    graph.get_node_names_and_namespaces = broken  # type: ignore[method-assign]
    feedback.poll_once()

    assert value(store, f"param:{MANAGER}:shapers.snake.gain") == (0.5, "measured")


def test_a_publisher_count_that_cannot_be_read_keeps_the_feedback_known() -> None:
    store, _tracker, graph, subscriptions, _parameters, feedback = build()
    feedback.poll_once()
    subscriptions.callbacks["/joint_states"](SimpleNamespace(name=["robotiq_85_left_knuckle_joint"], position=[0.79]))
    assert value(store, GRIPPER) == ({"data": [0.8]}, "measured")

    def broken(topic: str) -> int:
        raise RuntimeError("graph unavailable")

    graph.count_publishers = broken  # type: ignore[method-assign]
    feedback.poll_once()

    assert value(store, GRIPPER) == ({"data": [0.8]}, "measured")


def test_a_subscription_that_fails_to_close_does_not_keep_the_others_open() -> None:
    _store, _tracker, _graph, subscriptions, _parameters, feedback = build()
    first_topic = next(iter(subscriptions.callbacks))

    def refuse() -> None:
        raise RuntimeError("already destroyed")

    feedback._subscriptions[0] = SimpleNamespace(close=refuse)
    feedback.stop()

    assert first_topic not in subscriptions.closed
    assert len(subscriptions.closed) == len(subscriptions.callbacks) - 1
    assert feedback._subscriptions == []


def test_the_background_poll_seeds_nodes_and_stops_with_the_feedback() -> None:
    store = CommandStateStore()
    tracker = CommandStateTracker(store)
    feedback = RclpyCommandStateFeedback(
        Graph(),
        tracker,
        Parameters(),
        echo_topics={},
        parameters=(f"{MANAGER}:shapers.snake.gain",),
        message_class=lambda _type: object,
        parameter_value_to_python=lambda v: v,
        subscription_factory=Subscriptions(),
        poll_period_sec=0.01,
    )

    feedback.start()
    deadline = time.monotonic() + 2
    while store.get(f"param:{MANAGER}:shapers.snake.gain") is None and time.monotonic() < deadline:
        time.sleep(0.005)
    assert value(store, f"param:{MANAGER}:shapers.snake.gain") == (0.5, "measured")

    feedback.stop()
    assert feedback._thread is not None
    feedback._thread.join(2)
    assert not feedback._thread.is_alive()


def test_a_deleted_parameter_on_an_unwatched_node_or_an_unknown_name_changes_nothing() -> None:
    store, _tracker, _graph, subscriptions, _parameters, feedback = build()
    feedback.poll_once()
    before = store.snapshot()

    deleted = SimpleNamespace(name="shapers.snake.gain", value=None)
    subscriptions.callbacks["/parameter_events"](
        SimpleNamespace(node="/elsewhere", new_parameters=[], changed_parameters=[], deleted_parameters=[deleted])
    )
    subscriptions.callbacks["/parameter_events"](
        SimpleNamespace(
            node=MANAGER,
            new_parameters=[],
            changed_parameters=[],
            deleted_parameters=[SimpleNamespace(name="not.declared", value=None)],
        )
    )

    assert store.snapshot() == before


def test_a_read_only_list_that_holds_structures_reads_as_unknown() -> None:
    store, _tracker, _graph, subscriptions, _parameters, feedback = build()
    feedback.poll_once()
    assert value(store, f"param:{MANAGER}:inputs.sources") == (["joystick", "visual_servoing"], "measured")

    subscriptions.callbacks["/parameter_events"](
        SimpleNamespace(
            node=MANAGER,
            new_parameters=[SimpleNamespace(name="inputs.sources", value=[{"name": "joystick"}])],
            changed_parameters=[],
            deleted_parameters=[],
        )
    )

    assert value(store, f"param:{MANAGER}:inputs.sources") == (None, "unknown")


def test_an_echo_carries_a_typed_array_as_a_list_and_bytes_as_they_are() -> None:
    store, _tracker, _graph, subscriptions, _parameters, _feedback = build()

    subscriptions.callbacks[GRIPPER](SimpleNamespace(data=array("d", [0.8])))
    assert value(store, GRIPPER) == ({"data": [0.8]}, "commanded")

    subscriptions.callbacks["/mode_request"](SimpleNamespace(data=b"geometric/snake"))
    assert store.get("/mode_request") is not None
    assert store.get("/mode_request").value == {"data": b"geometric/snake"}
    assert store.get(manager_key("shaping")) is None


def test_a_finger_reading_that_is_not_a_number_or_off_both_positions_is_ignored() -> None:
    store, _tracker, _graph, subscriptions, _parameters, _feedback = build()
    joint = "robotiq_85_left_knuckle_joint"

    subscriptions.callbacks["/joint_states"](SimpleNamespace(name=[joint], position=[float("nan")]))
    assert store.get(GRIPPER) is None
    subscriptions.callbacks["/joint_states"](SimpleNamespace(name=[joint], position=[0.4]))
    assert store.get(GRIPPER) is None
    subscriptions.callbacks["/joint_states"](SimpleNamespace(name=["elbow"], position=[0.0]))
    assert store.get(GRIPPER) is None

    subscriptions.callbacks["/joint_states"](SimpleNamespace(name=["elbow", joint], position=[1.0, 0.05]))
    assert value(store, GRIPPER) == ({"data": [0.0]}, "measured")


def test_without_a_bulk_parameter_read_no_pose_target_can_be_seen_to_end() -> None:
    store = CommandStateStore()
    tracker = CommandStateTracker(store)
    subscriptions = Subscriptions()
    feedback = RclpyCommandStateFeedback(
        Graph(),
        tracker,
        GetOnlyParameters(),
        echo_topics={"/mode_request": "std_msgs/msg/String"},
        parameters=(f"{MANAGER}:shapers.snake.gain",),
        message_class=lambda _type: object,
        parameter_value_to_python=lambda v: v,
        subscription_factory=subscriptions,
    )
    feedback.start(poll_in_background=False)
    feedback.poll_once()
    subscriptions.callbacks["/mode_request"](SimpleNamespace(data="behaviour/pose_target/ready"))

    pose: Any = SimpleNamespace(
        header=SimpleNamespace(frame_id="base_link"),
        pose=SimpleNamespace(
            position=SimpleNamespace(x=0.6, y=0.27, z=0.22), orientation=SimpleNamespace(x=0.0, y=0.0, z=0.0, w=1.0)
        ),
    )
    subscriptions.callbacks["/ee_pose"](pose)

    assert value(store, manager_key("behaviour")) == ("behaviour/pose_target", "commanded")
