"""Set and read ROS 2 node parameters over the standard parameter services.

The seam the control stack exposes for live tuning: cartesian_manager rereads
its parameters every tick, so shapers.snake.gain or the rate limiter change
without a restart, and apps-petanque's throw node carries alpha and the
trajectory shape the same way. Bloom names each settable parameter in an
allowlist; nothing else is reachable.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Any, Literal, Protocol

RosParameterValue = bool | int | float | str
RosParameterSetStatus = Literal["set", "simulated"]


@dataclass(frozen=True)
class RosParameterRequest:
    node: str
    name: str
    value: RosParameterValue


@dataclass(frozen=True)
class RosParameterReceipt:
    node: str
    name: str
    value: RosParameterValue
    status: RosParameterSetStatus
    detail: str


@dataclass(frozen=True)
class RosParameterReading:
    node: str
    name: str
    #: None when the node does not declare the parameter.
    value: RosParameterValue | None


class RosParameterGateway(Protocol):
    def set(self, request: RosParameterRequest) -> RosParameterReceipt:
        raise NotImplementedError

    def get(self, node: str, names: tuple[str, ...]) -> tuple[RosParameterReading, ...]:
        raise NotImplementedError


class NoopRosParameterGateway:
    """Safe default for environments where ROS is not attached to Bloom."""

    def set(self, request: RosParameterRequest) -> RosParameterReceipt:
        return RosParameterReceipt(
            node=request.node,
            name=request.name,
            value=request.value,
            status="simulated",
            detail="ROS parameter gateway is not configured.",
        )

    def get(self, node: str, names: tuple[str, ...]) -> tuple[RosParameterReading, ...]:
        return tuple(RosParameterReading(node=node, name=name, value=None) for name in names)


class RclpyRosParameterGateway:
    def __init__(self, node: Any, wait_for_service_sec: float = 1.0, response_timeout_sec: float = 3.0) -> None:
        self._node = node
        self._wait_for_service_sec = wait_for_service_sec
        self._response_timeout_sec = response_timeout_sec
        self._clients: dict[tuple[str, str], Any] = {}

    def set(self, request: RosParameterRequest) -> RosParameterReceipt:
        from rcl_interfaces.msg import Parameter
        from rcl_interfaces.srv import SetParameters
        from rclpy.parameter import Parameter as RclpyParameter

        client = self._client(request.node, "set_parameters", SetParameters)
        message = SetParameters.Request()
        message.parameters = [
            Parameter(name=request.name, value=RclpyParameter(request.name, value=request.value).get_parameter_value())
        ]
        response = self._call(client, message, request.node)
        [result] = response.results
        if not result.successful:
            raise RuntimeError(result.reason or f"{request.node} refused {request.name}.")
        return RosParameterReceipt(
            node=request.node, name=request.name, value=request.value, status="set", detail="Parameter set."
        )

    def get(self, node: str, names: tuple[str, ...]) -> tuple[RosParameterReading, ...]:
        from rcl_interfaces.srv import GetParameters
        from rclpy.parameter import parameter_value_to_python

        client = self._client(node, "get_parameters", GetParameters)
        message = GetParameters.Request()
        message.names = list(names)
        response = self._call(client, message, node)
        readings = []
        for name, value in zip(names, response.values, strict=True):
            python_value = parameter_value_to_python(value)
            readings.append(
                RosParameterReading(
                    node=node,
                    name=name,
                    value=python_value if isinstance(python_value, bool | int | float | str) else None,
                )
            )
        return tuple(readings)

    def _client(self, node: str, service: str, service_cls: Any) -> Any:
        key = (node, service)
        client = self._clients.get(key)
        if client is None:
            client = self._node.create_client(service_cls, f"{node}/{service}")
            self._clients[key] = client
        return client

    def _call(self, client: Any, message: Any, node: str) -> Any:
        if not client.wait_for_service(timeout_sec=self._wait_for_service_sec):
            raise RuntimeError(f"Node {node} does not offer its parameter services.")
        future = client.call_async(message)
        done = threading.Event()
        future.add_done_callback(lambda _: done.set())
        # The response arrives on the node's own spin thread.
        if not done.wait(self._response_timeout_sec):
            raise RuntimeError(f"Node {node} did not answer within {self._response_timeout_sec}s.")
        return future.result()
