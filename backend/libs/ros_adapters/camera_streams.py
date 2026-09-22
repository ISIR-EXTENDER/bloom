"""Carry a ROS camera topic to the operator's screen.

Robin asked for a view from the gripper while driving. Bloom could already
preview a browser webcam, but nothing could show what a camera on the robot
sees, and the obvious route is closed: `rclpy_topic_streams` drops any field
over 8192 elements because converting one 480p frame on the shared executor
thread stalls `/ee_pose` and `/joint_states` while the arm is moving.

So images get their own path, the way `explorer_user_interfaces_web` does it
upstream: subscribe to the already-compressed topic, keep only the newest
frame, and hand the JPEG bytes straight to the browser. Nothing is decoded,
re-encoded or converted here. A frame the operator never sees is dropped
rather than queued, because a late frame is worse than no frame when it is
being used to judge where the gripper is.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

logger = logging.getLogger(__name__)

#: Matches the camera-frame publish path. A frame above this is not a camera frame.
MAX_FRAME_BYTES = 8 * 1024 * 1024

#: The only type on this path. Raw `Image` would put the conversion cost back on the backend.
COMPRESSED_IMAGE_TYPE = "sensor_msgs/msg/CompressedImage"


@dataclass(frozen=True)
class CameraStreamFrame:
    """One compressed frame, exactly as it arrived on the topic."""

    image_format: str
    image_bytes: bytes


CameraStreamFrameCallback = Callable[[CameraStreamFrame], None]


class CameraStreamHandle(Protocol):
    def close(self) -> None: ...


class CameraStreamGateway(Protocol):
    def subscribe(self, topic: str, on_frame: CameraStreamFrameCallback) -> CameraStreamHandle: ...


class RclpyCameraStreamHandle:
    def __init__(self, node: Any, subscription: Any) -> None:
        self._node = node
        self._subscription = subscription
        self._closed = False

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._node.destroy_subscription(self._subscription)


class RclpyCameraStreamGateway:
    """Subscribe to ``sensor_msgs/msg/CompressedImage`` through an existing rclpy node."""

    def __init__(self, node: Any, max_frame_bytes: int = MAX_FRAME_BYTES) -> None:
        self._node = node
        self._max_frame_bytes = max_frame_bytes

    def subscribe(self, topic: str, on_frame: CameraStreamFrameCallback) -> RclpyCameraStreamHandle:
        reported_oversize = False

        def on_ros_message(message: Any) -> None:
            nonlocal reported_oversize
            image_bytes = bytes(getattr(message, "data", b""))
            if len(image_bytes) > self._max_frame_bytes:
                if not reported_oversize:
                    reported_oversize = True
                    logger.warning(
                        "Not streaming %s: a frame carries %d bytes, over the %d byte cap.",
                        topic,
                        len(image_bytes),
                        self._max_frame_bytes,
                    )
                return
            on_frame(
                CameraStreamFrame(
                    image_format=str(getattr(message, "format", "") or "jpeg"),
                    image_bytes=image_bytes,
                )
            )

        subscription = self._node.create_subscription(
            self._get_compressed_image_class(),
            topic,
            on_ros_message,
            self._sensor_data_qos(),
        )
        return RclpyCameraStreamHandle(self._node, subscription)

    @staticmethod
    def _sensor_data_qos() -> Any:
        # Camera drivers publish best effort. A reliable subscriber matches none of them and sees nothing.
        try:
            from rclpy.qos import qos_profile_sensor_data
        except ModuleNotFoundError as exc:
            raise RuntimeError("rclpy is required to stream camera frames") from exc
        return qos_profile_sensor_data

    @staticmethod
    def _get_compressed_image_class() -> type:
        try:
            from sensor_msgs.msg import CompressedImage
        except ModuleNotFoundError as exc:
            raise RuntimeError("sensor_msgs is required to stream camera frames") from exc
        return CompressedImage


class NoopCameraStreamHandle:
    def close(self) -> None:
        return None


class NoopCameraStreamGateway:
    """Safe default when no ROS node is attached: the socket opens and says so."""

    def subscribe(self, topic: str, on_frame: CameraStreamFrameCallback) -> NoopCameraStreamHandle:
        return NoopCameraStreamHandle()


__all__ = [
    "COMPRESSED_IMAGE_TYPE",
    "MAX_FRAME_BYTES",
    "CameraStreamFrame",
    "CameraStreamFrameCallback",
    "CameraStreamGateway",
    "CameraStreamHandle",
    "NoopCameraStreamGateway",
    "NoopCameraStreamHandle",
    "RclpyCameraStreamGateway",
    "RclpyCameraStreamHandle",
]
