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


@pytest.mark.parametrize("value", [-1.0, 0, 0.0, True, "fast"])
@pytest.mark.parametrize(
    "name",
    [
        "rate_limiter.max_linear_acceleration",
        "rate_limiter.max_angular_acceleration",
        "shapers.jaco.max_angular_velocity",
    ],
)
def test_parameter_set_refuses_a_limit_the_manager_reads_as_disabled(name: str, value: object) -> None:
    # cartesian_manager treats <= 0 as "no limit", so zero is refused with the negatives.
    response = client().post(
        "/api/v1/ros/parameters/set",
        json={"node": "/cartesian_manager", "name": name, "value": value},
    )
    assert response.status_code == 422


def test_parameter_set_still_takes_a_boolean_gate_and_a_valid_limit() -> None:
    test_client = client()
    gate = {"node": "/cartesian_manager", "name": "inputs.joystick.enabled", "value": False}
    limit = {"node": "/cartesian_manager", "name": "shapers.jaco.max_angular_velocity", "value": 0.5}
    assert test_client.post("/api/v1/ros/parameters/set", json=gate).status_code == 200
    assert test_client.post("/api/v1/ros/parameters/set", json=limit).status_code == 200


PARAMETER_SET = "/api/v1/ros/parameters/set"


@pytest.mark.parametrize(
    ("name", "too_high", "shipped"),
    [
        ("rate_limiter.max_linear_acceleration", 1e300, 2.0),
        ("rate_limiter.max_angular_acceleration", 6.5, 2.0),
        ("shapers.jaco.max_angular_velocity", 1.3, 0.4),
    ],
)
def test_parameter_set_refuses_a_limit_so_high_it_disables_itself(name: str, too_high: float, shipped: float) -> None:
    test_client = client()
    response = test_client.post(PARAMETER_SET, json={"node": "/cartesian_manager", "name": name, "value": too_high})
    assert response.status_code == 422, response.text
    assert (
        test_client.post(PARAMETER_SET, json={"node": "/cartesian_manager", "name": name, "value": shipped}).status_code
        == 200
    )
    audit = test_client.get("/api/v1/runtime/audit").json()
    assert any(record["status"] == "rejected" and record["target"].endswith(name) for record in audit["records"])


def test_a_lab_can_raise_the_acceleration_cap_in_settings() -> None:
    body = {"node": "/cartesian_manager", "name": "rate_limiter.max_linear_acceleration", "value": 8.0}
    assert client().post(PARAMETER_SET, json=body).status_code == 422
    assert client(max_manager_linear_acceleration=10.0).post(PARAMETER_SET, json=body).status_code == 200


def test_a_huge_integer_is_refused_rather_than_a_500() -> None:
    test_client = client()
    assert test_client.post(PUBLISH, json=speed(MAX_LINEAR_SPEED_TOPIC, 10**400)).status_code == 422
    array = {"topic": "/ui/twist", "message_type": "std_msgs/msg/Float64MultiArray", "payload": {"data": [10**400]}}
    assert client(allowed_ros_message_types=("*",)).post(PUBLISH, json=array).status_code == 422
    gain = {"node": "/cartesian_manager", "name": "shapers.snake.gain", "value": 10**400}
    assert test_client.post(PARAMETER_SET, json=gain).status_code == 422


@pytest.mark.parametrize(
    ("message_type", "data"),
    [
        ("std_msgs/msg/Float32", 3.5e38),
        ("std_msgs/msg/Float32", -1e39),
        ("std_msgs/msg/Float32MultiArray", [1.0, 4e38]),
        ("std_msgs/msg/Int32", 2**32 + 5),
        ("std_msgs/msg/Int32", -(2**31) - 1),
        ("std_msgs/msg/Int32MultiArray", [1, 2**31]),
        ("std_msgs/msg/UInt8MultiArray", [0, 256]),
        ("std_msgs/msg/UInt8MultiArray", [-1]),
    ],
)
def test_numbers_the_message_type_cannot_hold_are_refused(message_type: str, data: object) -> None:
    body = {"topic": "/ui/numbers", "message_type": message_type, "payload": {"data": data}}
    assert client(allowed_ros_message_types=("*",)).post(PUBLISH, json=body).status_code == 422


@pytest.mark.parametrize(
    ("message_type", "data"),
    [
        ("std_msgs/msg/Float32", 3.4e38),
        ("std_msgs/msg/Int32", 2**31 - 1),
        ("std_msgs/msg/Int32MultiArray", [-(2**31), 0]),
        ("std_msgs/msg/UInt8MultiArray", [0, 255]),
    ],
)
def test_numbers_at_the_edge_of_the_type_publish(message_type: str, data: object) -> None:
    body = {"topic": "/ui/numbers", "message_type": message_type, "payload": {"data": data}}
    assert client(allowed_ros_message_types=("*",)).post(PUBLISH, json=body).status_code == 200


