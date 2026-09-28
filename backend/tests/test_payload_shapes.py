"""Each std_msgs payload is refused with the field named when its data cannot be what the type carries."""

from __future__ import annotations

import re

import pytest

from libs.ros_adapters.safety import (
    RuntimePayloadShapeError,
    is_finite_number,
    message_field_error,
    parameter_value_error,
    validate_minimum_payload_shape,
    validate_service_request_payload,
)


@pytest.mark.parametrize(
    ("message_type", "data", "reason"),
    [
        ("std_msgs/msg/Bool", "true", "must be a boolean"),
        ("std_msgs/msg/Bool", 1, "must be a boolean"),
        ("std_msgs/msg/Float64", "1.0", "must be a finite number"),
        ("std_msgs/msg/Float32", True, "must be a finite number"),
        ("std_msgs/msg/Int32", True, "must be an integer"),
        ("std_msgs/msg/Int32", 1.5, "must be an integer"),
        ("std_msgs/msg/String", 1, "must be a string"),
        ("std_msgs/msg/Float32MultiArray", 1.0, "must be a list"),
        ("std_msgs/msg/Int32MultiArray", "1,2", "must be a list"),
        ("std_msgs/msg/UInt8MultiArray", {"0": 1}, "must be a list"),
        ("std_msgs/msg/Float32", 1e39, "exceeds the float32 range"),
        ("std_msgs/msg/Float32MultiArray", [0.0, -1e39], "exceeds the float32 range"),
        ("std_msgs/msg/Int32", 2**31, "from -2147483648 to 2147483647"),
        ("std_msgs/msg/Int32MultiArray", [0, -(2**31) - 1], "from -2147483648 to 2147483647"),
        ("std_msgs/msg/UInt8MultiArray", [13, 256], "from 0 to 255"),
    ],
)
def test_a_std_msg_whose_data_the_type_cannot_carry_is_refused(message_type: str, data: object, reason: str) -> None:
    with pytest.raises(RuntimePayloadShapeError, match=reason):
        validate_minimum_payload_shape(message_type, {"data": data})


@pytest.mark.parametrize(
    ("message_type", "data"),
    [
        ("std_msgs/msg/Bool", False),
        ("std_msgs/msg/Float64", 0),
        ("std_msgs/msg/Float32", 3.4e38),
        ("std_msgs/msg/Int32", -(2**31)),
        ("std_msgs/msg/String", ""),
        ("std_msgs/msg/Float32MultiArray", []),
        ("std_msgs/msg/UInt8MultiArray", [0, 255]),
    ],
)
def test_data_at_the_edge_of_what_the_type_carries_passes(message_type: str, data: object) -> None:
    validate_minimum_payload_shape(message_type, {"data": data})


def test_a_std_msg_payload_without_data_is_refused_but_another_package_is_not_shaped() -> None:
    with pytest.raises(RuntimePayloadShapeError, match="must include a 'data' field"):
        validate_minimum_payload_shape("std_msgs/msg/Bool", {})
    validate_minimum_payload_shape("geometry_msgs/msg/Twist", {"linear": {"x": 0.1}})


def test_a_nan_hidden_in_a_nested_field_is_refused_wherever_it_sits() -> None:
    with pytest.raises(RuntimePayloadShapeError, match="must not hold NaN"):
        validate_minimum_payload_shape("geometry_msgs/msg/Twist", {"linear": {"x": float("inf")}})
    with pytest.raises(RuntimePayloadShapeError, match="must not hold NaN"):
        validate_minimum_payload_shape("geometry_msgs/msg/Twist", {"linear": [0.0, float("nan")]})


def test_a_non_finite_written_as_text_is_named_by_its_path() -> None:
    # With rosidl the declared float field refuses the text; without it the walker finds the texts rosidl
    # would have turned into floats. Either way the operator is told which field.
    error = message_field_error("geometry_msgs/msg/Twist", {"linear": {"x": "nan"}}) or ""
    assert re.fullmatch(r"'linear.x' must be a (finite )?number.*", error)
    assert message_field_error("std_msgs/msg/String", {"data": "nan"}) is None
    unknown = message_field_error("no_such_pkg/msg/Nothing", {"speed": {"x": "Inf"}, "gains": ["-inf"]})
    assert unknown == "'speed.x' must be a number, not 'Inf'."
    assert message_field_error("no_such_pkg/msg/Nothing", {"speed": {"x": "0.1"}}) is None


def test_a_service_request_is_walked_the_same_way() -> None:
    with pytest.raises(RuntimePayloadShapeError, match="must not hold NaN"):
        validate_service_request_payload("example_interfaces/srv/SetBool", {"data": float("nan")})
    with pytest.raises(RuntimePayloadShapeError, match=r"request field 'data' must be a"):
        validate_service_request_payload("example_interfaces/srv/SetBool", {"data": "inf"})
    validate_service_request_payload("example_interfaces/srv/SetBool", {"data": True})
    with pytest.raises(RuntimePayloadShapeError, match=r"request field 'a' must be a number, not '-inf'"):
        validate_service_request_payload("no_such_pkg/srv/Nothing", {"a": "-inf"})


def test_an_integer_past_the_float_range_is_not_a_finite_number() -> None:
    assert is_finite_number(10**400) is False
    assert is_finite_number(True) is False
    assert is_finite_number(1.5) is True


def test_a_live_parameter_that_is_not_a_number_at_all_is_refused_by_its_name() -> None:
    assert parameter_value_error("rate_limiter.max_linear_acceleration", "fast") == (
        "parameter rate_limiter.max_linear_acceleration must be a number above zero."
    )
    assert parameter_value_error("max_linear_speed", True) == (
        "parameter max_linear_speed must be a number of zero or more."
    )
    assert parameter_value_error("max_linear_speed", 0) is None
    assert parameter_value_error("shapers.snake.enabled", "anything") is None
