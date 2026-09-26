from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any

MAX_LINEAR_SPEED_TOPIC = "/explorer_user_interfaces/rqt_armcontrol/max_linear_speed"
MAX_ANGULAR_SPEED_TOPIC = "/explorer_user_interfaces/rqt_armcontrol/max_angular_speed"
#: The operator UI's own slider caps: 0.3 m/s and 0.8 rad/s.
DEFAULT_TOPIC_VALUE_BOUNDS: tuple[tuple[str, float, float], ...] = (
    (MAX_LINEAR_SPEED_TOPIC, 0.0, 0.3),
    (MAX_ANGULAR_SPEED_TOPIC, 0.0, 0.8),
)
MANAGER_NODE = "/cartesian_manager"


def manager_parameter_bounds(
    max_linear_acceleration: float, max_angular_acceleration: float, max_jaco_angular_velocity: float
) -> tuple[tuple[str, float, float], ...]:
    return (
        (f"{MANAGER_NODE}:rate_limiter.max_linear_acceleration", 0.0, max_linear_acceleration),
        (f"{MANAGER_NODE}:rate_limiter.max_angular_acceleration", 0.0, max_angular_acceleration),
        (f"{MANAGER_NODE}:shapers.jaco.max_angular_velocity", 0.0, max_jaco_angular_velocity),
    )


#: About 3x what cartesian_manager ships: 2.0 for both accelerations, 0.4 rad/s for jaco.
DEFAULT_PARAMETER_BOUNDS = manager_parameter_bounds(6.0, 6.0, 1.2)
_FLOAT32_MAX = 3.4028234663852886e38
_INTEGER_RANGES: dict[str, tuple[int, int]] = {
    "std_msgs/msg/Int32": (-(2**31), 2**31 - 1),
    "std_msgs/msg/Int32MultiArray": (-(2**31), 2**31 - 1),
    "std_msgs/msg/UInt8MultiArray": (0, 255),
}
_FLOAT32_TYPES = frozenset({"std_msgs/msg/Float32", "std_msgs/msg/Float32MultiArray"})
_NON_NEGATIVE_PARAMETER = re.compile(r"(^|\.)max_\w*speed$")
# cartesian_manager reads <= 0 on these as "no limit": the rate limiter and the jaco clamp switch off.
_POSITIVE_PARAMETER = re.compile(r"(^|\.)max_\w*(velocity|acceleration)$")


class RuntimeCommandPolicyError(ValueError):
    """Raised when a command is not allowed by the runtime safety policy."""


class RuntimePayloadShapeError(ValueError):
    """Raised when a payload does not match the minimum expected message shape."""


@dataclass(frozen=True)
class RuntimeCommandPolicy:
    allowed_message_types: tuple[str, ...]
    allowed_publish_topics: tuple[str, ...]
    allowed_teleop_targets: tuple[str, ...]
    allowed_recording_topics: tuple[str, ...] = ()
    allowed_service_calls: tuple[str, ...] = ()
    allowed_service_types: tuple[str, ...] = ()
    #: "<node>:<parameter>" pairs a runtime may set live.
    allowed_parameters: tuple[str, ...] = ()
    #: (topic, min, max) for topics whose `data` is a limit the robot obeys.
    topic_value_bounds: tuple[tuple[str, float, float], ...] = DEFAULT_TOPIC_VALUE_BOUNDS
    #: ("<node>:<parameter>", min, max) for live parameters the manager does not bound itself.
    parameter_bounds: tuple[tuple[str, float, float], ...] = DEFAULT_PARAMETER_BOUNDS

    def ensure_publish_allowed(self, topic: str, message_type: str, payload: dict[str, Any]) -> None:
        ensure_allowed(topic, self.allowed_publish_topics, "ROS topic")
        ensure_allowed(message_type, self.allowed_message_types, "ROS message type")
        validate_minimum_payload_shape(message_type, payload)
        self.ensure_topic_value_in_bounds(topic, payload)

    def ensure_topic_value_in_bounds(self, topic: str, payload: dict[str, Any]) -> None:
        for bounded_topic, lower, upper in self.topic_value_bounds:
            if topic != bounded_topic:
                continue
            data = payload.get("data")
            if not is_finite_number(data) or not lower <= data <= upper:
                raise RuntimePayloadShapeError(
                    f"{topic} payload field 'data' must be a number from {lower} to {upper}."
                )

    def ensure_teleop_allowed(self, target: str) -> None:
        ensure_allowed(target, self.allowed_teleop_targets, "teleop target")

    def ensure_service_allowed(self, service: str, service_type: str) -> None:
        ensure_allowed(service, self.allowed_service_calls, "ROS service")
        ensure_allowed(service_type, self.allowed_service_types, "ROS service type")

    def ensure_parameter_allowed(self, node: str, name: str) -> None:
        ensure_allowed(f"{node}:{name}", self.allowed_parameters, "ROS parameter")

    def ensure_parameter_value_in_bounds(self, node: str, name: str, value: object) -> None:
        for bounded, lower, upper in self.parameter_bounds:
            if bounded != f"{node}:{name}":
                continue
            if not is_finite_number(value) or not lower <= value <= upper:
                raise RuntimePayloadShapeError(f"parameter {name} must be a number from {lower} to {upper}.")

    def ensure_recording_topics_allowed(self, topics: tuple[str, ...]) -> None:
        for topic in topics:
            ensure_allowed(topic, self.allowed_recording_topics, "recording topic")


