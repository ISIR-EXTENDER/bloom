import json
import math

from libs.ros_adapters.rclpy_topic_streams import (
    MAX_STREAMED_SEQUENCE,
    find_oversized_field,
    to_jsonable_value,
)


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
