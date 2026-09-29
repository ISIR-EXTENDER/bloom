"""The backend's record of what each command target holds (ADR 0142): screens render it, nothing else."""

from __future__ import annotations

import math
import re
import threading
from collections import deque
from collections.abc import Callable, Collection, Iterable, Mapping
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from hashlib import sha256
from time import monotonic
from typing import Any, Literal

from libs.ros_adapters.mode_request import (
    BEHAVIOUR_PREFIX,
    GEOMETRIC_MODES,
    GEOMETRIC_PREFIX,
    INTENT_SCALING_MODE,
    MODE_REQUEST_TOPIC,
    PASSTHROUGH_MODE,
    POSE_TARGET_TOPIC,
    SHARED_CONTROL_MODE,
    ModeRequestError,
    normalize_mode_request,
    parse_mode_request,
)

CommandSource = Literal["measured", "commanded", "reset", "unknown"]

BY_ROBOT = "robot"
BY_SERVER = "server"
BY_OTHER = "other-publisher"
#: An HTTP request that named no runtime session: a lab script.
BY_API = "api"

POSE_TARGET_BEHAVIOUR = "behaviour/pose_target"
SERVOING_ACTIVE_KEY = "servoing:active"
#: Measured from the manager's own feedback: the intent scale and the confidences publish only while active.
INTENT_SCALING_ACTIVE_KEY = "intent_scaling:active"
SHARED_CONTROL_ACTIVE_KEY = "shared_control:active"
BEHAVIOUR_ACTIVE_KEYS: dict[str, str] = {
    INTENT_SCALING_MODE: INTENT_SCALING_ACTIVE_KEY,
    SHARED_CONTROL_MODE: SHARED_CONTROL_ACTIVE_KEY,
}
PETANQUE_STATE_KEY = "petanque:state"
DIGITAL_OUTPUT_TOPIC = "/hub/digital_output"

#: How long Bloom's own publish may take to come back on its echo subscription.
OWN_ECHO_WINDOW_SEC = 2.0
DEFAULT_POSE_TARGET_TIMEOUT_SEC = 30.0
#: cartesian_manager's own defaults for behaviours.pose_targets.*_tolerance, used until its parameters are read.
DEFAULT_POSE_TARGET_TOLERANCE = (0.05, 0.05)
DEFAULT_SERVOING_WINDOW_SEC = 0.5
#: The intent scale arrives at about 20 Hz and the confidences at 100 Hz; either quiet this long has ended.
DEFAULT_BEHAVIOUR_WINDOW_SEC = 0.5
#: A behaviour the manager still reports right after a request is the manager not having switched yet.
DEFAULT_BEHAVIOUR_SETTLE_SEC = 0.5
#: A measurement that disagrees with a fresh command is the actuator still travelling.
DEFAULT_GRIPPER_SETTLE_SEC = 2.0
#: A request the manager's status has not taken up by then was refused or ignored: the status stands.
DEFAULT_STATUS_CONFIRM_SEC = 1.0
#: The `name` cartesian_manager gives its latched ~/status, whatever the node is called.
MANAGER_STATUS_NAME = "cartesian_manager"
_STATUS_BEHAVIOUR = re.compile(rf"{BEHAVIOUR_PREFIX}/[a-z0-9_]+")
_STATUS_TARGET = re.compile(r"[^/\s]+")

_FLOAT_TYPES = frozenset({"std_msgs/msg/Float32", "std_msgs/msg/Float64"})
_INT_TYPES = frozenset({f"std_msgs/msg/{kind}{bits}" for kind in ("Int", "UInt") for bits in ("8", "16", "32", "64")})
_FLOAT_ARRAY_TYPES = frozenset({"std_msgs/msg/Float32MultiArray", "std_msgs/msg/Float64MultiArray"})
_INT_ARRAY_TYPES = frozenset({f"{name}MultiArray" for name in _INT_TYPES})