def ensure_allowed(value: str, allowed_values: tuple[str, ...], label: str) -> None:
    if "*" in allowed_values or value in allowed_values:
        return
    # An entry ending in "/" grants its namespace: "/ui/" lets an app author
    # wire a new UI bridge topic from the builder without a backend edit.
    if any(entry.endswith("/") and entry != "/" and value.startswith(entry) for entry in allowed_values):
        return
    raise RuntimeCommandPolicyError(f"{label} '{value}' is not allowed by the runtime policy.")


def validate_minimum_payload_shape(message_type: str, payload: dict[str, Any]) -> None:
    if _holds_non_finite(payload):
        raise RuntimePayloadShapeError(f"{message_type} payload must not hold NaN, infinite or out-of-range numbers.")
    if not message_type.startswith("std_msgs/msg/"):
        return

    if "data" not in payload:
        raise RuntimePayloadShapeError(f"{message_type} payload must include a 'data' field.")

    data = payload["data"]
    if message_type == "std_msgs/msg/Bool" and not isinstance(data, bool):
        raise RuntimePayloadShapeError("std_msgs/msg/Bool payload field 'data' must be a boolean.")
    if message_type in {"std_msgs/msg/Float64", "std_msgs/msg/Float32"} and not is_finite_number(data):
        raise RuntimePayloadShapeError(f"{message_type} payload field 'data' must be a finite number.")
    if message_type == "std_msgs/msg/Int32" and (isinstance(data, bool) or not isinstance(data, int)):
        raise RuntimePayloadShapeError("std_msgs/msg/Int32 payload field 'data' must be an integer.")
    if message_type == "std_msgs/msg/String" and not isinstance(data, str):
        raise RuntimePayloadShapeError("std_msgs/msg/String payload field 'data' must be a string.")
    if message_type in {
        "std_msgs/msg/Float32MultiArray",
        "std_msgs/msg/Int32MultiArray",
        "std_msgs/msg/UInt8MultiArray",
    } and not isinstance(data, list):
        raise RuntimePayloadShapeError(f"{message_type} payload field 'data' must be a list.")
    _ensure_numeric_range(message_type, data)


def _ensure_numeric_range(message_type: str, data: object) -> None:
    """rosidl wraps an out-of-range int and turns a float32 overflow into inf; refuse both."""
    values = data if isinstance(data, list) else [data]
    if message_type in _FLOAT32_TYPES:
        if any(is_finite_number(value) and abs(value) > _FLOAT32_MAX for value in values):
            raise RuntimePayloadShapeError(f"{message_type} payload field 'data' exceeds the float32 range.")
    elif message_type in _INTEGER_RANGES:
        lower, upper = _INTEGER_RANGES[message_type]
        if any(isinstance(value, int) and not lower <= value <= upper for value in values):
            raise RuntimePayloadShapeError(
                f"{message_type} payload field 'data' must hold integers from {lower} to {upper}."
            )


def _holds_non_finite(value: object) -> bool:
    if isinstance(value, int | float) and not isinstance(value, bool):
        return not is_finite_number(value)
    if isinstance(value, dict):
        return any(_holds_non_finite(item) for item in value.values())
    if isinstance(value, list | tuple):
        return any(_holds_non_finite(item) for item in value)
    return False


def is_finite_number(value: object) -> bool:
    if not isinstance(value, int | float) or isinstance(value, bool):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        # An int past the float range; nothing downstream can carry it.
        return False


def parameter_value_error(name: str, value: object) -> str | None:
    """Why a live parameter value is refused, or None."""
    if isinstance(value, int | float) and not isinstance(value, bool) and not is_finite_number(value):
        return f"parameter {name} must be a finite number."
    if _POSITIVE_PARAMETER.search(name) and not (is_finite_number(value) and value > 0):
        return f"parameter {name} must be a number above zero."
    if _NON_NEGATIVE_PARAMETER.search(name) and not (is_finite_number(value) and value >= 0):
        return f"parameter {name} must be a number of zero or more."
    return None
