from __future__ import annotations

from typing import Any

import yaml


class _NoAliasSafeLoader(yaml.SafeLoader):
    """Nested aliases expand exponentially: a few hundred bytes cost seconds of CPU."""

    def compose_node(self, parent: Any, index: Any) -> Any:
        if self.check_event(yaml.AliasEvent):
            raise yaml.composer.ComposerError(
                None, None, "YAML aliases are not allowed in a ROS payload", self.peek_event().start_mark
            )
        return super().compose_node(parent, index)


def parse_ros_payload_text(payload_text: str) -> dict[str, Any]:
    trimmed_payload = payload_text.strip()
    if not trimmed_payload:
        raise ValueError("ROS payload text is empty")

    try:
        parsed_payload = yaml.load(trimmed_payload, Loader=_NoAliasSafeLoader)
    except yaml.YAMLError as exc:
        raise ValueError(f"Invalid ROS payload text: {exc}") from exc

    if parsed_payload is None:
        raise ValueError("ROS payload text is empty")
    if not isinstance(parsed_payload, dict):
        raise ValueError("ROS payload text must describe message fields as a mapping")
    return parsed_payload
