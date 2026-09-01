import base64

from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository

PIXEL = b"\xff\xd8\xff\xd9"
FRAME = f"data:image/jpeg;base64,{base64.b64encode(PIXEL * 16).decode('ascii')}"
TOPIC = "/ui/camera/compressed"


def test_camera_frames_are_rate_limited() -> None:
    # Frames are megabytes each. A widget stuck in a retry loop must not be able
    # to saturate the backend and the ROS graph.
    settings = Settings(
        environment="test",
        allowed_ros_publish_topics=(TOPIC,),
        runtime_command_rate_limit_per_second=2,
    )
    client = TestClient(create_app(settings, InMemoryConfigurationRepository()))
    body = {"topic": TOPIC, "image_data_url": FRAME}

    statuses = [client.post("/api/v1/runtime/camera-frames", json=body).status_code for _ in range(5)]

    assert statuses[:2] == [200, 200]
    assert 429 in statuses[2:]


def test_rate_limited_frames_are_audited() -> None:
    settings = Settings(
        environment="test",
        allowed_ros_publish_topics=(TOPIC,),
        runtime_command_rate_limit_per_second=1,
    )
    client = TestClient(create_app(settings, InMemoryConfigurationRepository()))
    body = {"topic": TOPIC, "image_data_url": FRAME}

    client.post("/api/v1/runtime/camera-frames", json=body)
    client.post("/api/v1/runtime/camera-frames", json=body)

    records = client.get("/api/v1/runtime/audit").json()["records"]
    rejected = [r for r in records if r["channel"] == "http_camera_frame" and r["status"] == "rejected"]
    assert rejected, "a rate-limited frame should leave an audit trail"
