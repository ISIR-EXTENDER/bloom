"""Trigger-style service calls: policed, audited, and gated by the stop latch."""

from pathlib import Path

from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository, load_configuration_file
from libs.ros_adapters import RosServiceReceipt, RosServiceRequest
from libs.sessions import InMemoryRuntimeAuditLog

KINOVA_FIXTURE_PATH = Path(__file__).parents[1] / "seed" / "applications" / "kinova-manager.json"


class RecordingServiceGateway:
    def __init__(self, success: bool = True) -> None:
        self.requests: list[RosServiceRequest] = []
        self.success = success

    def call(self, request: RosServiceRequest) -> RosServiceReceipt:
        self.requests.append(request)
        return RosServiceReceipt(
            service=request.service,
            service_type=request.service_type,
            status="called",
            success=self.success,
            detail="Fault cleared." if self.success else "Robot still faulted.",
        )


class UnavailableServiceGateway:
    def call(self, request: RosServiceRequest) -> RosServiceReceipt:
        raise RuntimeError(f"Service {request.service} is not available.")


def create_service_client(gateway=None, audit_log=None) -> TestClient:
    return TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository({"kinova-manager": load_configuration_file(KINOVA_FIXTURE_PATH)}),
            ros_service_gateway=gateway,
            runtime_audit_log=audit_log,
        )
    )


RESET_FAULT = {"service": "/fault_controller/reset_fault", "service_type": "example_interfaces/srv/Trigger"}


def test_an_allowed_service_call_reaches_the_gateway() -> None:
    gateway = RecordingServiceGateway()
    client = create_service_client(gateway)

    response = client.post("/api/v1/ros/services/call", json=RESET_FAULT)

    assert response.status_code == 200
    assert response.json() == {
        "service": "/fault_controller/reset_fault",
        "service_type": "example_interfaces/srv/Trigger",
        "status": "called",
        "success": True,
        "detail": "Fault cleared.",
    }
    [request] = gateway.requests
    assert request.service == "/fault_controller/reset_fault"


def test_a_service_outside_the_allowlist_is_refused() -> None:
    gateway = RecordingServiceGateway()
    client = create_service_client(gateway)

    response = client.post(
        "/api/v1/ros/services/call",
        json={"service": "/controller_manager/switch_controller", "service_type": "example_interfaces/srv/Trigger"},
    )

    assert response.status_code == 403
    assert gateway.requests == []


def test_service_calls_are_refused_while_the_stop_latch_is_engaged() -> None:
    gateway = RecordingServiceGateway()
    client = create_service_client(gateway)
    client.post("/api/v1/runtime/stop")

    response = client.post("/api/v1/ros/services/call", json=RESET_FAULT)

    assert response.status_code == 409
    assert gateway.requests == []


def test_an_unavailable_service_is_a_gateway_error_not_a_success() -> None:
    client = create_service_client(UnavailableServiceGateway())

    response = client.post("/api/v1/ros/services/call", json=RESET_FAULT)

    assert response.status_code == 502
    assert "not available" in response.json()["detail"]


def test_without_ros_the_call_reports_itself_simulated() -> None:
    client = create_service_client()

    response = client.post("/api/v1/ros/services/call", json=RESET_FAULT)

    assert response.status_code == 200
    assert response.json()["status"] == "simulated"


def test_the_kinova_reset_fault_preset_dispatches_the_service() -> None:
    gateway = RecordingServiceGateway()
    client = create_service_client(gateway)

    response = client.post(
        "/api/v1/runtime/actions",
        json={"app_id": "kinova-manager", "command": "kinova.reset_fault", "config_id": "kinova-manager"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "called"
    assert body["topic"] == "/fault_controller/reset_fault"
    [request] = gateway.requests
    assert request.service_type == "example_interfaces/srv/Trigger"


def test_a_refused_reset_says_so_in_the_detail() -> None:
    client = create_service_client(RecordingServiceGateway(success=False))

    response = client.post(
        "/api/v1/runtime/actions",
        json={"app_id": "kinova-manager", "command": "kinova.reset_fault", "config_id": "kinova-manager"},
    )

    assert response.status_code == 200
    assert response.json()["detail"] == "Service refused: Robot still faulted."


def test_service_preset_needs_the_app_policy_to_allow_it() -> None:
    gateway = RecordingServiceGateway()
    bundle = load_configuration_file(KINOVA_FIXTURE_PATH)
    stripped = bundle.model_copy(
        update={
            "applications": tuple(
                app.model_copy(update={"runtime_policy": app.runtime_policy.model_copy(update={"allowed_service_calls": ()})})
                for app in bundle.applications
            )
        }
    )
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository({"kinova-manager": stripped}),
            ros_service_gateway=gateway,
        )
    )

    response = client.post(
        "/api/v1/runtime/actions",
        json={"app_id": "kinova-manager", "command": "kinova.reset_fault", "config_id": "kinova-manager"},
    )

    assert response.status_code == 403
    assert gateway.requests == []


def test_service_calls_are_audited() -> None:
    audit_log = InMemoryRuntimeAuditLog()
    client = create_service_client(RecordingServiceGateway(), audit_log)

    client.post("/api/v1/ros/services/call", json=RESET_FAULT)

    [record] = [r for r in audit_log.list_records() if r.channel == "http_ros_service"]
    assert record.status == "accepted"
    assert record.target == "/fault_controller/reset_fault"


def test_capabilities_report_the_service_seam() -> None:
    client = create_service_client()

    capabilities = {c["id"]: c["available"] for c in client.get("/api/v1/capabilities").json()["capabilities"]}

    assert capabilities["service-dispatcher"] is False

    live = create_service_client(RecordingServiceGateway())
    capabilities = {c["id"]: c["available"] for c in live.get("/api/v1/capabilities").json()["capabilities"]}
    assert capabilities["service-dispatcher"] is True