def session_alias(session_id: str) -> str:
    """A session id proves ownership, so every socket sees the same stable alias the audit log uses."""
    return sha256(session_id.encode()).hexdigest()[:12] if session_id else BY_API


def manager_key(state: str, topic: str = MODE_REQUEST_TOPIC) -> str:
    return f"manager:{state}" if topic == MODE_REQUEST_TOPIC else f"manager:{state}@{topic}"


def parameter_key(node: str, name: str) -> str:
    return f"param:{node}:{name}"


def digital_output_key(pin: int) -> str:
    return f"{DIGITAL_OUTPUT_TOPIC}:{pin}"


def is_mode_request_topic(topic: str) -> bool:
    return topic.endswith("mode_request")


def parse_manager_status(name: Any, pairs: Iterable[tuple[Any, Any]]) -> dict[str, Any] | None:
    """The manager's status as store values per state; an unreadable key is left out, a stranger's status is None."""
    if name != MANAGER_STATUS_NAME:
        return None
    raw: dict[str, str] = {}
    for key, value in pairs:
        if isinstance(key, str) and isinstance(value, str):
            raw.setdefault(key, value)
    states: dict[str, Any] = {}
    geometric = normalize_mode_request(raw.get("geometric", ""))
    if geometric in {f"{GEOMETRIC_PREFIX}/{mode}" for mode in GEOMETRIC_MODES}:
        states["shaping"] = geometric
    behaviour = normalize_mode_request(raw.get("behaviour", ""))
    if _STATUS_BEHAVIOUR.fullmatch(behaviour):
        states["behaviour"] = behaviour
        # The target reads as the request that starts it: joint_target + home is behaviour/joint_target/home.
        target = normalize_mode_request(raw["target"]) if "target" in raw else None
        if target == "":
            states["target"] = None
        elif target is not None and _STATUS_TARGET.fullmatch(target):
            states["target"] = f"{behaviour}/{target}"
    if "inputs" in raw:
        states["inputs"] = [item.strip() for item in raw["inputs"].split(",") if item.strip()]
    return states


@dataclass(frozen=True)
class CommandStateEntry:
    value: Any
    source: CommandSource
    updated_at: str
    by: str
    revision: int


class CommandStateStore:
    """One record per command target, a global revision, and listeners told after every change."""

    def __init__(self, wall_clock: Callable[[], datetime] | None = None) -> None:
        self._wall_clock = wall_clock or (lambda: datetime.now(timezone.utc))
        self._entries: dict[str, CommandStateEntry] = {}
        self._revision = 0
        self._lock = threading.Lock()
        self._listeners: list[Callable[[], None]] = []

    @property
    def revision(self) -> int:
        with self._lock:
            return self._revision

    def get(self, key: str) -> CommandStateEntry | None:
        with self._lock:
            return self._entries.get(key)

    def write(
        self,
        key: str,
        value: Any,
        source: CommandSource,
        by: str,
        *,
        keep_if_equal: Collection[CommandSource] = (),
    ) -> bool:
        """False when nothing changed: an equal value already held from one of `keep_if_equal`."""
        return self.write_many(((key, value),), source, by, keep_if_equal=keep_if_equal) > 0

    def write_many(
        self,
        items: Iterable[tuple[str, Any]],
        source: CommandSource,
        by: str,
        *,
        keep_if_equal: Collection[CommandSource] = (),
    ) -> int:
        changed = 0
        with self._lock:
            for key, value in items:
                current = self._entries.get(key)
                if current is not None and current.source in keep_if_equal and current.value == value:
                    continue
                if current is not None and (current.value, current.source, current.by) == (value, source, by):
                    continue
                self._revision += 1
                self._entries[key] = CommandStateEntry(
                    value=value,
                    source=source,
                    updated_at=self._wall_clock().isoformat(),
                    by=by,
                    revision=self._revision,
                )
                changed += 1
        if changed:
            self._notify()
        return changed

    def mark_unknown(self, keys: Iterable[str], by: str) -> int:
        """Only keys the store holds: a target never seen is already unknown."""
        with self._lock:
            held = [key for key in keys if key in self._entries and self._entries[key].source != "unknown"]
        return self.write_many(((key, None) for key in held), "unknown", by)

    def keys(self) -> tuple[str, ...]:
        with self._lock:
            return tuple(self._entries)

    def snapshot(self) -> tuple[int, dict[str, dict[str, Any]]]:
        with self._lock:
            return self._revision, {key: asdict(entry) for key, entry in sorted(self._entries.items())}

    def subscribe(self, listener: Callable[[], None]) -> Callable[[], None]:
        with self._lock:
            self._listeners.append(listener)

        def unsubscribe() -> None:
            with self._lock:
                if listener in self._listeners:
                    self._listeners.remove(listener)

        return unsubscribe

    def _notify(self) -> None:
        with self._lock:
            listeners = tuple(self._listeners)
        for listener in listeners:
            try:
                listener()
            except Exception:  # noqa: BLE001 - a closed socket's loop must not break the writer
                pass


