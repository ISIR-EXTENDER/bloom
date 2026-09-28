"""Payload values are checked against the message's declared field types before rosidl coerces them."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters import RosPublishRequest, rclpy_publishers, safety
from libs.ros_adapters.rclpy_publishers import RclpyRosPublisherGateway
from libs.ros_adapters.safe_publish import SafeRosPublishError, publish_with_runtime_policy
from libs.ros_adapters.safety import RuntimeCommandPolicy, RuntimePayloadShapeError, validate_minimum_payload_shape
from libs.sessions.audit import InMemoryRuntimeAuditLog

PUBLISH = "/api/v1/ros/topics/publish"


def fields(**declared: str) -> type:
    return type("Message", (), {"get_fields_and_field_types": staticmethod(lambda: declared)})


FAKE_CLASSES = {
    "geometry_msgs/msg/TwistStamped": fields(header="std_msgs/Header", twist="geometry_msgs/Twist"),
    "geometry_msgs/Twist": fields(linear="geometry_msgs/Vector3", angular="geometry_msgs/Vector3"),
    "geometry_msgs/Vector3": fields(x="double", y="double", z="double"),
    "std_msgs/msg/Float32MultiArray": fields(layout="std_msgs/MultiArrayLayout", data="sequence<float>"),
    "std_msgs/MultiArrayLayout": fields(dim="sequence<std_msgs/MultiArrayDimension>", data_offset="uint32"),
    "std_msgs/MultiArrayDimension": fields(label="string", size="uint32", stride="uint32"),
    "std_msgs/msg/Int16": fields(data="int16"),
}


@pytest.fixture
def fake_rosidl(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(safety, "message_class", FAKE_CLASSES.get)


def twist(x: object) -> dict:
    return {"header": {"frame_id": "nan"}, "twist": {"linear": {"x": x, "y": 0.0, "z": 0.0}}}


@pytest.mark.parametrize("x", ["nan", "-inf", "1e308", "0.5", True])
def test_a_float_field_refuses_text_and_booleans(fake_rosidl: None, x: object) -> None:
    with pytest.raises(RuntimePayloadShapeError, match="'twist.linear.x' must be a finite number"):
        validate_minimum_payload_shape("geometry_msgs/msg/TwistStamped", twist(x))


def test_a_float_field_takes_numbers_and_a_string_field_takes_nan_text(fake_rosidl: None) -> None:
    validate_minimum_payload_shape("geometry_msgs/msg/TwistStamped", twist(1))
    validate_minimum_payload_shape("geometry_msgs/msg/TwistStamped", twist(0.25))


@pytest.mark.parametrize(
    ("message_type", "payload", "field"),
    [
        ("std_msgs/msg/Int16", {"data": 40000}, "'data'"),
        ("std_msgs/msg/Float32MultiArray", {"layout": {"dim": [{"size": -1}]}, "data": []}, "'layout.dim[0].size'"),
        ("std_msgs/msg/Float32MultiArray", {"layout": {"data_offset": 2**32}, "data": []}, "'layout.data_offset'"),
        ("std_msgs/msg/Float32MultiArray", {"data": [1.0, 1e39]}, "'data[1]'"),
        ("std_msgs/msg/Float32MultiArray", {"data": [1.0, "nan"]}, "'data[1]'"),
    ],
)
def test_nested_values_are_range_checked_by_field_type(
    fake_rosidl: None, message_type: str, payload: dict, field: str
) -> None:
    with pytest.raises(RuntimePayloadShapeError, match=field.replace("[", r"\[").replace("]", r"\]")):
        validate_minimum_payload_shape(message_type, payload)


def test_without_rosidl_non_finite_text_is_still_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(safety, "message_class", lambda _message_type: None)
    for text in ("nan", " NaN ", "-inf", "+Infinity"):
        with pytest.raises(RuntimePayloadShapeError, match="must be a number"):
            validate_minimum_payload_shape("geometry_msgs/msg/TwistStamped", {"twist": {"linear": {"x": text}}})
    validate_minimum_payload_shape("geometry_msgs/msg/TwistStamped", {"header": {"frame_id": "base_link"}})
    validate_minimum_payload_shape("std_msgs/msg/String", {"data": "nan"})


def test_a_nan_string_twist_is_a_422_over_http(fake_rosidl: None) -> None:
    published: list[RosPublishRequest] = []
    gateway = SimpleNamespace(publish=published.append)
    client = TestClient(
        create_app(
            Settings(environment="test", runtime_control_required=False, allowed_ros_message_types=("*",)),
            InMemoryConfigurationRepository(),
            ros_publisher_gateway=gateway,
        )
    )
    response = client.post(
        PUBLISH, json={"topic": "/ui/twist", "message_type": "geometry_msgs/msg/TwistStamped", "payload": twist("nan")}
    )
    assert response.status_code == 422
    assert published == []


class RaisingPublisher:
    def __init__(self, error: Exception) -> None:
        self.error = error

    def publish(self, _message: object) -> None:
        raise self.error


def test_an_rclpy_system_error_on_publish_is_an_audited_422(monkeypatch: pytest.MonkeyPatch) -> None:
    node = SimpleNamespace(create_publisher=lambda *_args: RaisingPublisher(SystemError("negative uint32")))
    monkeypatch.setattr(rclpy_publishers, "resolve_message_class", lambda *_args: object)
    monkeypatch.setattr(RclpyRosPublisherGateway, "_set_message_fields", staticmethod(lambda *_args: None))
    audit_log = InMemoryRuntimeAuditLog()
    request = RosPublishRequest(topic="/ui/array", message_type="std_msgs/msg/Float32MultiArray", payload={"data": []})

    with pytest.raises(SafeRosPublishError) as raised:
        publish_with_runtime_policy(
            RclpyRosPublisherGateway(node),
            RuntimeCommandPolicy(
                allowed_message_types=("*",), allowed_publish_topics=("*",), allowed_teleop_targets=()
            ),
            audit_log,
            request,
        )

    assert raised.value.status_code == 422
    [record] = audit_log.list_records()
    assert record.status == "rejected" and "negative uint32" in record.detail


def test_any_other_gateway_error_is_audited_not_a_500() -> None:
    gateway = SimpleNamespace(publish=RaisingPublisher(KeyError("surprise")).publish)
    audit_log = InMemoryRuntimeAuditLog()
    request = RosPublishRequest(topic="/ui/flag", message_type="std_msgs/msg/Bool", payload={"data": True})

    with pytest.raises(SafeRosPublishError) as raised:
        publish_with_runtime_policy(
            gateway,
            RuntimeCommandPolicy(
                allowed_message_types=("*",), allowed_publish_topics=("*",), allowed_teleop_targets=()
            ),
            audit_log,
            request,
        )

    assert raised.value.status_code == 503
    assert audit_log.list_records()[0].status == "rejected"


def test_a_message_field_setter_assertion_is_a_clean_value_error(monkeypatch: pytest.MonkeyPatch) -> None:
    import sys
    import types

    def asserting(_message: object, _payload: object) -> None:
        raise AssertionError("The 'x' field must be of type 'float'")

    module = types.ModuleType("rosidl_runtime_py.set_message")
    module.set_message_fields = asserting  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py", types.ModuleType("rosidl_runtime_py"))
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py.set_message", module)

    with pytest.raises(ValueError, match="Invalid ROS message payload"):
        RclpyRosPublisherGateway._set_message_fields(object(), {"x": "a"})


def test_deeply_nested_payload_text_is_a_422() -> None:
    client = TestClient(create_app(Settings(environment="test"), InMemoryConfigurationRepository()))
    nested = "data: " + "[" * 5000 + "]" * 5000
    response = client.post(
        PUBLISH, json={"topic": "/ui/text", "message_type": "std_msgs/msg/String", "payload_text": nested}
    )
    assert response.status_code == 422
    assert "nested too deeply" in response.json()["detail"]
