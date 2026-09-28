"""The backend's own command and feedback subscriptions (ADR 0142), on a fake node."""

from __future__ import annotations

from array import array
from types import SimpleNamespace
from typing import Any

import pytest

from apps.bloom_api.main import command_state_echo_topics, create_app, create_command_state_feedback
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters.command_state_feedback import (
    RclpyCommandStateFeedback,
    current_state_name,
    parse_pose_targets,
)
from libs.ros_adapters.parameters import RosParameterReading
from libs.sessions.command_state import CommandStateStore, CommandStateTracker, GripperFeedback, manager_key

MANAGER = "/cartesian_manager"
GRIPPER = "/gripper_controller/commands"


class Graph:
    """The node's view of the ROS graph."""

    def __init__(self) -> None:
        self.nodes = {("cartesian_manager", "/"), ("petanque_throw", "/")}
        self.publishers = {"/joint_states": 1, "/fsm_viewer": 1}

    def get_node_names_and_namespaces(self) -> list[tuple[str, str]]:
        return sorted(self.nodes)

    def count_publishers(self, topic: str) -> int:
        return self.publishers.get(topic, 0)


class Subscriptions:
    def __init__(self) -> None:
        self.callbacks: dict[str, Any] = {}
        self.closed: list[str] = []

    def __call__(self, node: Any, message_cls: type, topic: str, callback: Any, depth: int) -> Any:
        self.callbacks[topic] = callback
        return SimpleNamespace(close=lambda: self.closed.append(topic))


class Parameters:
    def __init__(self) -> None:
        self.values = {
            MANAGER: {
                "shapers.snake.gain": 0.5,
                "inputs.sources": ["joystick", "visual_servoing"],
                "behaviours.pose_targets.target_names": ["ready"],
                "behaviours.pose_targets.frame_ids": ["base_link"],
                "behaviours.pose_targets.positions": [0.6, 0.27, 0.22],
                "behaviours.pose_targets.orientations": [0.0, 0.0, 0.0, 1.0],
                "behaviours.pose_targets.position_tolerance": 0.01,
                "behaviours.pose_targets.orientation_tolerance": 0.05,
            },
            "/petanque_throw": {"alpha": 0.2},
        }
        self.asked: list[str] = []
        self.down: set[str] = set()

    def get(self, node: str, names: tuple[str, ...]) -> tuple[RosParameterReading, ...]:
        self.asked.append(node)
        if node in self.down:
            raise RuntimeError(f"{node} does not answer")
        return tuple(RosParameterReading(node=node, name=name, value=self.values[node].get(name)) for name in names)

    def get_values(self, node: str, names: tuple[str, ...]) -> dict[str, Any]:
        return {name: self.values[node].get(name) for name in names}


def message_class(message_type: str) -> type:
    if message_type.startswith("yasmin_msgs/"):
        raise ValueError(f"Unsupported ROS message type: {message_type}")
    return object


def build(kinova: bool = True):
    store = CommandStateStore()
    gripper = (
        GripperFeedback(
            topic=GRIPPER,
            joint_name="robotiq_85_left_knuckle_joint",
            open_position=0.0,
            close_position=0.8,
            tolerance=0.15,
        )
        if kinova
        else None
    )
    tracker = CommandStateTracker(store, gripper=gripper)
    graph, subscriptions, parameters = Graph(), Subscriptions(), Parameters()
    feedback = RclpyCommandStateFeedback(
        graph,
        tracker,
        parameters,
        echo_topics={"/mode_request": "std_msgs/msg/String", GRIPPER: "std_msgs/msg/Float64MultiArray"},
        parameters=(f"{MANAGER}:shapers.snake.gain", "/petanque_throw:alpha", "/ui/*:x"),
        read_only_parameters=(f"{MANAGER}:inputs.sources",),
        manager_node=MANAGER,
        gripper_topic=GRIPPER if kinova else None,
        message_class=message_class,
        parameter_value_to_python=lambda value: value,
        subscription_factory=subscriptions,
    )
    feedback.start(poll_in_background=False)
    return store, tracker, graph, subscriptions, parameters, feedback


def value(store: CommandStateStore, key: str) -> tuple[Any, str]:
    held = store.get(key)
    assert held is not None, key
    return held.value, held.source


def test_it_subscribes_to_its_own_topics_and_skips_a_missing_interface() -> None:
    _store, _tracker, _graph, subscriptions, _parameters, feedback = build()

    assert set(subscriptions.callbacks) == {
        "/mode_request",
        GRIPPER,
        "/parameter_events",
        "/joint_states",
        "/visual_servoing/velocity_command",
        "/ee_pose",
    }
    feedback.stop()
    assert set(subscriptions.closed) == set(subscriptions.callbacks)


