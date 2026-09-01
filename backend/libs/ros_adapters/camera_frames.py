"""Turn a browser camera frame into a ROS compressed image.

Bloom's camera widgets capture frames in the browser as ``data:`` URLs. Getting
those onto a ROS topic is the last piece of `tablet_interface` parity that Bloom
was missing: it could preview a webcam, but nothing downstream could see it.

The decoding rules match `tablet_interface/measure_codec.py`, which is the
reference implementation on the ROS side, so a frame published by either client
lands on the topic in the same shape.

Frames are large and operator-triggered, so this path is deliberately strict:
a size cap, an allowlist of formats, and validated base64. A malformed or
oversized frame is rejected before it reaches ROS rather than after.
"""

from __future__ import annotations

import base64
import binascii
from dataclasses import dataclass
from typing import Any

#: Formats a browser canvas actually produces.
SUPPORTED_IMAGE_FORMATS = ("jpeg", "png", "webp")

#: 8 MB. A 1080p JPEG frame is far below this; anything above is not a camera
#: frame and should not be spending backend memory or ROS bandwidth.
MAX_IMAGE_BYTES = 8 * 1024 * 1024


class CameraFrameError(ValueError):
    """Raised when a frame cannot be turned into a ROS message."""


@dataclass(frozen=True)
class DecodedImage:
    image_format: str
    image_bytes: bytes


def decode_image_data_url(image_data_url: str, max_bytes: int = MAX_IMAGE_BYTES) -> DecodedImage:
    """Decode a ``data:image/...;base64,...`` URL.

    Mirrors `tablet_interface.measure_codec.decode_image_data_url`, but raises
    with a reason rather than returning ``None``, so the API can tell the
    operator which part of the frame was wrong.
    """
    raw = image_data_url.strip()
    if not raw.startswith("data:image/"):
        raise CameraFrameError("frame must be a data:image/ URL")

    header, separator, payload = raw.partition(",")
    if separator != ",":
        raise CameraFrameError("frame is missing its base64 payload")
    if ";base64" not in header:
        raise CameraFrameError("frame must be base64 encoded")

    mime = header[len("data:") : header.index(";base64")]
    image_format = (mime.split("/")[-1] or "jpeg").strip().lower()
    if image_format == "jpg":
        image_format = "jpeg"
    if image_format not in SUPPORTED_IMAGE_FORMATS:
        raise CameraFrameError(
            f"unsupported image format '{image_format}', expected one of {', '.join(SUPPORTED_IMAGE_FORMATS)}"
        )

    # Reject on the encoded length before decoding, so an oversized frame never
    # gets materialised in memory.
    if len(payload) > max_bytes * 4 // 3 + 4:
        raise CameraFrameError(f"frame is larger than the {max_bytes} byte limit")

    try:
        image_bytes = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise CameraFrameError("frame payload is not valid base64") from exc

    if not image_bytes:
        raise CameraFrameError("frame payload is empty")
    if len(image_bytes) > max_bytes:
        raise CameraFrameError(f"frame is larger than the {max_bytes} byte limit")

    return DecodedImage(image_format=image_format, image_bytes=image_bytes)


class RclpyCameraFrameGateway:
    """Publish decoded frames as ``sensor_msgs/msg/CompressedImage``."""

    def __init__(self, node: Any, qos_profile: int = 10, flush_after_publish: bool = True) -> None:
        self._node = node
        self._qos_profile = qos_profile
        self._flush_after_publish = flush_after_publish
        self._publishers: dict[str, Any] = {}

    def publish(self, topic: str, frame: DecodedImage, frame_id: str = "") -> None:
        publisher = self._ensure_publisher(topic)
        publisher.publish(self._to_ros_message(frame, frame_id))
        if self._flush_after_publish:
            self._flush_once()

    def _ensure_publisher(self, topic: str) -> Any:
        publisher = self._publishers.get(topic)
        if publisher is not None:
            return publisher
        publisher = self._node.create_publisher(
            self._get_compressed_image_class(), topic, self._qos_profile
        )
        self._publishers[topic] = publisher
        return publisher

    def _to_ros_message(self, frame: DecodedImage, frame_id: str) -> Any:
        message = self._get_compressed_image_class()()
        get_clock = getattr(self._node, "get_clock", None)
        if get_clock is not None:
            message.header.stamp = get_clock().now().to_msg()
        message.header.frame_id = frame_id
        message.format = frame.image_format
        message.data = frame.image_bytes
        return message

    def _flush_once(self) -> None:
        try:
            import rclpy
        except ModuleNotFoundError as exc:
            raise RuntimeError("rclpy is required to publish camera frames") from exc
        rclpy.spin_once(self._node, timeout_sec=0.05)

    @staticmethod
    def _get_compressed_image_class() -> type:
        try:
            from sensor_msgs.msg import CompressedImage
        except ModuleNotFoundError as exc:
            raise RuntimeError("sensor_msgs is required to publish camera frames") from exc
        return CompressedImage


class NoopCameraFrameGateway:
    """Safe default when no ROS node is attached."""

    def publish(self, topic: str, frame: DecodedImage, frame_id: str = "") -> None:
        return None


__all__ = [
    "MAX_IMAGE_BYTES",
    "SUPPORTED_IMAGE_FORMATS",
    "CameraFrameError",
    "DecodedImage",
    "NoopCameraFrameGateway",
    "RclpyCameraFrameGateway",
    "decode_image_data_url",
]