def build_command_state_message(store: CommandStateStore, self_alias: str | None = None) -> dict[str, Any]:
    """`self` is the recipient's own alias, so a screen can tell its own writes from others'."""
    revision, snapshot = store.snapshot()
    message: dict[str, Any] = {"type": "command_state", "revision": revision, "snapshot": snapshot}
    if self_alias is not None:
        message["self"] = self_alias
    return message


def normalize_payload(message_type: str, payload: Any) -> Any:
    """The shape both a Bloom publish and an echoed ROS message reduce to, so they compare equal."""
    if not isinstance(payload, Mapping):
        return payload
    data = payload.get("data")
    try:
        if message_type == "std_msgs/msg/String" and isinstance(data, str):
            return {"data": data}
        if message_type == "std_msgs/msg/Bool" and isinstance(data, bool):
            return {"data": data}
        if message_type in _FLOAT_TYPES and _is_number(data):
            return {"data": float(data)}
        if message_type in _INT_TYPES and _is_number(data):
            return {"data": int(data)}
        if message_type in _FLOAT_ARRAY_TYPES and isinstance(data, (list, tuple)):
            return {"data": [float(item) for item in data]}
        if message_type in _INT_ARRAY_TYPES and isinstance(data, (list, tuple)):
            return {"data": [int(item) for item in data]}
    except (TypeError, ValueError):
        pass
    return dict(payload)


@dataclass(frozen=True)
class PoseTargetSpec:
    frame_id: str
    position: tuple[float, float, float]
    orientation: tuple[float, float, float, float]
    position_tolerance: float
    orientation_tolerance: float


@dataclass(frozen=True)
class GripperFeedback:
    """A finger joint that reports the gripper's position, classified to the nearer command payload."""

    topic: str
    joint_name: str
    open_position: float
    close_position: float
    tolerance: float

    def payload_for(self, position: float) -> dict[str, list[float]] | None:
        nearest = min((self.open_position, self.close_position), key=lambda target: abs(position - target))
        if abs(position - nearest) > self.tolerance:
            return None
        return {"data": [float(nearest)]}


@dataclass
class _ActivePoseTarget:
    topic: str
    name: str
    started_at: float
    last_determined_at: float
    #: A pose published on the manager's pose_target topic has no name to look up; it carries its own.
    spec: PoseTargetSpec | None = None


