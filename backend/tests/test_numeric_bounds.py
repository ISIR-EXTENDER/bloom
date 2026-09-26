"""Speed limits and live parameters refuse values the robot must never be told."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters.safety import MAX_ANGULAR_SPEED_TOPIC, MAX_LINEAR_SPEED_TOPIC

PUBLISH = "/api/v1/ros/topics/publish"


def client(**settings: object) -> TestClient:
    return TestClient(
        create_app(
            Settings(environment="test", http_rate_limit_per_minute=0, **settings), InMemoryConfigurationRepository()
        )
    )


def speed(topic: str, data: object) -> dict:
    return {"topic": topic, "message_type": "std_msgs/msg/Float64", "payload": {"data": data}}


@pytest.mark.parametrize("data", [1e9, -5.0, True, 0.31, "0.2"])
def test_linear_speed_limit_refuses_out_of_range_values(data: object) -> None:
    response = client().post(PUBLISH, json=speed(MAX_LINEAR_SPEED_TOPIC, data))
    assert response.status_code == 422, response.text


def test_nan_and_infinity_are_refused_on_publish() -> None:
    body = json.dumps(speed(MAX_LINEAR_SPEED_TOPIC, 0.1)).replace("0.1", "NaN")
    response = client().post(PUBLISH, content=body, headers={"Content-Type": "application/json"})
    assert response.status_code == 422

    twist = (
        '{"topic": "/ui/twist", "message_type": "std_msgs/msg/Float64MultiArray", "payload": {"data": [1.0, Infinity]}}'
    )
    response = client(allowed_ros_message_types=("*",)).post(
        PUBLISH, content=twist, headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 422


def test_speed_limits_within_the_ui_caps_publish() -> None:
    test_client = client()
    assert test_client.post(PUBLISH, json=speed(MAX_LINEAR_SPEED_TOPIC, 0.3)).status_code == 200
    assert test_client.post(PUBLISH, json=speed(MAX_ANGULAR_SPEED_TOPIC, 0.8)).status_code == 200
    assert test_client.post(PUBLISH, json=speed(MAX_ANGULAR_SPEED_TOPIC, 0.9)).status_code == 422


def test_a_lab_can_raise_the_speed_cap_in_settings() -> None:
    response = client(max_linear_speed_limit=0.5).post(PUBLISH, json=speed(MAX_LINEAR_SPEED_TOPIC, 0.45))
    assert response.status_code == 200


def test_parameter_set_refuses_infinity() -> None:
    body = '{"node": "/cartesian_manager", "name": "shapers.snake.gain", "value": Infinity}'
    response = client().post("/api/v1/ros/parameters/set", content=body, headers={"Content-Type": "application/json"})
    assert response.status_code == 422


@pytest.mark.parametrize("value", [-1.0, True, "fast"])
def test_parameter_set_refuses_a_negative_or_non_numeric_acceleration_limit(value: object) -> None:
    response = client().post(
        "/api/v1/ros/parameters/set",
        json={"node": "/cartesian_manager", "name": "rate_limiter.max_linear_acceleration", "value": value},
    )
    assert response.status_code == 422


def test_parameter_set_still_takes_a_boolean_gate_and_a_valid_limit() -> None:
    test_client = client()
    gate = {"node": "/cartesian_manager", "name": "inputs.joystick.enabled", "value": False}
    limit = {"node": "/cartesian_manager", "name": "shapers.jaco.max_angular_velocity", "value": 0.5}
    assert test_client.post("/api/v1/ros/parameters/set", json=gate).status_code == 200
    assert test_client.post("/api/v1/ros/parameters/set", json=limit).status_code == 200
