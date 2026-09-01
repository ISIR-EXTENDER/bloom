import base64

from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository

PIXEL = b"\xff\xd8\xff\xd9"
FRAME = f"data:image/jpeg;base64,{base64.b64encode(PIXEL * 16).decode('ascii')}"
TOPIC = "/ui/camera/compressed"


def make_client() -> TestClient:
    settings = Settings(environment="test", allowed_ros_publish_topics=(TOPIC,))
    return TestClient(create_app(settings, InMemoryConfigurationRepository()))


def post(client: TestClient, topic: str = TOPIC, frame: str = FRAME):
    return client.post(
        "/api/v1/runtime/camera-frames",
        json={"topic": topic, "image_data_url": frame, "frame_id": "tablet"},
    )


def test_publishes_a_frame_without_a_ros_node_attached() -> None:
    # The noop gateway keeps the route usable in local development.
    response = post(make_client())

    assert response.status_code == 200
    body = response.json()
    assert body["image_format"] == "jpeg"
    assert body["byte_count"] == len(PIXEL) * 16


def test_rejects_a_topic_outside_the_publish_allowlist() -> None:
    # A camera widget must not reach a topic the app was not configured for.
    response = post(make_client(), topic="/somewhere/else")

    assert response.status_code == 403


def test_rejects_a_malformed_frame() -> None:
    response = post(make_client(), frame="data:image/jpeg;base64,!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")

    assert response.status_code == 422
    assert "base64" in response.json()["detail"]


def test_rejects_an_unsupported_format() -> None:
    gif = f"data:image/gif;base64,{base64.b64encode(PIXEL * 16).decode('ascii')}"
    response = post(make_client(), frame=gif)

    assert response.status_code == 422
    assert "unsupported image format" in response.json()["detail"]


def test_records_both_outcomes_in_the_audit_log() -> None:
    client = make_client()
    post(client)
    post(client, topic="/somewhere/else")

    records = client.get("/api/v1/runtime/audit").json()["records"]
    camera = [item for item in records if item["channel"] == "http_camera_frame"]
    assert {item["status"] for item in camera} == {"accepted", "rejected"}
