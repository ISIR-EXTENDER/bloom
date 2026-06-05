from __future__ import annotations

from dataclasses import dataclass
from typing import Any


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

    def ensure_publish_allowed(self, topic: str, message_type: str, payload: dict[str, Any]) -> None:
        ensure_allowed(topic, self.allowed_publish_topics, "ROS topic")
        ensure_allowed(message_type, self.allowed_message_types, "ROS message type")
        validate_minimum_payload_shape(message_type, payload)

    def ensure_teleop_allowed(self, target: str) -> None:
        ensure_allowed(target, self.allowed_teleop_targets, "teleop target")

    def ensure_recording_topics_allowed(self, topics: tuple[str, ...]) -> None:
        for topic in topics:
            ensure_allowed(topic, self.allowed_recording_topics, "recording topic")


def ensure_allowed(value: str, allowed_values: tuple[str, ...], label: str) -> None:
    if "*" in allowed_values or value in allowed_values:
        return
    raise RuntimeCommandPolicyError(f"{label} '{value}' is not allowed by the runtime policy.")


def validate_minimum_payload_shape(message_type: str, payload: dict[str, Any]) -> None:
    if not message_type.startswith("std_msgs/msg/"):
        return

    if "data" not in payload:
        raise RuntimePayloadShapeError(f"{message_type} payload must include a 'data' field.")

    data = payload["data"]
    if message_type == "std_msgs/msg/Bool" and not isinstance(data, bool):
        raise RuntimePayloadShapeError("std_msgs/msg/Bool payload field 'data' must be a boolean.")
    if message_type == "std_msgs/msg/Float64" and not isinstance(data, int | float):
        raise RuntimePayloadShapeError("std_msgs/msg/Float64 payload field 'data' must be a number.")
    if message_type == "std_msgs/msg/Int32" and not isinstance(data, int):
        raise RuntimePayloadShapeError("std_msgs/msg/Int32 payload field 'data' must be an integer.")
    if message_type == "std_msgs/msg/String" and not isinstance(data, str):
        raise RuntimePayloadShapeError("std_msgs/msg/String payload field 'data' must be a string.")
    if message_type == "std_msgs/msg/Int32MultiArray" and not isinstance(data, list):
        raise RuntimePayloadShapeError("std_msgs/msg/Int32MultiArray payload field 'data' must be a list.")
