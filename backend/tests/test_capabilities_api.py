from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.ros_adapters.publishers import RosPublishReceipt


class RecordingPublisherGateway:
    """Stands in for a wired ROS publisher."""

    def publish(self, request) -> RosPublishReceipt:  # pragma: no cover - not exercised here
        raise NotImplementedError


class RecordingCameraGateway:
    """Stands in for a wired ROS camera publisher."""

    def publish(self, topic: str, frame, frame_id: str = "") -> None:  # pragma: no cover - not exercised here
        raise NotImplementedError


def capability(payload: dict, capability_id: str) -> dict:
    return next(entry for entry in payload["capabilities"] if entry["id"] == capability_id)


def test_a_backend_with_no_ros_says_so(test_settings: Settings) -> None:
    """Without this, a widget that reads a topic just waits forever in silence."""
    client = TestClient(create_app(test_settings))

    payload = client.get("/api/v1/capabilities").json()

    assert capability(payload, "command-dispatcher")["available"] is False
    assert capability(payload, "data-source")["available"] is False
    assert capability(payload, "teleop-adapter")["available"] is False
    assert capability(payload, "camera-frames")["available"] is False
    assert "never receive anything" in capability(payload, "data-source")["detail"]


def test_a_wired_camera_publisher_is_reported_as_available(test_settings: Settings) -> None:
    """A screen cannot tell a simulated frame from a published one without this."""
    client = TestClient(create_app(test_settings, camera_frame_gateway=RecordingCameraGateway()))

    payload = client.get("/api/v1/capabilities").json()

    assert capability(payload, "camera-frames")["available"] is True


def test_a_wired_seam_is_reported_as_available(test_settings: Settings) -> None:
    client = TestClient(create_app(test_settings, ros_publisher_gateway=RecordingPublisherGateway()))

    payload = client.get("/api/v1/capabilities").json()

    assert capability(payload, "command-dispatcher")["available"] is True
    # The seams are independent, so wiring one must not claim the others.
    assert capability(payload, "data-source")["available"] is False


def test_every_capability_explains_itself(test_settings: Settings) -> None:
    client = TestClient(create_app(test_settings))

    payload = client.get("/api/v1/capabilities").json()

    assert payload["capabilities"], "no capabilities reported"
    for entry in payload["capabilities"]:
        assert entry["detail"].strip(), f"{entry['id']} has no explanation"
