"""Hostile payload text is refused with a 4xx and an audit record, never a hang or a 500."""

from __future__ import annotations

import sys
import time
import types

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters.payloads import parse_ros_payload_text
from libs.ros_adapters.rclpy_publishers import RclpyRosPublisherGateway
from libs.sessions.audit import summarize_payload

PUBLISH = "/api/v1/ros/topics/publish"
ALIAS_BOMB = "\n".join(
    ["a: &a [x, x, x, x, x, x, x, x, x]"]
    + [f"{chr(98 + i)}: &{chr(98 + i)} [*{chr(97 + i)}, *{chr(97 + i)}, *{chr(97 + i)}]" for i in range(12)]
    + ["data: *m"]
)


def client() -> TestClient:
    return TestClient(
        create_app(Settings(environment="test", http_rate_limit_per_minute=0), InMemoryConfigurationRepository()),
        raise_server_exceptions=False,
    )


def test_a_yaml_alias_bomb_is_refused_quickly() -> None:
    started = time.monotonic()
    response = client().post(
        PUBLISH, json={"topic": "/ui/text", "message_type": "std_msgs/msg/String", "payload_text": ALIAS_BOMB}
    )
    assert response.status_code == 422
    assert "aliases" in response.json()["detail"]
    assert time.monotonic() - started < 1.0


def test_payload_text_without_aliases_still_parses() -> None:
    assert parse_ros_payload_text("{data: [13, 1], note: &n x}") == {"data": [13, 1], "note": "x"}
    with pytest.raises(ValueError, match="aliases"):
        parse_ros_payload_text("{a: &n 1, data: *n}")


def test_mixed_type_payload_keys_are_audited_not_a_500() -> None:
    test_client = client()
    response = test_client.post(
        PUBLISH, json={"topic": "/ui/text", "message_type": "std_msgs/msg/String", "payload_text": "{data: hi, 1: 2}"}
    )
    assert response.status_code == 200
    assert summarize_payload({1: 2, "data": "hi"})["fields"] == [1, "data"]
    records = test_client.get("/api/v1/runtime/audit").json()["records"]
    assert records[0]["topic"] == "/ui/text"


def test_an_overflowing_field_is_a_clean_payload_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def overflow(_message: object, _payload: object) -> None:
        raise OverflowError("int too large to convert to float")

    module = types.ModuleType("rosidl_runtime_py.set_message")
    module.set_message_fields = overflow  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py", types.ModuleType("rosidl_runtime_py"))
    monkeypatch.setitem(sys.modules, "rosidl_runtime_py.set_message", module)

    with pytest.raises(ValueError, match="Invalid ROS message payload"):
        RclpyRosPublisherGateway._set_message_fields(object(), {"data": 10**400})
