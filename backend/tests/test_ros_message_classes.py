"""The rosidl class behind a type name is resolved once, and a missing rosidl says what it was needed for."""

from __future__ import annotations

import sys
import types

import pytest

from libs.ros_adapters.messages import resolve_message_class
from libs.ros_adapters.spin import spin_node_once


class FakeString:
    pass


def install_fake_rosidl(monkeypatch: pytest.MonkeyPatch, known: dict[str, type]) -> None:
    utilities = types.ModuleType("rosidl_runtime_py.utilities")

    def get_message(message_type: str) -> type:
        try:
            return known[message_type]
        except KeyError as exc:
            raise ModuleNotFoundError(message_type) from exc

    utilities.get_message = get_message  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py", types.ModuleType("rosidl_runtime_py"))
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py.utilities", utilities)


def test_a_type_is_resolved_once_and_then_served_from_the_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    install_fake_rosidl(monkeypatch, {"std_msgs/msg/String": FakeString})
    cache: dict[str, type] = {}

    assert resolve_message_class("std_msgs/msg/String", cache, "subscribe to ROS topics") is FakeString

    # rosidl gone after the first resolution: the cached class still answers.
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py.utilities", None)
    assert resolve_message_class("std_msgs/msg/String", cache, "subscribe to ROS topics") is FakeString


def test_an_unknown_type_is_a_value_error_naming_it(monkeypatch: pytest.MonkeyPatch) -> None:
    install_fake_rosidl(monkeypatch, {})
    cache: dict[str, type] = {}

    with pytest.raises(ValueError, match="Unsupported ROS message type: lab_msgs/msg/Nope"):
        resolve_message_class("lab_msgs/msg/Nope", cache, "subscribe to ROS topics")

    assert cache == {}


def test_without_rosidl_the_error_says_what_it_was_needed_for(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py", None)
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py.utilities", None)

    with pytest.raises(RuntimeError, match="rosidl_runtime_py is required to follow command state"):
        resolve_message_class("std_msgs/msg/String", {}, "follow command state")


def test_spin_once_spins_the_given_node_with_the_given_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    spins: list[tuple[object, float]] = []
    rclpy = types.ModuleType("rclpy")
    rclpy.spin_once = lambda node, timeout_sec: spins.append((node, timeout_sec))  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "rclpy", rclpy)
    node = object()

    spin_node_once(node, "publish teleop commands", timeout_sec=0.2)

    assert spins == [(node, 0.2)]


def test_without_rclpy_a_flush_fails_with_the_purpose(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(sys.modules, "rclpy", None)

    with pytest.raises(RuntimeError, match="rclpy is required to publish teleop commands"):
        spin_node_once(object(), "publish teleop commands")
