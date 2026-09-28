"""The backend's own subscriptions for command state (ADR 0142), independent of any widget's."""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable, Mapping, Sequence
from typing import Any

from libs.ros_adapters.messages import resolve_message_class
from libs.ros_adapters.mode_request import INTENT_SCALING_MODE, SHARED_CONTROL_MODE
from libs.ros_adapters.qos import AdaptiveSubscription
from libs.sessions.command_state import PETANQUE_STATE_KEY, CommandStateTracker, PoseTargetSpec

logger = logging.getLogger(__name__)

PARAMETER_EVENTS_TOPIC = "/parameter_events"
JOINT_STATES_TOPIC = "/joint_states"
FSM_VIEWER_TOPIC = "/fsm_viewer"
SERVOING_VELOCITY_TOPIC = "/visual_servoing/velocity_command"
EE_POSE_TOPIC = "/ee_pose"
#: The manager's own feedback for its lasting behaviours: each publishes only while its behaviour is active.
INTENT_SCALE_TOPIC = "/cartesian_manager/intent_scale"
SHARED_CONTROL_CONFIDENCES_TOPIC = "/shared_control/confidences"
SHARED_CONTROL_GOALS_TOPIC = "/shared_control/goals"
SHARED_CONTROL_SOFT_GOAL_TOPIC = "/shared_control/soft_goal"
BEHAVIOUR_FEEDBACK_TOPICS: dict[str, tuple[str, str]] = {
    INTENT_SCALING_MODE: (INTENT_SCALE_TOPIC, "std_msgs/msg/Float64"),
    SHARED_CONTROL_MODE: (SHARED_CONTROL_CONFIDENCES_TOPIC, "std_msgs/msg/Float64MultiArray"),
}
POSE_TARGET_PREFIX = "behaviours.pose_targets."
POSE_TARGET_PARAMETERS = tuple(
    f"{POSE_TARGET_PREFIX}{name}"
    for name in (
        "target_names",
        "frame_ids",
        "positions",
        "orientations",
        "position_tolerance",
        "orientation_tolerance",
    )
)


