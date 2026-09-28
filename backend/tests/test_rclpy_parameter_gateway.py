"""The rclpy parameter gateway, against fake rcl_interfaces and rclpy modules so it runs without ROS."""

from __future__ import annotations

import sys
import types
from types import SimpleNamespace

import pytest

from libs.ros_adapters.parameters import RclpyRosParameterGateway, RosParameterRequest

INTEGER, DOUBLE = 2, 3


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
    def __init__(self, node: FakeNode, service: str) -> None:
        self._node = node
        self._service = service
        self.removed: list[FakeFuture] = []

    def wait_for_service(self, timeout_sec: float) -> bool:
        return True

    def call_async(self, message: SimpleNamespace) -> FakeFuture:
        return FakeFuture(self._node.answer(self._service, message))

    def remove_pending_request(self, future: FakeFuture) -> None:
        self.removed.append(future)


class FakeNode:
    """A node declaring `gain` as DOUBLE; like rclcpp, it refuses a value of another type."""

    def __init__(self, declared_type: int = DOUBLE, silent: bool = False) -> None:
        self.declared_type = declared_type
        self.silent = silent
        self.set_values: list[SimpleNamespace] = []
        self.clients: dict[str, FakeClient] = {}

    def create_client(self, _service_cls, service: str) -> FakeClient:
        self.clients[service] = FakeClient(self, service)
        return self.clients[service]

    def answer(self, service: str, message: SimpleNamespace) -> object | None:
        if self.silent:
            return None
        if service.endswith("get_parameters"):
            return SimpleNamespace(values=[SimpleNamespace(type=self.declared_type)])
        [parameter] = message.parameters
        self.set_values.append(parameter.value)
        ok = parameter.value.type == self.declared_type
        return SimpleNamespace(results=[SimpleNamespace(successful=ok, reason="" if ok else "Wrong parameter type")])


@pytest.fixture(autouse=True)
def fake_ros(monkeypatch: pytest.MonkeyPatch) -> None:
    def request_class() -> type:
        return type("Request", (), {})

    msg = types.ModuleType("rcl_interfaces.msg")
    msg.Parameter = lambda name, value: SimpleNamespace(name=name, value=value)  # type: ignore[attr-defined]
    msg.ParameterType = SimpleNamespace(PARAMETER_INTEGER=INTEGER, PARAMETER_DOUBLE=DOUBLE)  # type: ignore[attr-defined]
    srv = types.ModuleType("rcl_interfaces.srv")
    srv.SetParameters = SimpleNamespace(Request=request_class())  # type: ignore[attr-defined]
    srv.GetParameters = SimpleNamespace(Request=request_class())  # type: ignore[attr-defined]

    class RclpyParameter:
        def __init__(self, name: str, value: object) -> None:
            self.value = value

        def get_parameter_value(self) -> SimpleNamespace:
            kind = DOUBLE if isinstance(self.value, float) else INTEGER
            return SimpleNamespace(type=kind, value=self.value)

    parameter = types.ModuleType("rclpy.parameter")
    parameter.Parameter = RclpyParameter  # type: ignore[attr-defined]
    parameter.parameter_value_to_python = lambda value: value.value  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "rcl_interfaces", types.ModuleType("rcl_interfaces"))
    monkeypatch.setitem(sys.modules, "rcl_interfaces.msg", msg)
    monkeypatch.setitem(sys.modules, "rcl_interfaces.srv", srv)
    monkeypatch.setitem(sys.modules, "rclpy", types.ModuleType("rclpy"))
    monkeypatch.setitem(sys.modules, "rclpy.parameter", parameter)


def test_a_whole_number_on_a_double_parameter_is_sent_as_a_double() -> None:
    node = FakeNode(DOUBLE)
    gateway = RclpyRosParameterGateway(node)

    receipt = gateway.set(RosParameterRequest(node="/cartesian_manager", name="shapers.snake.gain", value=2))

    assert receipt.status == "set"
    assert receipt.value == 2.0 and isinstance(receipt.value, float)
    assert [(v.type, v.value) for v in node.set_values] == [(DOUBLE, 2.0)]


def test_an_integer_parameter_still_gets_an_integer() -> None:
    node = FakeNode(INTEGER)
    gateway = RclpyRosParameterGateway(node)

    gateway.set(RosParameterRequest(node="/n", name="count", value=3))

    assert [(v.type, v.value) for v in node.set_values] == [(INTEGER, 3)]


def test_a_timed_out_call_is_removed_from_the_client() -> None:
    node = FakeNode(silent=True)
    gateway = RclpyRosParameterGateway(node, response_timeout_sec=0.01)

    with pytest.raises(RuntimeError, match="did not answer"):
        gateway.get("/n", ("gain",))

    [removed] = node.clients["/n/get_parameters"].removed
    assert removed.cancelled