def test_an_explorer_does_not_follow_joint_states() -> None:
    _store, _tracker, _graph, subscriptions, _parameters, _feedback = build(kinova=False)

    assert "/joint_states" not in subscriptions.callbacks


def test_echoes_reach_the_store_as_commanded() -> None:
    store, _tracker, _graph, subscriptions, _parameters, _feedback = build()

    subscriptions.callbacks["/mode_request"](SimpleNamespace(data="geometric/snake"))
    subscriptions.callbacks[GRIPPER](SimpleNamespace(data=array("d", [0.8])))

    assert value(store, manager_key("shaping")) == ("geometric/snake", "commanded")
    assert value(store, GRIPPER) == ({"data": [0.8]}, "commanded")


def test_parameter_events_update_only_exposed_parameters() -> None:
    store, _tracker, _graph, subscriptions, _parameters, _feedback = build()
    parameter = SimpleNamespace

    subscriptions.callbacks["/parameter_events"](
        SimpleNamespace(
            node=MANAGER,
            new_parameters=[],
            changed_parameters=[parameter(name="shapers.snake.gain", value=0.9), parameter(name="other", value=1)],
            deleted_parameters=[],
        )
    )
    subscriptions.callbacks["/parameter_events"](
        SimpleNamespace(node="/elsewhere", new_parameters=[], changed_parameters=[], deleted_parameters=[])
    )

    assert value(store, f"param:{MANAGER}:shapers.snake.gain") == (0.9, "measured")
    assert store.get(f"param:{MANAGER}:other") is None

    subscriptions.callbacks["/parameter_events"](
        SimpleNamespace(
            node=MANAGER,
            new_parameters=[],
            changed_parameters=[],
            deleted_parameters=[parameter(name="shapers.snake.gain", value=None)],
        )
    )
    assert value(store, f"param:{MANAGER}:shapers.snake.gain") == (None, "unknown")


def test_nodes_are_seeded_when_they_appear_and_unknown_when_they_go() -> None:
    store, _tracker, graph, _subscriptions, parameters, feedback = build()

    feedback.poll_once()
    assert value(store, f"param:{MANAGER}:shapers.snake.gain") == (0.5, "measured")
    assert value(store, "param:/petanque_throw:alpha") == (0.2, "measured")

    graph.nodes.discard(("petanque_throw", "/"))
    feedback.poll_once()
    assert value(store, "param:/petanque_throw:alpha") == (None, "unknown")

    parameters.values["/petanque_throw"]["alpha"] = 0.3
    graph.nodes.add(("petanque_throw", "/"))
    feedback.poll_once()
    assert value(store, "param:/petanque_throw:alpha") == (0.3, "measured")


def test_a_node_that_does_not_answer_yet_is_asked_again() -> None:
    store, _tracker, _graph, _subscriptions, parameters, feedback = build()
    parameters.down.add("/petanque_throw")

    feedback.poll_once()
    assert store.get("param:/petanque_throw:alpha") is None

    parameters.down.clear()
    feedback.poll_once()
    assert value(store, "param:/petanque_throw:alpha") == (0.2, "measured")


def test_a_manager_restart_makes_its_states_unknown() -> None:
    store, tracker, graph, subscriptions, _parameters, feedback = build()
    feedback.poll_once()
    subscriptions.callbacks["/mode_request"](SimpleNamespace(data="geometric/snake"))

    graph.nodes.discard(("cartesian_manager", "/"))
    feedback.poll_once()

    assert value(store, manager_key("shaping")) == (None, "unknown")


def test_the_manager_pose_targets_are_read_so_a_reached_target_ends() -> None:
    store, tracker, _graph, subscriptions, _parameters, feedback = build()
    feedback.poll_once()
    subscriptions.callbacks["/mode_request"](SimpleNamespace(data="behaviour/pose_target/ready"))

    pose = SimpleNamespace(
        position=SimpleNamespace(x=0.6, y=0.27, z=0.22), orientation=SimpleNamespace(x=0.0, y=0.0, z=0.0, w=1.0)
    )
    subscriptions.callbacks["/ee_pose"](SimpleNamespace(header=SimpleNamespace(frame_id="base_link"), pose=pose))

    assert value(store, manager_key("behaviour")) == ("behaviour/passthrough", "measured")


