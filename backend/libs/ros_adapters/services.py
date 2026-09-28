"""ROS service calls with a request payload of any allowlisted service type."""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

from libs.ros_adapters.parameters import forget_pending_request

RosServiceCallStatus = Literal["called", "simulated"]
#: A serialized response past this is cut, so a large answer cannot flood the detail or the audit log.
MAX_RESPONSE_DETAIL_CHARS = 512


@dataclass(frozen=True)
class RosServiceRequest:
    service: str
    service_type: str
    #: Request fields, already validated against the Request type by the runtime policy.
    payload: dict[str, Any] = field(default_factory=dict)


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
        ros_request = build_service_request(service_cls, request.payload)
        client = self._ensure_client(request, service_cls)

        if not client.wait_for_service(timeout_sec=self._wait_for_service_sec):
            raise RuntimeError(f"Service {request.service} is not available.")

        try:
            future = client.call_async(ros_request)
        # rclpy raises SystemError converting a field C cannot hold.
        except (AssertionError, OverflowError, SystemError, TypeError) as exc:
            raise ValueError(f"Invalid ROS service request: {exc}") from exc
        done = threading.Event()
        future.add_done_callback(lambda _: done.set())
        # The response arrives on the node's own spin thread.
        if not done.wait(self._response_timeout_sec):
            forget_pending_request(client, future)
            raise RuntimeError(f"Service {request.service} did not answer within {self._response_timeout_sec}s.")

        return receipt_from_response(request, future.result())

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


def build_service_request(service_cls: Any, payload: dict[str, Any]) -> Any:
    ros_request = service_cls.Request()
    if not payload:
        return ros_request
    try:
        from rosidl_runtime_py.set_message import set_message_fields
    except ModuleNotFoundError as exc:
        raise RuntimeError("rosidl_runtime_py is required to call ROS services") from exc
    try:
        set_message_fields(ros_request, payload)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Invalid ROS service request: {exc}") from exc
    return ros_request


def receipt_from_response(request: RosServiceRequest, response: Any) -> RosServiceReceipt:
    success = getattr(response, "success", None)
    message = str(getattr(response, "message", "")).strip()
    if success is None and not hasattr(response, "message"):
        serialized = serialize_response(response)
        detail = f"Service {request.service} answered: {serialized}" if serialized else ""
    else:
        detail = message
    return RosServiceReceipt(
        service=request.service,
        service_type=request.service_type,
        status="called",
        success=bool(success) if success is not None else None,
        detail=detail or f"Service {request.service} answered.",
    )


def serialize_response(response: Any) -> str:
    """Compact JSON of the response fields, cut to MAX_RESPONSE_DETAIL_CHARS; empty for a type with none."""
    try:
        from rosidl_runtime_py.convert import message_to_ordereddict

        fields = message_to_ordereddict(response, truncate_length=64)
    except Exception:  # noqa: BLE001
        return ""
    if not fields:
        return ""
    text = json.dumps(fields, default=str, separators=(", ", ": "))
    return text if len(text) <= MAX_RESPONSE_DETAIL_CHARS else text[: MAX_RESPONSE_DETAIL_CHARS - 1] + "…"


__all__ = [
    "MAX_RESPONSE_DETAIL_CHARS",
    "NoopRosServiceGateway",
    "RclpyRosServiceGateway",
    "RosServiceCallStatus",
    "RosServiceGateway",
    "RosServiceReceipt",
    "RosServiceRequest",
    "build_service_request",
    "receipt_from_response",
]
