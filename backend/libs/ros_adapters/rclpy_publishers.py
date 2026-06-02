from __future__ import annotations

from typing import Any

from libs.ros_adapters.publishers import RosPublishReceipt, RosPublishRequest


class RclpyRosPublisherGateway:
    """Publish arbitrary ROS messages through an existing rclpy node.

    Imports stay inside this adapter so the Bloom backend can run and test without
    ROS installed. This mirrors the useful typed-publisher behavior from
    tablet_interface while keeping ROS as an optional runtime boundary.
    """

    def __init__(self, node: Any, qos_profile: int = 10) -> None:
        self._node = node
        self._qos_profile = qos_profile
        self._publishers: dict[tuple[str, str], Any] = {}
        self._message_classes: dict[str, type] = {}

    def publish(self, request: RosPublishRequest) -> RosPublishReceipt:
        message_cls = self._get_message_class(request.message_type)
        publisher = self._ensure_publisher(request.topic, request.message_type, message_cls)
        message = message_cls()
        self._set_message_fields(message, request.payload)
        publisher.publish(message)
        return RosPublishReceipt(
            topic=request.topic,
            message_type=request.message_type,
            status="published",
            detail="ROS message published.",
        )

    def _get_message_class(self, message_type: str) -> type:
        message_cls = self._message_classes.get(message_type)
        if message_cls is not None:
            return message_cls

        try:
            from rosidl_runtime_py.utilities import get_message
        except ModuleNotFoundError as exc:
            raise RuntimeError("rosidl_runtime_py is required to publish ROS messages") from exc

        try:
            message_cls = get_message(message_type)
        except (AttributeError, ModuleNotFoundError, ValueError) as exc:
            raise ValueError(f"Unsupported ROS message type: {message_type}") from exc

        self._message_classes[message_type] = message_cls
        return message_cls

    def _ensure_publisher(self, topic: str, message_type: str, message_cls: type) -> Any:
        cache_key = (topic, message_type)
        publisher = self._publishers.get(cache_key)
        if publisher is None:
            publisher = self._node.create_publisher(message_cls, topic, self._qos_profile)
            self._publishers[cache_key] = publisher
        return publisher

    @staticmethod
    def _set_message_fields(message: Any, payload: dict[str, Any]) -> None:
        try:
            from rosidl_runtime_py.set_message import set_message_fields
        except ModuleNotFoundError as exc:
            raise RuntimeError("rosidl_runtime_py is required to publish ROS messages") from exc

        try:
            set_message_fields(message, payload)
        except (AttributeError, TypeError, ValueError) as exc:
            raise ValueError(f"Invalid ROS message payload: {exc}") from exc
