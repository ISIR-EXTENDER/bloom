"""Publish Bloom runtime teleop as ``cartesian_manager`` Cartesian commands.

``cartesian_manager`` replaced ``sandbox_controller`` as the Extender control
layer. It expects ``geometry_msgs/msg/TwistStamped`` on an input topic, by
default ``/joystick_cartesian_command``, rather than the Extender-specific
``extender_msgs/msg/TeleopCommand`` on ``/teleop_cmd``.

The frame matters more than anything else here. ``cartesian_manager`` performs
no TF conversion: a command whose ``header.frame_id`` is neither empty nor the
manager's configured ``default_input_frame_id`` is dropped, and the robot
silently stops. Every command is therefore stamped with a configured frame.

The manager also *sums* all activated inputs rather than arbitrating between
them, so a Bloom twist adds to whatever a joystick or visual servoing is doing.
Runtime clients must keep sending zeros on release.
"""

from __future__ import annotations

from typing import Any

from libs.sessions import TeleopCommand, TeleopPublishReceipt

DEFAULT_COMMAND_FRAME_ID = "base_link"


class RclpyCartesianManagerGateway:
    """Publish runtime teleop commands as stamped Cartesian velocities."""

    def __init__(
        self,
        node: Any,
        qos_profile: int = 10,
        flush_after_publish: bool = True,
        command_frame_id: str = DEFAULT_COMMAND_FRAME_ID,
    ) -> None:
        self._node = node
        self._qos_profile = qos_profile
        self._flush_after_publish = flush_after_publish
        self._command_frame_id = command_frame_id.strip()
        self._publishers: dict[str, Any] = {}

    @property
    def command_frame_id(self) -> str:
        return self._command_frame_id

    def publish(self, command: TeleopCommand) -> TeleopPublishReceipt:
        publisher = self._ensure_publisher(command.target)
        publisher.publish(self._to_ros_message(command))
        if self._flush_after_publish:
            self._flush_once()
        return TeleopPublishReceipt(
            detail=f"Cartesian command published in frame '{self._command_frame_id or '<manager default>'}'.",
            status="accepted",
            target=command.target,
        )

    def _ensure_publisher(self, target: str) -> Any:
        publisher = self._publishers.get(target)
        if publisher is not None:
            return publisher

        publisher = self._node.create_publisher(
            self._get_twist_stamped_message_class(), target, self._qos_profile
        )
        self._publishers[target] = publisher
        return publisher

    def _flush_once(self) -> None:
        try:
            import rclpy
        except ModuleNotFoundError as exc:
            raise RuntimeError("rclpy is required to publish Cartesian commands") from exc

        rclpy.spin_once(self._node, timeout_sec=0.05)

    def _to_ros_message(self, command: TeleopCommand) -> Any:
        message_cls = self._get_twist_stamped_message_class()
        message = message_cls()
        message.header.stamp = self._now_msg()
        message.header.frame_id = self._command_frame_id
        message.twist.linear.x = float(command.linear.x)
        message.twist.linear.y = float(command.linear.y)
        message.twist.linear.z = float(command.linear.z)
        message.twist.angular.x = float(command.angular.x)
        message.twist.angular.y = float(command.angular.y)
        message.twist.angular.z = float(command.angular.z)
        return message

    def _now_msg(self) -> Any:
        get_clock = getattr(self._node, "get_clock", None)
        if get_clock is None:
            return self._get_time_message_class()()
        return get_clock().now().to_msg()

    @staticmethod
    def _get_twist_stamped_message_class() -> type:
        try:
            from geometry_msgs.msg import TwistStamped
        except ModuleNotFoundError as exc:
            raise RuntimeError("geometry_msgs is required to publish Cartesian commands") from exc
        return TwistStamped

    @staticmethod
    def _get_time_message_class() -> type:
        try:
            from builtin_interfaces.msg import Time
        except ModuleNotFoundError as exc:
            raise RuntimeError("builtin_interfaces is required to stamp Cartesian commands") from exc
        return Time


__all__ = ["DEFAULT_COMMAND_FRAME_ID", "RclpyCartesianManagerGateway"]