def test_the_default_caps_cover_every_shipped_slider() -> None:
    from libs.config.seed import DEFAULT_SEED_DIR
    from libs.ros_adapters.safety import DEFAULT_PARAMETER_BOUNDS

    bounds = {key: upper for key, _lower, upper in DEFAULT_PARAMETER_BOUNDS}

    def walk(node: object) -> None:
        if isinstance(node, dict):
            mapping = node.get("runtime_binding", {}).get("value_mapping", {}) if "runtime_binding" in node else {}
            key = f"{mapping.get('node')}:{mapping.get('parameter')}"
            if key in bounds:
                assert node["max"] <= bounds[key], key
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    for path in DEFAULT_SEED_DIR.glob("*.json"):
        walk(json.loads(path.read_text()))


@pytest.mark.parametrize(
    ("name", "refused", "accepted"),
    [
        ("behaviours.intent_scaling.min_scale", 0.0, 0.4),
        ("behaviours.intent_scaling.min_scale", 1.5, 1.0),
        ("behaviours.intent_scaling.consistency_threshold", 1.2, 0.5),
        ("behaviours.intent_scaling.gain", -0.1, 0.0),
        ("behaviours.shared_control.theta_l_deg", 120.0, 30.0),
        ("behaviours.shared_control.gamma", 0.0, 2.0),
        ("behaviours.shared_control.r2", 0.0, 0.02),
        ("behaviours.shared_control.goal_match_distance", -0.05, 0.05),
    ],
)
def test_the_lasting_behaviours_tuning_is_bounded_as_the_manager_validates_it(
    name: str, refused: float, accepted: float
) -> None:
    test_client = client()
    body = {"node": "/cartesian_manager", "name": name}
    assert test_client.post(PARAMETER_SET, json=body | {"value": refused}).status_code == 422
    assert test_client.post(PARAMETER_SET, json=body | {"value": accepted}).status_code == 200


PETANQUE_PARAMETERS = ("total_duration", "alpha", "angle_between_start_and_finish")


@pytest.mark.parametrize(
    ("name", "refused", "accepted"),
    [
        ("total_duration", 0.0, 2.0),
        ("total_duration", -1.0, 0.5),
        ("total_duration", 0.1, 5.0),
        ("alpha", -0.1, 0.0),
        ("alpha", 40.0, 0.5),
        ("angle_between_start_and_finish", 0.6, 0.5),
        ("angle_between_start_and_finish", -1.57, -0.5),
    ],
)
def test_petanque_throw_parameters_are_bounded(name: str, refused: float, accepted: float) -> None:
    test_client = client()
    body = {"node": "/petanque_throw", "name": name}
    assert test_client.post(PARAMETER_SET, json={**body, "value": refused}).status_code == 422
    assert test_client.post(PARAMETER_SET, json={**body, "value": accepted}).status_code == 200


def test_a_lab_can_move_the_petanque_bounds_in_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BLOOM_MIN_PETANQUE_TOTAL_DURATION", "1.0")
    monkeypatch.setenv("BLOOM_MAX_PETANQUE_ALPHA", "0.8")
    monkeypatch.setenv("BLOOM_RUNTIME_CONTROL_REQUIRED", "false")
    monkeypatch.setenv("BLOOM_HTTP_RATE_LIMIT_PER_MINUTE", "0")
    test_client = TestClient(create_app(Settings.from_environment(), InMemoryConfigurationRepository()))
    duration = {"node": "/petanque_throw", "name": "total_duration", "value": 0.7}
    alpha = {"node": "/petanque_throw", "name": "alpha", "value": 0.7}
    assert test_client.post(PARAMETER_SET, json=duration).status_code == 422
    assert test_client.post(PARAMETER_SET, json=alpha).status_code == 200


def test_settings_refuse_a_petanque_bound_the_controller_cannot_take() -> None:
    with pytest.raises(ValueError):
        Settings(max_petanque_finish_angle=1.6)
    with pytest.raises(ValueError):
        Settings(min_petanque_total_duration=0.0)
    with pytest.raises(ValueError):
        Settings(min_petanque_total_duration=3.0, max_petanque_total_duration=2.0)


def test_every_petanque_seed_slider_stays_within_the_default_bounds() -> None:
    from libs.config.seed import DEFAULT_SEED_DIR
    from libs.ros_adapters.safety import petanque_parameter_bounds

    settings = Settings()
    bounds = {
        key: (lower, upper)
        for key, lower, upper in petanque_parameter_bounds(
            settings.min_petanque_total_duration,
            settings.max_petanque_total_duration,
            settings.max_petanque_alpha,
            settings.max_petanque_finish_angle,
        )
    }
    seen: set[str] = set()

    def walk(node: object) -> None:
        if isinstance(node, dict):
            mapping = node.get("runtime_binding", {}).get("value_mapping", {}) if "runtime_binding" in node else {}
            key = f"{mapping.get('node')}:{mapping.get('parameter')}"
            if key in bounds:
                seen.add(key)
                lower, upper = bounds[key]
                for field in ("min", "max", "value"):
                    if field in node:
                        assert lower <= node[field] <= upper, (key, field, node[field])
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    for path in DEFAULT_SEED_DIR.glob("*.json"):
        walk(json.loads(path.read_text()))
    assert seen == {f"/petanque_throw:{name}" for name in PETANQUE_PARAMETERS}
