from __future__ import annotations

import threading
from collections import OrderedDict
from typing import Any

from libs.ros_adapters.messages import resolve_message_class
from libs.ros_adapters.publishers import RosPublishReceipt, RosPublishRequest

#: The `/ui/` namespace accepts any name under it, so the cache is bounded: each entry is a DDS publisher.
MAX_CACHED_PUBLISHERS = 128
#: Never evicted: STOP publishes on these, and a recreated publisher can lose its first message to discovery.
PINNED_TOPICS = frozenset({"/mode_request", "/joint_target_command", "/ui/visual_servoing/on"})


class RclpyRosPublisherGateway:
    """Publish arbitrary ROS messages through an existing rclpy node.

    Imports stay inside this adapter so the Bloom backend can run and test without
    ROS installed. This mirrors the useful typed-publisher behavior from
    tablet_interface while keeping ROS as an optional runtime boundary.
    """

    def __init__(self, node: Any, qos_profile: int = 10) -> None:
        self._node = node
        self._qos_profile = qos_profile
        self._publishers: OrderedDict[tuple[str, str], Any] = OrderedDict()
        self._publishers_lock = threading.Lock()
        self._message_classes: dict[str, type] = {}

    def publish(self, request: RosPublishRequest) -> RosPublishReceipt:
        message_cls = self._get_message_class(request.message_type)
        message = message_cls()
        self._set_message_fields(message, request.payload)
        # Under the lock that evicts: another thread must not destroy this publisher mid-publish.
        with self._publishers_lock:
            self._ensure_publisher(request.topic, request.message_type, message_cls).publish(message)
        return RosPublishReceipt(
            topic=request.topic,
            message_type=request.message_type,
            status="published",
            detail="ROS message published.",
        )

    def _get_message_class(self, message_type: str) -> type:
        return resolve_message_class(message_type, self._message_classes, "publish ROS messages")

    def _ensure_publisher(self, topic: str, message_type: str, message_cls: type) -> Any:
        """Called with the publishers lock held."""
        cache_key = (topic, message_type)
        publisher = self._publishers.get(cache_key)
        if publisher is not None:
            self._publishers.move_to_end(cache_key)
            return publisher
        publisher = self._node.create_publisher(message_cls, topic, self._qos_profile)
        self._publishers[cache_key] = publisher
        evictable = [key for key in self._publishers if key[0] not in PINNED_TOPICS and key != cache_key]
        while len(self._publishers) > MAX_CACHED_PUBLISHERS and evictable:
            self._node.destroy_publisher(self._publishers.pop(evictable.pop(0)))
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
