import json
import logging
import math
import sys
import types
from types import SimpleNamespace

import pytest

from libs.ros_adapters.rclpy_topic_streams import (
    MAX_STREAMED_SEQUENCE,
    RclpyRuntimeTopicSubscriptionGateway,
    find_oversized_field,
    to_jsonable_ros_message,
    to_jsonable_value,
)
from libs.sessions.topics import RuntimeTopicSample, RuntimeTopicSubscription


def test_non_finite_floats_become_null_so_the_sample_stays_valid_json():
    value = {"position": [0.5, 1.0], "velocity": [0.0, math.nan], "effort": [math.inf, -math.inf]}

    jsonable = to_jsonable_value(value)

    assert jsonable == {"position": [0.5, 1.0], "velocity": [0.0, None], "effort": [None, None]}
    assert "NaN" not in json.dumps(jsonable)


class FakeImage:
    """The shape rclpy gives a message: fields in __slots__, payload in a sized buffer."""

    __slots__ = ("_data", "_height", "_width")

    def __init__(self, byte_count: int) -> None:
        self._data = bytearray(byte_count)
        self._height = 480
        self._width = 640


class FakeJointState:
    __slots__ = ("_effort", "_name", "_position")

    def __init__(self) -> None:
        self._name = ["joint_1", "joint_2"]
        self._position = [0.5, 1.0]
        self._effort = []


def test_a_bulk_field_is_named_so_it_never_reaches_the_converter():
    # Converting one 480p frame costs about 0.75 s on the single executor thread every other
    # subscription shares, so the guard has to read the length rather than the content.
    assert find_oversized_field(FakeImage(640 * 480 * 3)) == "data"


def test_a_telemetry_message_is_not_mistaken_for_a_bulk_one():
    assert find_oversized_field(FakeJointState()) is None
    assert find_oversized_field(FakeImage(MAX_STREAMED_SEQUENCE)) is None


class Reading:
    """A message with one sequence field, as rclpy lays it out."""

    __slots__ = ("_data",)

    def __init__(self, data: list[float]) -> None:
        self._data = data


class CapturingNode:
    """Keeps the callback rclpy would invoke, so a test can hand it a message."""

    def __init__(self, topics: list[tuple[str, list[str]]] | None = None) -> None:
        self.callbacks: list = []
        self.topics = topics or []

    def get_publishers_info_by_topic(self, topic: str) -> list:
        reliable = SimpleNamespace(
            reliability=SimpleNamespace(name="RELIABLE"), durability=SimpleNamespace(name="VOLATILE")
        )
        return [SimpleNamespace(qos_profile=reliable)]

    def create_subscription(self, message_cls, topic, callback, qos) -> int:
        self.callbacks.append(callback)
        return len(self.callbacks)

    def destroy_subscription(self, subscription) -> None:
        return None

    def get_topic_names_and_types(self) -> list[tuple[str, list[str]]]:
        return list(self.topics)


@pytest.fixture
def fake_rosidl(monkeypatch: pytest.MonkeyPatch) -> None:
    utilities = types.ModuleType("rosidl_runtime_py.utilities")
    utilities.get_message = lambda message_type: Reading  # type: ignore[attr-defined]
    convert = types.ModuleType("rosidl_runtime_py.convert")
    convert.message_to_ordereddict = lambda message: {"data": list(message._data)}  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py", types.ModuleType("rosidl_runtime_py"))
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py.utilities", utilities)
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py.convert", convert)


def stream(node: CapturingNode, message_type: str = "lab_msgs/msg/Reading") -> list[RuntimeTopicSample]:
    samples: list[RuntimeTopicSample] = []
    gateway = RclpyRuntimeTopicSubscriptionGateway(node, qos_factory=lambda choice: choice)
    gateway.subscribe(RuntimeTopicSubscription(topic="/status", message_type=message_type), samples.append)
    return samples


def test_a_message_reaches_the_widget_as_a_json_safe_sample(fake_rosidl: None) -> None:
    node = CapturingNode()
    samples = stream(node)

    node.callbacks[0](Reading([0.5, math.nan]))

    [sample] = samples
    assert (sample.topic, sample.message_type) == ("/status", "lab_msgs/msg/Reading")
    assert sample.value == {"data": [0.5, None]}


def test_a_bulk_message_is_dropped_and_warned_about_once(fake_rosidl: None, caplog: pytest.LogCaptureFixture) -> None:
    node = CapturingNode()
    samples = stream(node)
    caplog.set_level(logging.WARNING, logger="libs.ros_adapters.rclpy_topic_streams")

    node.callbacks[0](Reading([0.0] * (MAX_STREAMED_SEQUENCE + 1)))
    node.callbacks[0](Reading([0.0] * (MAX_STREAMED_SEQUENCE + 1)))
    node.callbacks[0](Reading([1.0]))

    assert [sample.value for sample in samples] == [{"data": [1.0]}]
    warnings = [record for record in caplog.records if record.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert "/status" in warnings[0].getMessage() and "'data'" in warnings[0].getMessage()


def test_a_subscription_without_a_type_takes_the_one_the_graph_advertises(fake_rosidl: None) -> None:
    node = CapturingNode([("/other", ["std_msgs/msg/String"]), ("/status", ["lab_msgs/msg/Reading"])])
    samples = stream(node, message_type="")

    node.callbacks[0](Reading([2.0]))

    assert samples[0].message_type == "lab_msgs/msg/Reading"


def test_a_topic_nobody_advertises_cannot_be_subscribed_without_a_type(fake_rosidl: None) -> None:
    node = CapturingNode([("/status", [])])

    with pytest.raises(RuntimeError, match="Cannot subscribe to /status: message type is required"):
        stream(node, message_type="")

    assert node.callbacks == []


def test_without_rosidl_a_message_cannot_be_serialized(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py", None)
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py.convert", None)

    with pytest.raises(RuntimeError, match="rosidl_runtime_py is required to serialize ROS topic messages"):
        to_jsonable_ros_message(Reading([1.0]))
