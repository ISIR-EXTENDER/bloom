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
        frame_id = command.frame_id or self._command_frame_id
        return TeleopPublishReceipt(
            detail=f"Cartesian command published in frame '{frame_id or '<manager default>'}'.",
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
        # Left at zero on purpose. cartesian_manager treats a zero stamp as
        # "use my own clock" (stampSec, ros/cartesian_manager.cpp), and its
        # freshness test is `now - stamp <= timeout` with a 0.2s joystick
        # timeout. Stamping with Bloom's clock means that difference goes
        # negative whenever this process runs ahead of the robot's clock, so the
        # command never expires and the manager's fail-to-zero -- the one
        # safety property this chain actually has -- is silently defeated.
        # Staleness belongs to the node that owns the timeout.
        message.header.frame_id = command.frame_id or self._command_frame_id
        # Unit scale, like joystick_mapper's axes: the manager sums inputs and
        # normalizes the total, so an oversized Bloom axis would not go faster,
        # it would drown the other sources in the sum.
        message.twist.linear.x = _unit(command.linear.x)
        message.twist.linear.y = _unit(command.linear.y)
        message.twist.linear.z = _unit(command.linear.z)
        message.twist.angular.x = _unit(command.angular.x)
        message.twist.angular.y = _unit(command.angular.y)
        message.twist.angular.z = _unit(command.angular.z)
        return message

    @staticmethod
    def _get_twist_stamped_message_class() -> type:
        try:
            from geometry_msgs.msg import TwistStamped
        except ModuleNotFoundError as exc:
            raise RuntimeError("geometry_msgs is required to publish Cartesian commands") from exc
        return TwistStamped


def _unit(value: float) -> float:
    return max(-1.0, min(1.0, float(value)))


__all__ = ["DEFAULT_COMMAND_FRAME_ID", "RclpyCartesianManagerGateway"]
