"""Runtime action dispatch refuses what it cannot route, audits it, and reports what the gateway could not do."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import (
    ApplicationConfig,
    ConfigurationBundle,
    ConfigurationMetadata,
    InMemoryConfigurationRepository,
    RuntimeActionPreset,
    ScreenConfig,
)
from libs.config.models import RuntimeAdapterPolicy
from libs.ros_adapters import RosPublishReceipt, RosPublishRequest, RosServiceReceipt, RosServiceRequest
from libs.sessions import InMemoryRuntimeAuditLog, RuntimeCommandRateLimiter
from tests.conftest import FAULT_RESET_SERVICE, kinova_with_a_fault_reset_preset

ACTIONS = "/api/v1/runtime/actions"


class RecordingPublisherGateway:
    def __init__(self) -> None:
        self.requests: list[RosPublishRequest] = []

    def publish(self, request: RosPublishRequest) -> RosPublishReceipt:
        self.requests.append(request)
        return RosPublishReceipt(
            detail=f"Published {request.topic}.",
            message_type=request.message_type,
            status="published",
            topic=request.topic,
        )


class FailingServiceGateway:
    def __init__(self, error: Exception) -> None:
        self.error = error
        self.requests: list[RosServiceRequest] = []

    def call(self, request: RosServiceRequest) -> RosServiceReceipt:
        self.requests.append(request)
        raise self.error


class StopBetweenTheGates:
    """A STOP that lands after the route's first check and before the preset's own: the later one must hold."""

    def __init__(self) -> None:
        self.checks = 0

    def rejection_reason(self) -> str | None:
        self.checks += 1
        return None if self.checks == 1 else "Runtime stop is engaged."

    def execute_if_running(self, operation):
        return operation()

    def execute_blocking_if_running(self, operation):
        return operation()


def lab_bundle(*presets: RuntimeActionPreset, policy: RuntimeAdapterPolicy | None = None) -> ConfigurationBundle:
    application = ApplicationConfig(
        id="lab",
        name="Lab",
        screens=(ScreenConfig(id="main", title="Main"),),
        action_presets=presets,
        runtime_policy=policy or RuntimeAdapterPolicy(),
    )
    return ConfigurationBundle(metadata=ConfigurationMetadata(source="test"), applications=(application,))


def publish_client(bundle: ConfigurationBundle, audit_log: InMemoryRuntimeAuditLog | None = None):
    gateway = RecordingPublisherGateway()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository({"lab": bundle}),
            ros_publisher_gateway=gateway,
            runtime_audit_log=audit_log,
        )
    )
    return client, gateway


def dispatch(client: TestClient, command: str = "lab.go", config_id: str = "lab", app_id: str = "lab") -> Any:
    return client.post(ACTIONS, json={"app_id": app_id, "command": command, "config_id": config_id})


def rejected_records(audit_log: InMemoryRuntimeAuditLog) -> list:
    return [r for r in audit_log.list_records(50) if r.channel == "runtime_action" and r.status == "rejected"]


def test_a_request_needs_a_preset_id_or_a_command() -> None:
    client, gateway = publish_client(lab_bundle())

    response = client.post(ACTIONS, json={"app_id": "lab", "config_id": "lab"})

    assert response.status_code == 422
    assert "preset_id or command is required" in str(response.json()["detail"])
    assert gateway.requests == []


def test_an_unknown_configuration_or_application_is_not_found() -> None:
    client, gateway = publish_client(lab_bundle())

    assert dispatch(client, config_id="ghost").json() == {"detail": "configuration not found"}
    assert dispatch(client, app_id="ghost").json() == {"detail": "application not found"}
    assert gateway.requests == []


@pytest.mark.parametrize(
    "preset",
    [
        RuntimeActionPreset(
            id="p", name="Script", kind="script", command="lab.go", topic="/x", message_type="std_msgs/msg/String"
        ),
        RuntimeActionPreset(id="p", name="No topic", command="lab.go", message_type="std_msgs/msg/String"),
        RuntimeActionPreset(id="p", name="No type", command="lab.go", topic="/mode_request"),
    ],
)
def test_a_preset_that_is_not_a_topic_publish_cannot_be_dispatched(preset: RuntimeActionPreset) -> None:
    client, gateway = publish_client(lab_bundle(preset))

    response = dispatch(client)

    assert response.status_code == 422
    assert response.json() == {"detail": "runtime action preset is not a ROS topic publish adapter"}
    assert gateway.requests == []


def test_a_preset_whose_payload_text_does_not_parse_is_refused() -> None:
    preset = RuntimeActionPreset(
        id="p",
        name="Broken",
        command="lab.go",
        topic="/mode_request",
        message_type="std_msgs/msg/String",
        payload_text="{data: [",
    )
    client, gateway = publish_client(lab_bundle(preset))

    response = dispatch(client)

    assert response.status_code == 422
    assert "Invalid ROS payload text" in response.json()["detail"]
    assert gateway.requests == []


def test_a_payload_of_the_wrong_shape_is_refused_by_the_app_policy_and_audited() -> None:
    audit_log = InMemoryRuntimeAuditLog()
    preset = RuntimeActionPreset(
        id="p",
        name="Number",
        command="lab.go",
        topic="/mode_request",
        message_type="std_msgs/msg/String",
        payload={"data": 5},
    )
    client, gateway = publish_client(lab_bundle(preset), audit_log)

    response = dispatch(client)

    assert response.status_code == 422
    assert "must be a string" in response.json()["detail"]
    assert gateway.requests == []
    [record] = rejected_records(audit_log)
    assert record.payload_summary["preset_id"] == "p"


def test_the_deployment_allowlist_still_applies_to_a_topic_the_app_allows() -> None:
    preset = RuntimeActionPreset(
        id="p",
        name="Escape",
        command="lab.go",
        topic="/dangerous/topic",
        message_type="std_msgs/msg/String",
        payload={"data": "x"},
    )
    client, gateway = publish_client(
        lab_bundle(preset, policy=RuntimeAdapterPolicy(allowed_publish_topics=("/dangerous/topic",)))
    )

    response = dispatch(client)

    assert response.status_code == 403
    assert "/dangerous/topic" in response.json()["detail"]
    assert gateway.requests == []


def test_a_scalar_payload_is_sent_as_the_data_field() -> None:
    preset = RuntimeActionPreset(
        id="p",
        name="Servo on",
        command="lab.go",
        topic="/ui/visual_servoing/on",
        message_type="std_msgs/msg/Bool",
        payload=True,
    )
    client, gateway = publish_client(lab_bundle(preset))

    response = dispatch(client)

    assert response.status_code == 200
    assert gateway.requests == [
        RosPublishRequest(topic="/ui/visual_servoing/on", message_type="std_msgs/msg/Bool", payload={"data": True})
    ]


def service_client(gateway=None, audit_log=None, rate_limiter=None, **preset_fields):
    return TestClient(
        create_app(
            Settings(environment="test", allowed_ros_service_calls=(FAULT_RESET_SERVICE,)),
            InMemoryConfigurationRepository({"kinova-manager": kinova_with_a_fault_reset_preset(**preset_fields)}),
            ros_service_gateway=gateway,
            runtime_audit_log=audit_log,
            runtime_command_rate_limiter=rate_limiter,
        )
    )


RESET = {"app_id": "kinova-manager", "command": "kinova.reset_fault", "config_id": "kinova-manager"}


def test_a_service_preset_without_a_service_name_is_refused_and_audited() -> None:
    audit_log = InMemoryRuntimeAuditLog()
    client = service_client(audit_log=audit_log, topic="")

    response = client.post(ACTIONS, json=RESET)

    assert response.status_code == 422
    assert "needs a service name in `topic`" in response.json()["detail"]
    [record] = rejected_records(audit_log)
    assert record.target == "kinova.reset_fault"


def test_a_service_preset_whose_payload_text_does_not_parse_is_refused() -> None:
    audit_log = InMemoryRuntimeAuditLog()
    client = service_client(audit_log=audit_log, payload_text="{data: [")

    response = client.post(ACTIONS, json=RESET)

    assert response.status_code == 422
    assert "Invalid ROS payload text" in response.json()["detail"]
    assert len(rejected_records(audit_log)) == 1


def test_a_service_preset_is_rate_limited_like_a_command() -> None:
    gateway = FailingServiceGateway(RuntimeError("never reached"))
    audit_log = InMemoryRuntimeAuditLog()
    client = service_client(
        gateway, audit_log, RuntimeCommandRateLimiter(max_commands_per_second=1, clock=lambda: 10.0)
    )

    first = client.post(ACTIONS, json=RESET)
    second = client.post(ACTIONS, json=RESET)

    assert first.status_code == 502
    assert second.status_code == 429
    assert "rate limit exceeded" in second.json()["detail"]
    assert len(gateway.requests) == 1


def test_a_request_the_gateway_cannot_build_is_a_422_and_a_gateway_fault_a_502() -> None:
    invalid = service_client(FailingServiceGateway(ValueError("Invalid ROS service request: no field x")))
    faulty = service_client(FailingServiceGateway(RuntimeError("Service did not answer within 3.0s.")))

    assert invalid.post(ACTIONS, json=RESET).status_code == 422
    assert "no field x" in invalid.post(ACTIONS, json=RESET).json()["detail"]
    assert faulty.post(ACTIONS, json=RESET).status_code == 502


def test_a_stop_that_lands_between_the_two_checks_still_refuses_the_service_call() -> None:
    gateway = FailingServiceGateway(RuntimeError("never reached"))
    audit_log = InMemoryRuntimeAuditLog()
    client = service_client(gateway, audit_log)
    client.app.state.runtime_stop_controller = StopBetweenTheGates()

    response = client.post(ACTIONS, json=RESET)

    assert response.status_code == 409
    assert response.json()["detail"] == "Runtime stop is engaged."
    assert gateway.requests == []
    [record] = rejected_records(audit_log)
    assert record.detail == "Runtime stop is engaged."


def test_a_lease_that_moves_between_the_gate_and_the_stop_worker_refuses_the_resume(monkeypatch) -> None:
    app = create_app(Settings(environment="test", runtime_control_required=True), InMemoryConfigurationRepository())
    client = TestClient(app)
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        session = websocket.receive_json()["session_id"]
        websocket.send_json({"type": "claim_control"})
        websocket.receive_json()
        engaged = client.post("/api/v1/runtime/stop").json()
        manager = app.state.runtime_session_manager
        answers = iter([True])
        monkeypatch.setattr(manager, "is_control_owner", lambda session_id: next(answers, False))

        response = client.post(
            "/api/v1/runtime/stop/resume",
            headers={"X-Bloom-Runtime-Session": session},
            json={"engaged_at": engaged["engaged_at"]},
        )

    assert response.status_code == 409
    assert response.json()["detail"] == "This runtime session does not own robot control."
    assert client.get("/api/v1/runtime/stop").json()["stopped"] is True
