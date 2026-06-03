from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from libs.sessions import RuntimeTopicSample, RuntimeTopicSampleCallback, RuntimeTopicSubscription


class RclpyRuntimeTopicSubscriptionHandle:
    def __init__(self, node: Any, subscription: Any) -> None:
        self._node = node
        self._subscription = subscription
        self._closed = False

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._node.destroy_subscription(self._subscription)


class RclpyRuntimeTopicSubscriptionGateway:
    """Stream ROS topic samples through an existing rclpy node."""

    def __init__(self, node: Any, qos_profile: int = 10) -> None:
        self._node = node
        self._qos_profile = qos_profile
        self._message_classes: dict[str, type] = {}

    def subscribe(
        self,
        subscription: RuntimeTopicSubscription,
        on_sample: RuntimeTopicSampleCallback,
    ) -> RclpyRuntimeTopicSubscriptionHandle:
        message_type = subscription.message_type or self._resolve_topic_message_type(subscription.topic)
        message_cls = self._get_message_class(message_type)

        def on_ros_message(message: Any) -> None:
            on_sample(
                RuntimeTopicSample(
                    message_type=message_type,
                    topic=subscription.topic,
                    value=to_jsonable_ros_message(message),
                )
            )

        ros_subscription = self._node.create_subscription(
            message_cls,
            subscription.topic,
            on_ros_message,
            self._qos_profile,
        )
        return RclpyRuntimeTopicSubscriptionHandle(self._node, ros_subscription)

    def _resolve_topic_message_type(self, topic: str) -> str:
        for topic_name, message_types in self._node.get_topic_names_and_types():
            if topic_name == topic and message_types:
                return message_types[0]
        raise RuntimeError(f"Cannot subscribe to {topic}: message type is required or topic is not available.")

    def _get_message_class(self, message_type: str) -> type:
        message_cls = self._message_classes.get(message_type)
        if message_cls is not None:
            return message_cls

        try:
            from rosidl_runtime_py.utilities import get_message
        except ModuleNotFoundError as exc:
            raise RuntimeError("rosidl_runtime_py is required to subscribe to ROS topics") from exc

        try:
            message_cls = get_message(message_type)
        except (AttributeError, ModuleNotFoundError, ValueError) as exc:
            raise ValueError(f"Unsupported ROS message type: {message_type}") from exc

        self._message_classes[message_type] = message_cls
        return message_cls


def to_jsonable_ros_message(message: Any) -> Any:
    try:
        from rosidl_runtime_py.convert import message_to_ordereddict
    except ModuleNotFoundError as exc:
        raise RuntimeError("rosidl_runtime_py is required to serialize ROS topic messages") from exc

    return to_jsonable_value(message_to_ordereddict(message))


def to_jsonable_value(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): to_jsonable_value(item) for key, item in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [to_jsonable_value(item) for item in value]
    return value
