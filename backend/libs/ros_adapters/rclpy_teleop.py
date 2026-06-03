from __future__ import annotations

from typing import Any

from libs.sessions import TeleopCommand, TeleopPublishReceipt


class RclpyTeleopCommandGateway:
    """Publish Bloom runtime teleop commands as Extender TeleopCommand messages."""

    def __init__(self, node: Any, qos_profile: int = 10, flush_after_publish: bool = True) -> None:
        self._node = node
        self._qos_profile = qos_profile
        self._flush_after_publish = flush_after_publish
        self._publishers: dict[str, Any] = {}

    def publish(self, command: TeleopCommand) -> TeleopPublishReceipt:
        publisher = self._ensure_publisher(command.target)
        message = self._to_ros_message(command)
        publisher.publish(message)
        if self._flush_after_publish:
            self._flush_once()
        return TeleopPublishReceipt(
            detail="Teleop command published.",
            status="accepted",
            target=command.target,
        )

    def _ensure_publisher(self, target: str) -> Any:
        publisher = self._publishers.get(target)
        if publisher is not None:
            return publisher

        message_cls = self._get_teleop_message_class()
        publisher = self._node.create_publisher(message_cls, target, self._qos_profile)
        self._publishers[target] = publisher
        return publisher

    def _flush_once(self) -> None:
        try:
            import rclpy
        except ModuleNotFoundError as exc:
            raise RuntimeError("rclpy is required to publish teleop commands") from exc

        rclpy.spin_once(self._node, timeout_sec=0.05)

    @staticmethod
    def _to_ros_message(command: TeleopCommand) -> Any:
        message_cls = RclpyTeleopCommandGateway._get_teleop_message_class()
        twist_cls = RclpyTeleopCommandGateway._get_twist_message_class()
        message = message_cls()
        twist = twist_cls()

        twist.linear.x = command.linear.x
        twist.linear.y = command.linear.y
        twist.linear.z = command.linear.z
        twist.angular.x = command.angular.x
        twist.angular.y = command.angular.y
        twist.angular.z = command.angular.z
        message.twist = twist
        message.mode = command.mode
        return message

    @staticmethod
    def _get_teleop_message_class() -> type:
        try:
            from extender_msgs.msg import TeleopCommand as RosTeleopCommand
        except ModuleNotFoundError as exc:
            raise RuntimeError("extender_msgs is required to publish teleop commands") from exc
        return RosTeleopCommand

    @staticmethod
    def _get_twist_message_class() -> type:
        try:
            from geometry_msgs.msg import Twist
        except ModuleNotFoundError as exc:
            raise RuntimeError("geometry_msgs is required to publish teleop commands") from exc
        return Twist