class CommandStateTracker:
    """Turns what Bloom publishes, what others publish and what the robot reports into store writes."""

    def __init__(
        self,
        store: CommandStateStore,
        *,
        gripper: GripperFeedback | None = None,
        pose_target_timeout_sec: float = DEFAULT_POSE_TARGET_TIMEOUT_SEC,
        servoing_window_sec: float = DEFAULT_SERVOING_WINDOW_SEC,
        gripper_settle_sec: float = DEFAULT_GRIPPER_SETTLE_SEC,
        own_echo_window_sec: float = OWN_ECHO_WINDOW_SEC,
        behaviour_window_sec: float = DEFAULT_BEHAVIOUR_WINDOW_SEC,
        behaviour_settle_sec: float = DEFAULT_BEHAVIOUR_SETTLE_SEC,
        status_confirm_sec: float = DEFAULT_STATUS_CONFIRM_SEC,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self.store = store
        self._gripper = gripper
        self._pose_target_timeout_sec = pose_target_timeout_sec
        self._servoing_window_sec = servoing_window_sec
        self._gripper_settle_sec = gripper_settle_sec
        self._behaviour_window_sec = behaviour_window_sec
        self._behaviour_settle_sec = behaviour_settle_sec
        self._status_confirm_sec = status_confirm_sec
        self._own_echo_window_sec = own_echo_window_sec
        self._clock = clock
        self._lock = threading.RLock()
        self._own_publishes: dict[str, deque[tuple[float, Any]]] = {}
        self._pose_targets: dict[str, dict[str, PoseTargetSpec]] = {}
        #: The newest /ee_pose (qontrol's commanded tip) and /joint_states names, with when they arrived here.
        self._hand: tuple[str, tuple[float, float, float], tuple[float, float, float, float], float] | None = None
        self._joint_names: tuple[tuple[str, ...], float] | None = None
        self._active_pose_targets: dict[str, _ActivePoseTarget] = {}
        self._commanded_at: dict[str, float] = {}
        self._servoing_since: float | None = None
        self._servoing_last: float | None = None
        #: When each lasting behaviour's feedback last spoke, and on which mode topic it was requested.
        self._behaviour_last: dict[str, tuple[str, float]] = {}
        #: The manager's last status per mode topic; while held it is the truth for that topic's manager keys.
        self._status: dict[str, dict[str, Any]] = {}
        #: Manager keys a request wrote that the status has not answered yet: key -> (topic, state, when).
        self._status_pending: dict[str, tuple[str, str, float]] = {}

    # Writers: publishes

    def record_publish(self, topic: str, message_type: str, payload: Any, session_id: str = "") -> None:
        """A publish the gateway accepted from a runtime session or an HTTP client."""
        self._record_sent(topic, message_type, payload, "commanded", session_alias(session_id))

    def record_reset(self, topic: str, message_type: str, payload: Any) -> None:
        """A reset the server published itself: STOP, a leave, a stale lease."""
        self._record_sent(topic, message_type, payload, "reset", BY_SERVER)

    def expect_echo(self, topic: str, message_type: str, payload: Any) -> object:
        """Called just before Bloom publishes: its own message comes back on the echo subscription, maybe first."""
        entry = (self._clock(), self._value(topic, message_type, payload))
        with self._lock:
            self._own_publishes.setdefault(topic, deque()).append(entry)
            self._prune_own_publishes(entry[0])
        return entry

    def forget_echo(self, topic: str, token: object) -> None:
        """The publish failed, so no echo is coming."""
        with self._lock:
            pending = self._own_publishes.get(topic)
            if pending is not None:
                for index, entry in enumerate(pending):
                    if entry is token:
                        del pending[index]
                        break

    def record_echo(self, topic: str, message_type: str, payload: Any) -> None:
        """A message seen on a command topic; Bloom's own come back too, and are recognised."""
        value = self._value(topic, message_type, payload)
        with self._lock:
            if self._consume_own_echo(topic, value):
                return
            current = self.store.get(topic)
            if current is None or current.value != value:
                self._commanded_at[topic] = self._clock()
            self._apply(topic, value, "commanded", BY_OTHER, keep_if_equal=("commanded", "reset", "measured"))

    def record_service(self, service: str, payload: Any, success: bool | None, session_id: str = "") -> None:
        if success is False:
            return
        self.store.write(
            f"service:{service}", {"request": payload, "success": success}, "commanded", session_alias(session_id)
        )

    # Writers: parameters

    def record_parameter(
        self, node: str, name: str, value: Any, *, source: CommandSource = "measured", by: str = BY_ROBOT
    ) -> None:
        key = parameter_key(node, name)
        if value is None:
            self.store.mark_unknown((key,), by)
            return
        self.store.write(key, value, source, by, keep_if_equal=("measured",) if source == "measured" else ())

    def record_parameter_set(self, node: str, name: str, value: Any, status: str, session_id: str = "") -> None:
        """A set the node confirmed is what it holds; a simulated one only what was asked."""
        self.record_parameter(
            node, name, value, source="measured" if status == "set" else "commanded", by=session_alias(session_id)
        )

    # Writers: measured feedback

    def record_joint_states(self, names: Iterable[str], positions: Iterable[float]) -> None:
        names = tuple(str(name) for name in names)
        with self._lock:
            self._joint_names = (names, self._clock())
        gripper = self._gripper
        if gripper is None:
            return
        for name, position in zip(names, positions, strict=False):
            if name != gripper.joint_name:
                continue
            if not _is_number(position) or not math.isfinite(position):
                return
            payload = gripper.payload_for(float(position))
            if payload is None:
                return
            with self._lock:
                current = self.store.get(gripper.topic)
                commanded_at = self._commanded_at.get(gripper.topic)
                travelling = (
                    current is not None
                    and current.source == "commanded"
                    and current.value != payload
                    and commanded_at is not None
                    and self._clock() - commanded_at < self._gripper_settle_sec
                )
                if not travelling:
                    self.store.write(gripper.topic, payload, "measured", BY_ROBOT, keep_if_equal=("measured",))
            return

    def record_petanque_state(self, state: str | None) -> None:
        self.store.write(PETANQUE_STATE_KEY, state, "measured", BY_ROBOT, keep_if_equal=("measured",))

    def start_servoing_liveness(self) -> None:
        with self._lock:
            self._servoing_since = self._clock()

    def record_servoing_velocity(self) -> None:
        with self._lock:
            now = self._clock()
            self._servoing_last = now
            if self._servoing_since is None:
                self._servoing_since = now
        self.store.write(SERVOING_ACTIVE_KEY, True, "measured", BY_ROBOT, keep_if_equal=("measured",))

    def record_behaviour_active(self, behaviour: str, topic: str = MODE_REQUEST_TOPIC) -> None:
        """The manager's feedback for a lasting behaviour arrived: it is measured as active."""
        active_key = BEHAVIOUR_ACTIVE_KEYS.get(behaviour)
        if active_key is None:
            return
        with self._lock:
            now = self._clock()
            self._behaviour_last[behaviour] = (topic, now)
            self.store.write(active_key, True, "measured", BY_ROBOT, keep_if_equal=("measured",))
            if topic in self._status:
                return
            key = manager_key("behaviour", topic)
            current = self.store.get(key)
            # A request just sent may not have reached the manager: its feedback still says the old behaviour.
            settling = now - self._commanded_at.get(topic, float("-inf")) < self._behaviour_settle_sec
            if current is not None and current.value != behaviour and settling:
                return
            self.store.write(key, behaviour, "measured", BY_ROBOT, keep_if_equal=("measured",))

    def record_manager_status(self, states: Mapping[str, Any], topic: str = MODE_REQUEST_TOPIC) -> None:
        """The manager's latched status: from now on the measurement for this mode topic's manager keys."""
        with self._lock:
            previous = self._status.get(topic, {})
            self._status[topic] = dict(states)
            # The status reports a pose target's end itself.
            self._active_pose_targets.pop(topic, None)
            for state, value in states.items():
                key = manager_key(state, topic)
                current = self.store.get(key)
                # An unchanged report next to a newer request is the manager not having taken it up yet.
                unchanged = state in previous and previous[state] == value
                if key in self._status_pending and unchanged and current is not None and current.value != value:
                    continue
                self._status_pending.pop(key, None)
                self.store.write(key, value, "measured", BY_ROBOT)

    def live_hand(
        self, max_age_sec: float
    ) -> tuple[str, tuple[float, float, float], tuple[float, float, float, float]] | None:
        """The newest /ee_pose when it is fresh: frame, position, orientation."""
        with self._lock:
            if self._hand is None or self._clock() - self._hand[3] > max_age_sec:
                return None
            return self._hand[:3]

    def live_joint_names(self, max_age_sec: float) -> tuple[str, ...] | None:
        with self._lock:
            if self._joint_names is None or self._clock() - self._joint_names[1] > max_age_sec:
                return None
            return self._joint_names[0]

    def set_pose_targets(self, topic: str, targets: Mapping[str, PoseTargetSpec] | None) -> None:
        with self._lock:
            if targets is None:
                self._pose_targets.pop(topic, None)
            else:
                self._pose_targets[topic] = dict(targets)

    def record_ee_pose(
        self, frame_id: str, position: tuple[float, float, float], orientation: tuple[float, float, float, float]
    ) -> None:
        with self._lock:
            now = self._clock()
            self._hand = (frame_id, tuple(position), tuple(orientation), now)
            if not self._active_pose_targets:
                return
            for topic, active in list(self._active_pose_targets.items()):
                spec = active.spec or self._pose_targets.get(topic, {}).get(active.name)
                if spec is None or (spec.frame_id and frame_id and spec.frame_id != frame_id):
                    continue
                active.last_determined_at = now
                if pose_reached(spec, position, orientation):
                    del self._active_pose_targets[topic]
                    self.store.write(manager_key("behaviour", topic), PASSTHROUGH_MODE, "measured", BY_ROBOT)

    def tick(self) -> None:
        """Timed transitions: servoing going quiet, a pose target nobody can see end."""
        with self._lock:
            now = self._clock()
            if self._servoing_since is not None:
                last = self._servoing_last if self._servoing_last is not None else self._servoing_since
                if now - last > self._servoing_window_sec:
                    self.store.write(SERVOING_ACTIVE_KEY, False, "measured", BY_ROBOT, keep_if_equal=("measured",))
            for topic, active in list(self._active_pose_targets.items()):
                if now - max(active.started_at, active.last_determined_at) > self._pose_target_timeout_sec:
                    del self._active_pose_targets[topic]
                    self.store.mark_unknown((manager_key("behaviour", topic),), BY_SERVER)
            for behaviour, (topic, last) in list(self._behaviour_last.items()):
                if now - last <= self._behaviour_window_sec:
                    continue
                del self._behaviour_last[behaviour]
                self.store.write(
                    BEHAVIOUR_ACTIVE_KEYS[behaviour], False, "measured", BY_ROBOT, keep_if_equal=("measured",)
                )
                # Its feedback stopped: the manager left it, and only a request nobody saw says for what.
                key = manager_key("behaviour", topic)
                current = self.store.get(key)
                if (
                    topic not in self._status
                    and current is not None
                    and current.value == behaviour
                    and current.source == "measured"
                ):
                    self.store.mark_unknown((key,), BY_ROBOT)
            for key, (topic, state, asked_at) in list(self._status_pending.items()):
                if now - asked_at < self._status_confirm_sec:
                    continue
                # No status took the request up: the manager refused or ignored it, and still holds what it said.
                del self._status_pending[key]
                status = self._status.get(topic, {})
                if state in status:
                    self.store.write(key, status[state], "measured", BY_ROBOT)
            self._prune_own_publishes(now)

    # Writers: loss

    def mark_unknown(self, keys: Iterable[str], by: str = BY_SERVER) -> None:
        self.store.mark_unknown(keys, by)

    def mark_manager_lost(self, topic: str = MODE_REQUEST_TOPIC) -> None:
        with self._lock:
            self._active_pose_targets.pop(topic, None)
            self._behaviour_last.clear()
            # Inference is the fallback again until the next manager's latched status arrives.
            self._status.pop(topic, None)
            for key in [key for key, pending in self._status_pending.items() if pending[0] == topic]:
                del self._status_pending[key]
            self.store.mark_unknown(
                (
                    manager_key("shaping", topic),
                    manager_key("behaviour", topic),
                    manager_key("target", topic),
                    manager_key("inputs", topic),
                    topic,
                    *BEHAVIOUR_ACTIVE_KEYS.values(),
                ),
                BY_SERVER,
            )

    def mark_node_lost(self, node: str) -> None:
        prefix = parameter_key(node, "")
        self.store.mark_unknown((key for key in self.store.keys() if key.startswith(prefix)), BY_SERVER)

    # Internals

    def _record_sent(self, topic: str, message_type: str, payload: Any, source: CommandSource, by: str) -> None:
        value = self._value(topic, message_type, payload)
        with self._lock:
            self._commanded_at[topic] = self._clock()
            self._apply(topic, value, source, by)

    @staticmethod
    def _value(topic: str, message_type: str, payload: Any) -> Any:
        value = normalize_payload(message_type, payload)
        data = value.get("data") if isinstance(value, Mapping) else None
        if is_mode_request_topic(topic) and isinstance(data, str):
            return {**value, "data": normalize_mode_request(data)}
        return value

    def _apply(
        self, topic: str, value: Any, source: CommandSource, by: str, *, keep_if_equal: Collection[CommandSource] = ()
    ) -> None:
        data = value.get("data") if isinstance(value, Mapping) else None
        if topic == DIGITAL_OUTPUT_TOPIC and isinstance(data, list):
            pins = [
                (digital_output_key(int(pin)), bool(state))
                for pin, state in zip(data[0::2], data[1::2], strict=False)
                if _is_number(pin) and _is_number(state) and pin >= 0
            ]
            self.store.write_many(pins, source, by, keep_if_equal=keep_if_equal)
            return
        self.store.write(topic, value, source, by, keep_if_equal=keep_if_equal)
        if is_mode_request_topic(topic) and isinstance(data, str):
            self._apply_mode_request(topic, data, source, by, keep_if_equal)
        elif topic == POSE_TARGET_TOPIC:
            self._apply_pose_target(MODE_REQUEST_TOPIC, value, source, by, keep_if_equal)

    def _apply_pose_target(
        self, topic: str, value: Any, source: CommandSource, by: str, keep_if_equal: Collection[CommandSource]
    ) -> None:
        """A PoseStamped on the pose_target topic starts behaviour/pose_target with no target name."""
        spec = self._dynamic_pose_spec(topic, value)
        if spec is None:
            return
        if topic not in self._status:
            now = self._clock()
            self._active_pose_targets[topic] = _ActivePoseTarget(
                topic=topic, name="", started_at=now, last_determined_at=now, spec=spec
            )
        self._write_manager_states(
            topic, {"behaviour": POSE_TARGET_BEHAVIOUR, "target": None}, source, by, keep_if_equal
        )

    def _dynamic_pose_spec(self, topic: str, value: Any) -> PoseTargetSpec | None:
        pose = value.get("pose") if isinstance(value, Mapping) else None
        header = value.get("header") if isinstance(value, Mapping) else None
        if not isinstance(pose, Mapping):
            return None
        position = pose.get("position") if isinstance(pose.get("position"), Mapping) else {}
        orientation = pose.get("orientation") if isinstance(pose.get("orientation"), Mapping) else {}
        numbers = [position.get(axis) for axis in "xyz"] + [orientation.get(axis) for axis in "xyzw"]
        if not all(_is_number(number) and math.isfinite(number) for number in numbers):
            return None
        # The manager's configured tolerances apply to every pose target, a dynamic one included.
        configured = next(iter(self._pose_targets.get(topic, {}).values()), None)
        position_tolerance, orientation_tolerance = (
            (configured.position_tolerance, configured.orientation_tolerance)
            if configured is not None
            else DEFAULT_POSE_TARGET_TOLERANCE
        )
        return PoseTargetSpec(
            frame_id=str(header.get("frame_id", "")) if isinstance(header, Mapping) else "",
            position=tuple(float(number) for number in numbers[:3]),
            orientation=tuple(float(number) for number in numbers[3:]),
            position_tolerance=position_tolerance,
            orientation_tolerance=orientation_tolerance,
        )

    def _apply_mode_request(
        self, topic: str, raw: str, source: CommandSource, by: str, keep_if_equal: Collection[CommandSource]
    ) -> None:
        try:
            request = parse_mode_request(raw)
        except ModeRequestError:
            return
        mode = request.normalized
        states: dict[str, Any]
        if mode.startswith(f"{GEOMETRIC_PREFIX}/"):
            states = {"shaping": mode}
        elif mode == PASSTHROUGH_MODE:
            self._active_pose_targets.pop(topic, None)
            states = {"behaviour": PASSTHROUGH_MODE, "target": None}
        elif mode.startswith(f"{POSE_TARGET_BEHAVIOUR}/"):
            now = self._clock()
            if topic not in self._status:
                self._active_pose_targets[topic] = _ActivePoseTarget(
                    topic=topic, name=mode.rsplit("/", 1)[1], started_at=now, last_determined_at=now
                )
            states = {"behaviour": POSE_TARGET_BEHAVIOUR, "target": mode}
        else:
            self._active_pose_targets.pop(topic, None)
            # Intent scaling and shared control last, and each replaces the other; the reset enters shared control.
            lasting = next(
                (name for name in BEHAVIOUR_ACTIVE_KEYS if mode == name or mode.startswith(f"{name}/")), None
            )
            # A joint target is dispatched once; the manager is back in passthrough on its next cycle.
            joint_target = {"target": mode, "behaviour": PASSTHROUGH_MODE}
            states = {"behaviour": lasting, "target": None} if lasting else joint_target
        self._write_manager_states(topic, states, source, by, keep_if_equal)

    def _write_manager_states(
        self,
        topic: str,
        states: Mapping[str, Any],
        source: CommandSource,
        by: str,
        keep_if_equal: Collection[CommandSource],
    ) -> None:
        items = [(manager_key(state, topic), value) for state, value in states.items()]
        self.store.write_many(items, source, by, keep_if_equal=keep_if_equal)
        if topic in self._status:
            now = self._clock()
            for state in states:
                self._status_pending[manager_key(state, topic)] = (topic, state, now)

    def _consume_own_echo(self, topic: str, value: Any) -> bool:
        pending = self._own_publishes.get(topic)
        if not pending:
            return False
        self._prune_own_publishes(self._clock())
        for index, (_sent_at, sent) in enumerate(pending):
            if sent == value:
                for _ in range(index + 1):
                    pending.popleft()
                return True
        return False

    def _prune_own_publishes(self, now: float) -> None:
        for topic, pending in list(self._own_publishes.items()):
            while pending and now - pending[0][0] > self._own_echo_window_sec:
                pending.popleft()
            if not pending:
                del self._own_publishes[topic]


def pose_reached(
    spec: PoseTargetSpec, position: tuple[float, float, float], orientation: tuple[float, float, float, float]
) -> bool:
    distance = math.dist(spec.position, position)
    dot = abs(sum(a * b for a, b in zip(spec.orientation, orientation, strict=False)))
    norms = math.sqrt(sum(a * a for a in spec.orientation)) * math.sqrt(sum(b * b for b in orientation))
    if norms == 0:
        return False
    angle = 2 * math.acos(min(1.0, dot / norms))
    # The manager stops once inside its tolerance; a little slack absorbs the measurement's noise.
    return distance <= 1.5 * spec.position_tolerance and angle <= 1.5 * spec.orientation_tolerance


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


class EchoExpectingGateway:
    """Tells the tracker about each publish before it leaves, so its echo is known as Bloom's own."""

    def __init__(self, gateway: Any, tracker: CommandStateTracker) -> None:
        self._gateway = gateway
        self._tracker = tracker

    def publish(self, request: Any) -> Any:
        token = self._tracker.expect_echo(request.topic, request.message_type, request.payload)
        try:
            return self._gateway.publish(request)
        except BaseException:
            self._tracker.forget_echo(request.topic, token)
            raise
