"""Payload text is YAML that must describe message fields; anything else is refused with a reason."""

from __future__ import annotations

import pytest

from libs.ros_adapters.payloads import parse_ros_payload_text


@pytest.mark.parametrize("text", ["", "   \n\t", "~", "---\n", "# only a comment"])
def test_text_with_no_fields_is_refused_as_empty(text: str) -> None:
    with pytest.raises(ValueError, match="ROS payload text is empty"):
        parse_ros_payload_text(text)


@pytest.mark.parametrize("text", ["[1, 2]", "42", "hello", "- data: 1"])
def test_text_that_is_not_a_mapping_is_refused(text: str) -> None:
    with pytest.raises(ValueError, match="must describe message fields as a mapping"):
        parse_ros_payload_text(text)


def test_broken_yaml_is_refused_with_the_parser_reason() -> None:
    with pytest.raises(ValueError, match="Invalid ROS payload text"):
        parse_ros_payload_text("{data: [1, 2")


def test_a_mapping_is_returned_as_fields() -> None:
    assert parse_ros_payload_text("\ndata: 1.5\nframe: base\n\n") == {"data": 1.5, "frame": "base"}
