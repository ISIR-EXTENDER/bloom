"""The rclpy service gateway against fake rosidl and rclpy objects, so every failure path runs without ROS."""

from __future__ import annotations

import sys
import types
from typing import Any

import pytest

from libs.ros_adapters.services import (
    RclpyRosServiceGateway,
    RosServiceRequest,
    build_service_request,
    receipt_from_response,
)

TRIGGER = "std_srvs/srv/Trigger"


class TriggerRequest:
    def __init__(self) -> None:
        self.fields: dict[str, Any] = {}


class TriggerResponse:
    def __init__(self, success: bool = True, message: str = "done") -> None:
        self.success = success
        self.message = message


class Trigger:
    Request = TriggerRequest
    Response = TriggerResponse


class FakeFuture:
    def __init__(self, response: object | None) -> None:
        self._response = response
        self.cancelled = False

    def add_done_callback(self, callback) -> None:
        if self._response is not None:
            callback(self)

    def result(self) -> object:
        return self._response

    def cancel(self) -> None:
        self.cancelled = True


class FakeClient:
    def __init__(self, available: bool = True, response: object | None = None, call_error: Exception | None = None):
        self.available = available
        self.response = response
        self.call_error = call_error
        self.calls: list[object] = []
        self.removed: list[FakeFuture] = []

    def wait_for_service(self, timeout_sec: float) -> bool:
        return self.available

    def call_async(self, ros_request: object) -> FakeFuture:
        if self.call_error is not None:
            raise self.call_error
        self.calls.append(ros_request)
        return FakeFuture(self.response)

    def remove_pending_request(self, future: FakeFuture) -> None:
        self.removed.append(future)


class FakeNode:
    def __init__(self, client: FakeClient) -> None:
        self.client = client
        self.created: list[tuple[type, str]] = []

    def create_client(self, service_cls: type, service: str) -> FakeClient:
        self.created.append((service_cls, service))
        return self.client


@pytest.fixture
def fake_rosidl(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """rosidl with one service type; `state` lets a test change what the field setter and converter do."""
    state: dict[str, Any] = {"set_error": None, "fields": {}}
    utilities = types.ModuleType("rosidl_runtime_py.utilities")

    def get_service(service_type: str) -> type:
        if service_type != TRIGGER:
            raise ModuleNotFoundError(service_type)
        return Trigger

    utilities.get_service = get_service  # type: ignore[attr-defined]
    set_message = types.ModuleType("rosidl_runtime_py.set_message")

    def set_message_fields(message: TriggerRequest, payload: dict[str, Any]) -> None:
        if state["set_error"] is not None:
            raise state["set_error"]
        message.fields.update(payload)

    set_message.set_message_fields = set_message_fields  # type: ignore[attr-defined]
    convert = types.ModuleType("rosidl_runtime_py.convert")
    convert.message_to_ordereddict = lambda message, truncate_length=None: state["fields"]  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py", types.ModuleType("rosidl_runtime_py"))
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py.utilities", utilities)
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py.set_message", set_message)
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py.convert", convert)
    return state


def trigger(service: str = "/reset") -> RosServiceRequest:
    return RosServiceRequest(service=service, service_type=TRIGGER)


def test_a_service_nobody_offers_is_reported_by_name(fake_rosidl: dict[str, Any]) -> None:
    client = FakeClient(available=False)

    with pytest.raises(RuntimeError, match="Service /reset is not available."):
        RclpyRosServiceGateway(FakeNode(client), wait_for_service_sec=0.01).call(trigger())

    assert client.calls == []


def test_a_request_rclpy_cannot_send_is_an_invalid_request(fake_rosidl: dict[str, Any]) -> None:
    client = FakeClient(call_error=TypeError("field 'data' expects a bool"))

    with pytest.raises(ValueError, match="Invalid ROS service request: field 'data' expects a bool"):
        RclpyRosServiceGateway(FakeNode(client)).call(trigger())


def test_a_service_that_never_answers_times_out_and_forgets_the_request(fake_rosidl: dict[str, Any]) -> None:
    client = FakeClient(response=None)

    with pytest.raises(RuntimeError, match="Service /reset did not answer within 0.01s."):
        RclpyRosServiceGateway(FakeNode(client), response_timeout_sec=0.01).call(trigger())

    [forgotten] = client.removed
    assert forgotten.cancelled


def test_one_client_serves_repeated_calls_to_the_same_service(fake_rosidl: dict[str, Any]) -> None:
    client = FakeClient(response=TriggerResponse(True, "cleared"))
    node = FakeNode(client)
    gateway = RclpyRosServiceGateway(node)

    first = gateway.call(trigger())
    second = gateway.call(trigger())

    assert node.created == [(Trigger, "/reset")]
    assert (first.status, first.success, first.detail) == ("called", True, "cleared")
    assert second == first


def test_a_service_type_rosidl_does_not_know_is_refused_before_any_client_exists(
    fake_rosidl: dict[str, Any],
) -> None:
    node = FakeNode(FakeClient())

    with pytest.raises(ValueError, match="Unsupported ROS service type: lab_msgs/srv/Nope"):
        RclpyRosServiceGateway(node).call(RosServiceRequest(service="/x", service_type="lab_msgs/srv/Nope"))

    assert node.created == []


def test_without_rosidl_the_gateway_says_it_needs_it(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py", None)
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py.utilities", None)
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py.set_message", None)

    with pytest.raises(RuntimeError, match="rosidl_runtime_py is required to call ROS services"):
        RclpyRosServiceGateway(FakeNode(FakeClient())).call(trigger())
    with pytest.raises(RuntimeError, match="rosidl_runtime_py is required to call ROS services"):
        build_service_request(Trigger, {"data": True})


def test_an_empty_payload_needs_no_field_setter(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py.set_message", None)

    request = build_service_request(Trigger, {})

    assert isinstance(request, TriggerRequest)
    assert request.fields == {}


def test_payload_fields_are_set_on_the_request(fake_rosidl: dict[str, Any]) -> None:
    request = build_service_request(Trigger, {"data": True})

    assert request.fields == {"data": True}


def test_a_field_the_type_refuses_is_an_invalid_request(fake_rosidl: dict[str, Any]) -> None:
    fake_rosidl["set_error"] = AttributeError("'Request' object has no attribute 'nope'")

    with pytest.raises(ValueError, match="Invalid ROS service request: 'Request' object has no attribute 'nope'"):
        build_service_request(Trigger, {"nope": 1})


class EmptyResponse:
    """A response type with neither success nor message, such as std_srvs/srv/Empty."""


def test_a_response_without_fields_gets_the_generic_detail(fake_rosidl: dict[str, Any]) -> None:
    fake_rosidl["fields"] = {}

    receipt = receipt_from_response(RosServiceRequest("/clear", "std_srvs/srv/Empty"), EmptyResponse())

    assert receipt.success is None
    assert receipt.detail == "Service /clear answered."


def test_a_response_the_converter_cannot_read_still_reports_the_call(monkeypatch: pytest.MonkeyPatch) -> None:
    convert = types.ModuleType("rosidl_runtime_py.convert")

    def message_to_ordereddict(message: object, truncate_length: int | None = None) -> dict:
        raise AttributeError("not a message")

    convert.message_to_ordereddict = message_to_ordereddict  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py", types.ModuleType("rosidl_runtime_py"))
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py.convert", convert)

    receipt = receipt_from_response(RosServiceRequest("/clear", "std_srvs/srv/Empty"), EmptyResponse())

    assert receipt.status == "called"
    assert receipt.detail == "Service /clear answered."