def test_feedback_topics_whose_publishers_leave_turn_unknown() -> None:
    store, tracker, graph, subscriptions, _parameters, feedback = build()
    feedback.poll_once()
    subscriptions.callbacks["/joint_states"](
        SimpleNamespace(name=["robotiq_85_left_knuckle_joint"], position=array("d", [0.8]))
    )
    tracker.record_petanque_state("THROW")
    assert value(store, GRIPPER) == ({"data": [0.8]}, "measured")

    graph.publishers = {"/joint_states": 0, "/fsm_viewer": 0}
    feedback.poll_once()

    assert value(store, GRIPPER) == (None, "unknown")
    assert value(store, "petanque:state") == (None, "unknown")


def test_servoing_liveness_starts_with_its_subscription() -> None:
    store, tracker, _graph, subscriptions, _parameters, _feedback = build()

    subscriptions.callbacks["/visual_servoing/velocity_command"](SimpleNamespace())

    assert value(store, "servoing:active") == (True, "measured")


def test_the_active_petanque_state_is_the_leaf_of_the_machine() -> None:
    def state(id: int, parent: int, name: str, is_fsm: bool = False, current: int = -1) -> SimpleNamespace:
        return SimpleNamespace(id=id, parent=parent, name=name, is_fsm=is_fsm, current_state=current)

    machine = SimpleNamespace(
        states=[
            state(0, -1, "PETANQUE", True, 2),
            state(1, 0, "IDLE"),
            state(2, 0, "THROWING", True, 3),
            state(3, 2, "RELEASE"),
        ]
    )

    assert current_state_name(machine) == "THROWING/RELEASE"
    assert current_state_name(SimpleNamespace(states=[state(0, -1, "PETANQUE", True, -1)])) is None


def test_pose_targets_that_do_not_line_up_are_ignored() -> None:
    assert parse_pose_targets({"target_names": ["a"], "positions": [1.0], "orientations": []}) is None
    parsed = parse_pose_targets(
        {
            "target_names": ["a", "b"],
            "frame_ids": ["base_link"],
            "positions": [1, 2, 3, 4, 5, 6],
            "orientations": [0, 0, 0, 1, 0, 0, 0, 1],
            "position_tolerance": 0.01,
            "orientation_tolerance": 0.05,
        }
    )
    assert parsed is not None
    assert parsed["b"].position == (4.0, 5.0, 6.0)
    assert parsed["b"].frame_id == ""


def test_the_app_follows_its_mode_topics_and_fixed_command_topics() -> None:
    settings = Settings(
        environment="test",
        allowed_ros_publish_topics=("/mode_request", "/arm2/mode_request", "/ui/"),
    )
    app = create_app(settings, InMemoryConfigurationRepository())

    topics = command_state_echo_topics(settings, app.state.runtime_command_policy)

    assert topics["/arm2/mode_request"] == "std_msgs/msg/String"
    assert topics["/hub/digital_output"] == "std_msgs/msg/Float32MultiArray"
    assert topics["/ui/visual_servoing/on"] == "std_msgs/msg/Bool"
    assert topics["/explorer_user_interfaces/rqt_armcontrol/max_linear_speed"] == "std_msgs/msg/Float64"
    assert "/ui/" not in topics


@pytest.mark.parametrize(("robot_name", "follows_finger"), [("kinova gen3", True), ("explorer", False)])
def test_only_a_kinova_follows_the_finger(robot_name: str, follows_finger: bool) -> None:
    app = create_app(Settings(environment="test", robot_name=robot_name), InMemoryConfigurationRepository())

    feedback = create_command_state_feedback(app, Graph())

    assert (feedback._gripper_topic is not None) is follows_finger


def test_the_manager_inputs_are_shown_read_only_as_a_list() -> None:
    store, _tracker, graph, subscriptions, parameters, feedback = build()

    feedback.poll_once()
    assert value(store, f"param:{MANAGER}:inputs.sources") == (["joystick", "visual_servoing"], "measured")

    subscriptions.callbacks["/parameter_events"](
        SimpleNamespace(
            node=MANAGER,
            new_parameters=[SimpleNamespace(name="inputs.sources", value=("joystick",))],
            changed_parameters=[],
            deleted_parameters=[],
        )
    )
    assert value(store, f"param:{MANAGER}:inputs.sources") == (["joystick"], "measured")

    graph.nodes.discard(("cartesian_manager", "/"))
    feedback.poll_once()
    assert value(store, f"param:{MANAGER}:inputs.sources") == (None, "unknown")


def test_the_app_reads_the_manager_inputs_but_cannot_set_them() -> None:
    app = create_app(Settings(environment="test"), InMemoryConfigurationRepository())

    feedback = create_command_state_feedback(app, Graph())

    assert feedback._read_only == {"/cartesian_manager": ("inputs.sources",)}
    assert "/cartesian_manager:inputs.sources" not in app.state.runtime_command_policy.allowed_parameters
