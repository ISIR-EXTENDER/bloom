"""Live tuning through the nodes' parameter services: allowlisted, owner-only, audited."""

from __future__ import annotations

from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters.parameters import (
    NoopRosParameterGateway,
    RosParameterReading,
    RosParameterReceipt,
    RosParameterRequest,
)
from libs.sessions import InMemoryRuntimeAuditLog


class RecordingParameterGateway:
    def __init__(self) -> None:
        self.requests: list[RosParameterRequest] = []
        self.values: dict[str, float] = {"shapers.snake.gain": 3.0}

    def set(self, request: RosParameterRequest) -> RosParameterReceipt:
        self.requests.append(request)
        return RosParameterReceipt(
            node=request.node, name=request.name, value=request.value, status="set", detail="Parameter set."
        )

    def get(self, node: str, names: tuple[str, ...]) -> tuple[RosParameterReading, ...]:
        return tuple(RosParameterReading(node=node, name=name, value=self.values.get(name)) for name in names)


def make_client(gateway=None, audit_log=None) -> TestClient:
    return TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            ros_parameter_gateway=gateway,
            runtime_audit_log=audit_log,
        )
    )


SNAKE_GAIN = {"node": "/cartesian_manager", "name": "shapers.snake.gain", "value": 4.5}


def test_a_set_without_ros_is_simulated() -> None:
    response = make_client().post("/api/v1/ros/parameters/set", json=SNAKE_GAIN)

    assert response.status_code == 200
    assert response.json()["status"] == "simulated"
    assert response.json()["value"] == 4.5


def test_an_allowlisted_parameter_reaches_the_gateway_and_the_audit_log() -> None:
    gateway = RecordingParameterGateway()
    audit_log = InMemoryRuntimeAuditLog()
    response = make_client(gateway, audit_log).post("/api/v1/ros/parameters/set", json=SNAKE_GAIN)

    assert response.status_code == 200
    assert response.json()["status"] == "set"
    assert gateway.requests == [RosParameterRequest(node="/cartesian_manager", name="shapers.snake.gain", value=4.5)]
    record = audit_log.list_records()[0]
    assert record.channel == "http_ros_parameter"
    assert record.status == "accepted"
    assert record.target == "/cartesian_manager:shapers.snake.gain"


def test_a_parameter_outside_the_allowlist_is_refused() -> None:
    # Joint targets, inputs and frames are startup-only in the manager; Bloom does not offer them.
    gateway = RecordingParameterGateway()
    response = make_client(gateway).post(
        "/api/v1/ros/parameters/set",
        json={"node": "/cartesian_manager", "name": "behaviours.joint_targets.positions", "value": 1.0},
    )

    assert response.status_code == 403
    assert gateway.requests == []


def test_a_node_that_refuses_reports_service_unavailable() -> None:
    class Refusing(NoopRosParameterGateway):
        def set(self, request: RosParameterRequest) -> RosParameterReceipt:
            raise RuntimeError("/cartesian_manager refused shapers.snake.gain.")

    response = make_client(Refusing()).post("/api/v1/ros/parameters/set", json=SNAKE_GAIN)

    assert response.status_code == 503
    assert "refused" in response.json()["detail"]


def test_reading_returns_the_live_value_and_none_for_an_undeclared_one() -> None:
    response = make_client(RecordingParameterGateway()).get(
        "/api/v1/ros/parameters",
        params={"node": "/cartesian_manager", "names": "shapers.snake.gain,rate_limiter.max_linear_acceleration"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "parameters": [
            {"node": "/cartesian_manager", "name": "shapers.snake.gain", "value": 3.0},
            {"node": "/cartesian_manager", "name": "rate_limiter.max_linear_acceleration", "value": None},
        ]
    }


def test_reading_outside_the_allowlist_is_refused() -> None:
    response = make_client(RecordingParameterGateway()).get(
        "/api/v1/ros/parameters", params={"node": "/cartesian_manager", "names": "frames.base_frame"}
    )

    assert response.status_code == 403


def test_a_node_name_must_be_fully_qualified() -> None:
    response = make_client().post(
        "/api/v1/ros/parameters/set", json={"node": "cartesian_manager", "name": "shapers.snake.gain", "value": 1.0}
    )

    assert response.status_code == 422
