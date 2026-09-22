"""A ROS camera topic reaches the operator's screen on its own socket."""

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters.camera_streams import (
    CameraStreamFrame,
    NoopCameraStreamGateway,
    RclpyCameraStreamGateway,
)

JPEG = b"\xff\xd8\xff" + b"frame one"


class ReplayingCameraStreamGateway:
    """Hands one prepared frame to whatever subscribes, from another thread."""

    def __init__(self, frames: list[bytes]) -> None:
        self.frames = frames
        self.topics: list[str] = []
        self.closed = 0

    def subscribe(self, topic: str, on_frame):
        self.topics.append(topic)
        for image_bytes in self.frames:
            on_frame(CameraStreamFrame(image_format="jpeg", image_bytes=image_bytes))

        gateway = self

        class Handle:
            def close(self) -> None:
                gateway.closed += 1

        return Handle()


def build_client(gateway) -> TestClient:
    app = create_app(
        settings=Settings(environment="test"),
        configuration_repository=InMemoryConfigurationRepository(),
        camera_stream_gateway=gateway,
    )
    return TestClient(app)


def test_the_socket_streams_the_frame_bytes_untouched() -> None:
    gateway = ReplayingCameraStreamGateway([JPEG])

    with build_client(gateway) as client:
        with client.websocket_connect("/api/v1/runtime/camera?topic=/camera/color/image_raw/compressed") as socket:
            opened = socket.receive_json()
            assert opened["type"] == "camera_stream_opened"
            assert opened["topic"] == "/camera/color/image_raw/compressed"
            assert opened["connected"] is True
            # Nothing is re-encoded on the way: what the topic carried is what the browser gets.
            assert socket.receive_bytes() == JPEG

    assert gateway.topics == ["/camera/color/image_raw/compressed"]
    assert gateway.closed == 1


def test_a_topic_that_is_not_a_topic_is_refused() -> None:
    gateway = ReplayingCameraStreamGateway([JPEG])

    with build_client(gateway) as client:
        with client.websocket_connect("/api/v1/runtime/camera?topic=camera%20feed") as socket:
            with pytest.raises(WebSocketDisconnect) as refusal:
                socket.receive_json()

    assert refusal.value.code == 1008
    # Refused before anything subscribed, so a bad topic never reaches ROS.
    assert gateway.topics == []


def test_without_a_ros_node_the_socket_says_so_rather_than_hanging() -> None:
    # The alternative is a black rectangle that looks exactly like a camera that has not started.
    with build_client(NoopCameraStreamGateway()) as client:
        with client.websocket_connect("/api/v1/runtime/camera?topic=/camera/color/image_raw/compressed") as socket:
            opened = socket.receive_json()

    assert opened["connected"] is False


def test_only_the_newest_frame_survives_a_slow_reader() -> None:
    # A late frame is worse than no frame when it is being used to judge where the gripper is.
    gateway = ReplayingCameraStreamGateway([b"\xff\xd8\xffold", b"\xff\xd8\xffnew"])

    with build_client(gateway) as client:
        with client.websocket_connect("/api/v1/runtime/camera?topic=/camera/color/image_raw/compressed") as socket:
            socket.receive_json()
            assert socket.receive_bytes() == b"\xff\xd8\xffnew"


class RecordingNode:
    """Stands in for an rclpy node, capturing what the gateway asked for."""

    def __init__(self) -> None:
        self.created: list[tuple] = []
        self.destroyed = 0
        self.callback = None

    def create_subscription(self, message_cls, topic, callback, qos):
        self.created.append((message_cls, topic, qos))
        self.callback = callback
        return object()

    def destroy_subscription(self, subscription) -> None:
        self.destroyed += 1


class FakeCompressedImage:
    def __init__(self, data: bytes, image_format: str = "jpeg") -> None:
        self.data = data
        self.format = image_format


def test_an_oversized_frame_is_dropped_rather_than_streamed() -> None:
    node = RecordingNode()
    gateway = RclpyCameraStreamGateway(node, max_frame_bytes=16)
    gateway._get_compressed_image_class = lambda: FakeCompressedImage  # type: ignore[method-assign]
    gateway._sensor_data_qos = lambda: "sensor-data"  # type: ignore[method-assign]

    seen: list[CameraStreamFrame] = []
    gateway.subscribe("/camera/color/image_raw/compressed", seen.append)
    node.callback(FakeCompressedImage(b"x" * 17))
    node.callback(FakeCompressedImage(b"x" * 8))

    assert [frame.image_bytes for frame in seen] == [b"x" * 8]


def test_the_subscription_uses_sensor_data_qos() -> None:
    # Camera drivers publish best effort. A reliable subscriber matches none of them and sees nothing.
    node = RecordingNode()
    gateway = RclpyCameraStreamGateway(node)
    gateway._get_compressed_image_class = lambda: FakeCompressedImage  # type: ignore[method-assign]
    gateway._sensor_data_qos = lambda: "sensor-data"  # type: ignore[method-assign]

    handle = gateway.subscribe("/camera/color/image_raw/compressed", lambda frame: None)
    handle.close()
    handle.close()

    assert node.created == [(FakeCompressedImage, "/camera/color/image_raw/compressed", "sensor-data")]
    assert node.destroyed == 1
