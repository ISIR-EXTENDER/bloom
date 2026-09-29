"""The tip's measured pose, from TF: robot_state_publisher turns the measured /joint_states into transforms.

qontrol's /ee_pose is the pose it commands, which is not where an arm in contact or lagging behind actually is.
"""

from __future__ import annotations

import logging
from typing import Any

from libs.sessions.positions import CartesianPose, PositionLibraryError

logger = logging.getLogger(__name__)


class RclpyTipPoseSource:
    def __init__(self, node: Any) -> None:
        from tf2_ros import Buffer, TransformListener

        self._buffer = Buffer()
        self._listener = TransformListener(self._buffer, node, spin_thread=False)

    def lookup(self, base_frame: str, tip_frame: str) -> CartesianPose | None:
        """The newest transform; its freshness is the caller's to judge from the joint states behind it."""
        from rclpy.time import Time

        try:
            transform = self._buffer.lookup_transform(base_frame, tip_frame, Time())
        except Exception:  # noqa: BLE001 - no tree yet, or a frame it does not have
            return None
        translation = transform.transform.translation
        rotation = transform.transform.rotation
        try:
            return CartesianPose(
                frame_id=base_frame,
                position=(translation.x, translation.y, translation.z),
                orientation=(rotation.x, rotation.y, rotation.z, rotation.w),
            )
        except PositionLibraryError:
            return None


__all__ = ["RclpyTipPoseSource"]
