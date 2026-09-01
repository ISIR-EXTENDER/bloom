import base64
import sys
from types import ModuleType

import pytest

from libs.ros_adapters.camera_frames import (
    CameraFrameError,
    DecodedImage,
    RclpyCameraFrameGateway,
    decode_image_data_url,
)

PIXEL = b"\xff\xd8\xff\xd9"


def data_url(payload: bytes = PIXEL, mime: str = "image/jpeg") -> str:
    return f"data:{mime};base64,{base64.b64encode(payload).decode('ascii')}"


def test_decodes_a_jpeg_frame() -> None:
    decoded = decode_image_data_url(data_url())

    assert decoded.image_format == "jpeg"
    assert decoded.image_bytes == PIXEL


@pytest.mark.parametrize("mime,expected", [("image/png", "png"), ("image/webp", "webp"), ("image/jpg", "jpeg")])
def test_normalizes_supported_formats(mime: str, expected: str) -> None:
    # jpg is normalized to jpeg, matching tablet_interface.
    assert decode_image_data_url(data_url(mime=mime)).image_format == expected


def test_rejects_a_non_image_url() -> None:
    with pytest.raises(CameraFrameError, match="data:image/"):
        decode_image_data_url("https://example.invalid/frame.jpg")


def test_rejects_a_missing_payload() -> None:
    with pytest.raises(CameraFrameError, match="missing its base64"):
        decode_image_data_url("data:image/jpeg;base64")


def test_rejects_non_base64_encoding() -> None:
    with pytest.raises(CameraFrameError, match="base64 encoded"):
        decode_image_data_url("data:image/jpeg,notbase64")


def test_rejects_invalid_base64() -> None:
    with pytest.raises(CameraFrameError, match="not valid base64"):
        decode_image_data_url("data:image/jpeg;base64,!!!!")


def test_rejects_an_empty_payload() -> None:
    with pytest.raises(CameraFrameError, match="empty"):
        decode_image_data_url("data:image/jpeg;base64,")


def test_rejects_an_unsupported_format() -> None:
    with pytest.raises(CameraFrameError, match="unsupported image format"):
        decode_image_data_url(data_url(mime="image/gif"))


def test_rejects_an_oversized_frame_before_decoding() -> None:
    # The cap is checked on the encoded length so a huge frame is never
    # materialised in backend memory.
    with pytest.raises(CameraFrameError, match="larger than"):
        decode_image_data_url(data_url(b"x" * 4096), max_bytes=1024)


class RecordingPublisher:
    def __init__(self) -> None:
        self.messages: list[object] = []

    def publish(self, message: object) -> None:
        self.messages.append(message)


class RecordingNode:
    def __init__(self) -> None:
        self.publishers: dict[str, RecordingPublisher] = {}

    def create_publisher(self, message_cls: type, topic: str, qos_profile: int) -> RecordingPublisher:
        publisher = self.publishers.get(topic) or RecordingPublisher()
        self.publishers[topic] = publisher
        return publisher


class FakeHeader:
    def __init__(self) -> None:
        self.frame_id = ""
        self.stamp = None


class FakeCompressedImage:
    def __init__(self) -> None:
        self.header = FakeHeader()
        self.format = ""
        self.data = b""


def install_fake_sensor_msgs(monkeypatch) -> None:
    sensor_msgs = ModuleType("sensor_msgs")
    sensor_msgs_msg = ModuleType("sensor_msgs.msg")
    rclpy = ModuleType("rclpy")
    sensor_msgs_msg.CompressedImage = FakeCompressedImage
    rclpy.spin_once = lambda node, timeout_sec=0: None
    sensor_msgs.msg = sensor_msgs_msg
    monkeypatch.setitem(sys.modules, "sensor_msgs", sensor_msgs)
    monkeypatch.setitem(sys.modules, "sensor_msgs.msg", sensor_msgs_msg)
    monkeypatch.setitem(sys.modules, "rclpy", rclpy)


def test_gateway_publishes_a_compressed_image(monkeypatch) -> None:
    install_fake_sensor_msgs(monkeypatch)
    node = RecordingNode()
    gateway = RclpyCameraFrameGateway(node)

    gateway.publish("/ui/camera/compressed", DecodedImage("jpeg", PIXEL), frame_id="tablet")

    message = node.publishers["/ui/camera/compressed"].messages[0]
    assert message.format == "jpeg"
    assert message.data == PIXEL
    assert message.header.frame_id == "tablet"


def test_gateway_reuses_one_publisher_per_topic(monkeypatch) -> None:
    install_fake_sensor_msgs(monkeypatch)
    node = RecordingNode()
    gateway = RclpyCameraFrameGateway(node)

    gateway.publish("/ui/camera/compressed", DecodedImage("jpeg", PIXEL))
    gateway.publish("/ui/camera/compressed", DecodedImage("jpeg", PIXEL))

    assert len(node.publishers["/ui/camera/compressed"].messages) == 2
