"""Trigger-style ROS service calls (empty request, success/message response).

Built for /fault_controller/reset_fault on the Kinova gen3; request payloads
are deliberately not supported yet.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Any, Literal, Protocol

RosServiceCallStatus = Literal["called", "simulated"]


@dataclass(frozen=True)
class RosServiceRequest:
    service: str
    service_type: str


@dataclass(frozen=True)
class RosServiceReceipt:
    service: str
    service_type: str
    status: RosServiceCallStatus
    #: The response's ``success`` field, or None when the type has none.
    success: bool | None
    detail: str


class RosServiceGateway(Protocol):
    def call(self, request: RosServiceRequest) -> RosServiceReceipt:
        raise NotImplementedError


class NoopRosServiceGateway:
    """Safe default for environments where ROS is not attached to Bloom."""

    def call(self, request: RosServiceRequest) -> RosServiceReceipt:
        return RosServiceReceipt(
            service=request.service,
            service_type=request.service_type,
            status="simulated",
            success=None,
            detail="ROS service gateway is not configured.",
        )


class RclpyRosServiceGateway:
    def __init__(
        self,
        node: Any,
        wait_for_service_sec: float = 1.0,
        response_timeout_sec: float = 3.0,
    ) -> None:
        self._node = node
        self._wait_for_service_sec = wait_for_service_sec
        self._response_timeout_sec = response_timeout_sec
        self._clients: dict[tuple[str, str], Any] = {}

    def call(self, request: RosServiceRequest) -> RosServiceReceipt:
        service_cls = self._get_service_class(request.service_type)
        client = self._ensure_client(request, service_cls)

        if not client.wait_for_service(timeout_sec=self._wait_for_service_sec):
            raise RuntimeError(f"Service {request.service} is not available.")

        future = client.call_async(service_cls.Request())
        done = threading.Event()
        future.add_done_callback(lambda _: done.set())
        # The response arrives on the node's own spin thread.
        if not done.wait(self._response_timeout_sec):
            raise RuntimeError(f"Service {request.service} did not answer within {self._response_timeout_sec}s.")

        response = future.result()
        success = getattr(response, "success", None)
        message = str(getattr(response, "message", "")).strip()
        return RosServiceReceipt(
            service=request.service,
            service_type=request.service_type,
            status="called",
            success=bool(success) if success is not None else None,
            detail=message or f"Service {request.service} answered.",
        )

    def _ensure_client(self, request: RosServiceRequest, service_cls: type) -> Any:
        key = (request.service, request.service_type)
        client = self._clients.get(key)
        if client is None:
            client = self._node.create_client(service_cls, request.service)
            self._clients[key] = client
        return client

    @staticmethod
    def _get_service_class(service_type: str) -> type:
        try:
            from rosidl_runtime_py.utilities import get_service
        except ModuleNotFoundError as exc:
            raise RuntimeError("rosidl_runtime_py is required to call ROS services") from exc

        try:
            return get_service(service_type)
        except (AttributeError, ModuleNotFoundError, ValueError) as exc:
            raise ValueError(f"Unsupported ROS service type: {service_type}") from exc


__all__ = [
    "NoopRosServiceGateway",
    "RclpyRosServiceGateway",
    "RosServiceCallStatus",
    "RosServiceGateway",
    "RosServiceReceipt",
    "RosServiceRequest",
]
