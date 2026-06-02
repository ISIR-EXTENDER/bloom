from __future__ import annotations

from typing import Any

import yaml


def parse_ros_payload_text(payload_text: str) -> dict[str, Any]:
    trimmed_payload = payload_text.strip()
    if not trimmed_payload:
        raise ValueError("ROS payload text is empty")

    try:
        parsed_payload = yaml.safe_load(trimmed_payload)
    except yaml.YAMLError as exc:
        raise ValueError(f"Invalid ROS payload text: {exc}") from exc

    if parsed_payload is None:
        raise ValueError("ROS payload text is empty")
    if not isinstance(parsed_payload, dict):
        raise ValueError("ROS payload text must describe message fields as a mapping")
    return parsed_payload