class RclpyCommandStateFeedback:
    def __init__(
        self,
        node: Any,
        tracker: CommandStateTracker,
        parameter_gateway: Any,
        *,
        echo_topics: Mapping[str, str],
        parameters: Sequence[str] = (),
        read_only_parameters: Sequence[str] = (),
        manager_node: str = "/cartesian_manager",
        mode_request_topic: str = "/mode_request",
        gripper_topic: str | None = None,
        message_class: Callable[[str], type] | None = None,
        parameter_value_to_python: Callable[[Any], Any] | None = None,
        subscription_factory: Callable[..., Any] = AdaptiveSubscription,
        poll_period_sec: float = 1.0,
        qos_depth: int = 10,
    ) -> None:
        self._node = node
        self._tracker = tracker
        self._gateway = parameter_gateway
        self._echo_topics = dict(echo_topics)
        self._parameters = _group_by_node(parameters)
        # Shown, never set: arrays such as the manager's inputs.sources, which the settable scalars exclude.
        self._read_only = _group_by_node(read_only_parameters)
        self._manager_node = manager_node
        self._mode_request_topic = mode_request_topic
        self._gripper_topic = gripper_topic
        classes: dict[str, type] = {}
        self._message_class = message_class or (
            lambda message_type: resolve_message_class(message_type, classes, "follow command state")
        )
        self._to_python = parameter_value_to_python
        self._subscription_factory = subscription_factory
        self._poll_period_sec = poll_period_sec
        self._qos_depth = qos_depth
        self._subscriptions: list[Any] = []
        self._nodes_present: dict[str, bool] = {}
        self._publishers_seen: dict[str, bool] = {}
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    @property
    def watched_nodes(self) -> tuple[str, ...]:
        return tuple(dict.fromkeys([*self._parameters, *self._read_only, self._manager_node]))

    def start(self, *, poll_in_background: bool = True) -> None:
        for topic, message_type in self._echo_topics.items():
            self._subscribe(topic, message_type, self._echo_handler(topic, message_type))
        self._subscribe(PARAMETER_EVENTS_TOPIC, "rcl_interfaces/msg/ParameterEvent", self._on_parameter_event)
        if self._gripper_topic is not None:
            self._subscribe(JOINT_STATES_TOPIC, "sensor_msgs/msg/JointState", self._on_joint_states)
        self._subscribe(FSM_VIEWER_TOPIC, "yasmin_msgs/msg/StateMachine", self._on_fsm_viewer)
        if self._subscribe(SERVOING_VELOCITY_TOPIC, "geometry_msgs/msg/TwistStamped", self._on_servoing_velocity):
            self._tracker.start_servoing_liveness()
        self._subscribe(EE_POSE_TOPIC, "geometry_msgs/msg/PoseStamped", self._on_ee_pose)
        for behaviour, (topic, message_type) in BEHAVIOUR_FEEDBACK_TOPICS.items():
            self._subscribe(topic, message_type, self._behaviour_handler(behaviour))
        if poll_in_background and self._thread is None:
            self._thread = threading.Thread(target=self._run, name="command-state-feedback", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        for subscription in self._subscriptions:
            try:
                subscription.close()
            except Exception:  # noqa: BLE001
                logger.debug("Command-state subscription did not close cleanly.", exc_info=True)
        self._subscriptions.clear()

    def poll_once(self) -> None:
        """Nodes that came or went, and feedback topics whose publishers all left."""
        try:
            present = {_full_name(name, namespace) for name, namespace in self._node.get_node_names_and_namespaces()}
        except Exception:  # noqa: BLE001
            logger.debug("Cannot read the ROS graph for command state.", exc_info=True)
            return
        for node in self.watched_nodes:
            was = self._nodes_present.get(node)
            if node in present and was is not True:
                if self._node_appeared(node):
                    self._nodes_present[node] = True
            elif node not in present:
                if was:
                    self._node_lost(node)
                self._nodes_present[node] = False
        silent_keys = {JOINT_STATES_TOPIC: self._gripper_topic, FSM_VIEWER_TOPIC: PETANQUE_STATE_KEY}
        for topic, key in silent_keys.items():
            if key is None:
                continue
            try:
                publishing = self._node.count_publishers(topic) > 0
            except Exception:  # noqa: BLE001
                continue
            if self._publishers_seen.get(topic) and not publishing:
                self._tracker.mark_unknown((key,))
            self._publishers_seen[topic] = publishing

    def _run(self) -> None:
        while not self._stop.is_set():
            self.poll_once()
            self._stop.wait(self._poll_period_sec)

    def _node_appeared(self, node: str) -> bool:
        """Seeds what the node holds; False when it could not answer, so the next poll asks again."""
        names = self._parameters.get(node, ())
        try:
            if names:
                for reading in self._gateway.get(node, names):
                    self._tracker.record_parameter(node, reading.name, reading.value)
            read_only = self._read_only.get(node, ())
            if read_only:
                for name, value in self._gateway.get_values(node, read_only).items():
                    self._tracker.record_parameter(node, name, _read_only_value(value))
            if node == self._manager_node:
                self._tracker.set_pose_targets(self._mode_request_topic, self._read_pose_targets(node))
        except Exception:  # noqa: BLE001 - a node still starting is the normal case
            logger.debug("Command state: %s did not answer its parameters yet.", node, exc_info=True)
            return False
        return True

    def _node_lost(self, node: str) -> None:
        self._tracker.mark_node_lost(node)
        if node == self._manager_node:
            self._tracker.set_pose_targets(self._mode_request_topic, None)
            self._tracker.mark_manager_lost(self._mode_request_topic)

    def _read_pose_targets(self, node: str) -> dict[str, PoseTargetSpec] | None:
        get_values = getattr(self._gateway, "get_values", None)
        if get_values is None:
            return None
        values = get_values(node, POSE_TARGET_PARAMETERS)
        return parse_pose_targets({name.removeprefix(POSE_TARGET_PREFIX): value for name, value in values.items()})

    def _subscribe(self, topic: str, message_type: str, callback: Callable[[Any], None]) -> bool:
        try:
            message_cls = self._message_class(message_type)
            subscription = self._subscription_factory(self._node, message_cls, topic, callback, self._qos_depth)
        except Exception as exc:  # noqa: BLE001 - an interface package this machine lacks drops only its topic
            logger.info("Command state does not follow %s (%s): %s", topic, message_type, exc)
            return False
        self._subscriptions.append(subscription)
        return True

    def _echo_handler(self, topic: str, message_type: str) -> Callable[[Any], None]:
        def on_message(message: Any) -> None:
            data = getattr(message, "data", None)
            if not isinstance(data, (str, bytes, bool, int, float)) and data is not None:
                data = list(data)
            self._tracker.record_echo(topic, message_type, {"data": data})

        return on_message

    def _on_parameter_event(self, event: Any) -> None:
        node = getattr(event, "node", "")
        names = self._parameters.get(node, ())
        read_only = self._read_only.get(node, ())
        if not names and not read_only:
            return
        for parameter in (*getattr(event, "new_parameters", ()), *getattr(event, "changed_parameters", ())):
            if parameter.name in names:
                self._tracker.record_parameter(node, parameter.name, self._python_value(parameter.value))
            elif parameter.name in read_only:
                self._tracker.record_parameter(node, parameter.name, _read_only_value(self._convert(parameter.value)))
        for parameter in getattr(event, "deleted_parameters", ()):
            if parameter.name in names or parameter.name in read_only:
                self._tracker.record_parameter(node, parameter.name, None)

    def _convert(self, value: Any) -> Any:
        convert = self._to_python
        if convert is None:
            from rclpy.parameter import parameter_value_to_python

            convert = self._to_python = parameter_value_to_python
        return convert(value)

    def _python_value(self, value: Any) -> Any:
        python_value = self._convert(value)
        return python_value if isinstance(python_value, bool | int | float | str) else None

    def _on_joint_states(self, message: Any) -> None:
        self._tracker.record_joint_states(message.name, message.position)

    def _on_fsm_viewer(self, message: Any) -> None:
        self._tracker.record_petanque_state(current_state_name(message))

    def _on_servoing_velocity(self, _message: Any) -> None:
        self._tracker.record_servoing_velocity()

    def _behaviour_handler(self, behaviour: str) -> Callable[[Any], None]:
        def on_message(_message: Any) -> None:
            self._tracker.record_behaviour_active(behaviour, self._mode_request_topic)

        return on_message

    def _on_ee_pose(self, message: Any) -> None:
        pose = message.pose
        self._tracker.record_ee_pose(
            message.header.frame_id,
            (pose.position.x, pose.position.y, pose.position.z),
            (pose.orientation.x, pose.orientation.y, pose.orientation.z, pose.orientation.w),
        )


def current_state_name(message: Any) -> str | None:
    """The active leaf of a yasmin state machine, nested machines joined with '/'; None when it finished."""
    states = {state.id: state for state in getattr(message, "states", ())}
    root = next((state for state in states.values() if state.parent == -1), None)
    path: list[str] = []
    current = root
    while current is not None and current.is_fsm:
        current = states.get(current.current_state)
        if current is not None:
            path.append(current.name)
    return "/".join(path) or None


def parse_pose_targets(values: Mapping[str, Any]) -> dict[str, PoseTargetSpec] | None:
    """cartesian_manager's parallel arrays; None when they do not line up."""
    names = values.get("target_names")
    frames = values.get("frame_ids") or []
    positions = values.get("positions") or []
    orientations = values.get("orientations") or []
    position_tolerance = values.get("position_tolerance")
    orientation_tolerance = values.get("orientation_tolerance")
    if (
        not isinstance(names, list)
        or len(positions) != 3 * len(names)
        or len(orientations) != 4 * len(names)
        or not isinstance(position_tolerance, (int, float))
        or not isinstance(orientation_tolerance, (int, float))
    ):
        return None
    return {
        name: PoseTargetSpec(
            frame_id=frames[index] if index < len(frames) else "",
            position=tuple(float(value) for value in positions[3 * index : 3 * index + 3]),
            orientation=tuple(float(value) for value in orientations[4 * index : 4 * index + 4]),
            position_tolerance=float(position_tolerance),
            orientation_tolerance=float(orientation_tolerance),
        )
        for index, name in enumerate(names)
    }


def _read_only_value(value: Any) -> Any:
    if isinstance(value, (list, tuple)) and all(isinstance(item, bool | int | float | str) for item in value):
        return list(value)
    return value if isinstance(value, bool | int | float | str) else None


def _full_name(name: str, namespace: str) -> str:
    return f"{namespace.rstrip('/')}/{name}"


def _group_by_node(parameters: Sequence[str]) -> dict[str, tuple[str, ...]]:
    grouped: dict[str, list[str]] = {}
    for entry in parameters:
        node, _, name = entry.partition(":")
        if node.startswith("/") and name and "*" not in entry and not name.endswith("/"):
            grouped.setdefault(node, []).append(name)
    return {node: tuple(names) for node, names in grouped.items()}
