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

from libs.ros_adapters.qos import AdaptiveSubscription, QosChoice, build_qos_profile

logger = logging.getLogger(__name__)

#: Matches the camera-frame publish path. A frame above this is not a camera frame.
MAX_FRAME_BYTES = 8 * 1024 * 1024

#: Same depth as ``qos_profile_sensor_data``.
CAMERA_QOS_DEPTH = 5

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
    def __init__(self, subscription: AdaptiveSubscription) -> None:
        self._subscription = subscription

    def close(self) -> None:
        self._subscription.close()


class RclpyCameraStreamGateway:
    """Subscribe to ``sensor_msgs/msg/CompressedImage`` through an existing rclpy node."""

    def __init__(
        self,
        node: Any,
        max_frame_bytes: int = MAX_FRAME_BYTES,
        qos_factory: Callable[[QosChoice], Any] = build_qos_profile,
    ) -> None:
        self._node = node
        self._max_frame_bytes = max_frame_bytes
        self._qos_factory = qos_factory

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

        # Always best effort: a late frame is worse than none, and it still matches reliable drivers.
        subscription = AdaptiveSubscription(
            self._node,
            self._get_compressed_image_class(),
            topic,
            on_ros_message,
            CAMERA_QOS_DEPTH,
            best_effort_only=True,
            qos_factory=self._qos_factory,
        )
        return RclpyCameraStreamHandle(subscription)

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
