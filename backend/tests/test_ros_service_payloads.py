"""Service calls of any allowlisted type carry a request payload, checked by the topic-publish field walker."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository, load_configuration_file
from libs.ros_adapters import RosServiceReceipt, RosServiceRequest, safety
from libs.ros_adapters.safety import RuntimePayloadShapeError, validate_service_request_payload
from libs.ros_adapters.services import MAX_RESPONSE_DETAIL_CHARS, RclpyRosServiceGateway, receipt_from_response
from libs.sessions import InMemoryRuntimeAuditLog

KINOVA_FIXTURE_PATH = Path(__file__).parents[1] / "seed" / "applications" / "kinova-manager.json"
CALL = "/api/v1/ros/services/call"
ACTIONS = "/api/v1/runtime/actions"
SERVICE = "/fault_controller/reset_fault"
SERVICE_TYPES = (
    "std_srvs/srv/Trigger",
    "example_interfaces/srv/Trigger",
    "std_srvs/srv/SetBool",
    "std_srvs/srv/Empty",
    "example_interfaces/srv/AddTwoInts",
)


def service_class(service_type: str) -> Any:
    utilities = pytest.importorskip("rosidl_runtime_py.utilities")
    try:
        return utilities.get_service(service_type)
    except (AttributeError, ModuleNotFoundError, ValueError):
        pytest.skip(f"{service_type} is not installed")


@pytest.fixture
def rosidl() -> None:
    for service_type in ("std_srvs/srv/SetBool", "std_srvs/srv/Empty", "example_interfaces/srv/AddTwoInts"):
        service_class(service_type)


class RecordingServiceGateway:
    def __init__(self) -> None:
        self.requests: list[RosServiceRequest] = []

    def call(self, request: RosServiceRequest) -> RosServiceReceipt:
        self.requests.append(request)
        return RosServiceReceipt(
            service=request.service, service_type=request.service_type, status="called", success=True, detail="ok"
        )


def make_client(
    gateway: RecordingServiceGateway, audit_log: InMemoryRuntimeAuditLog | None = None, repository: Any = None
) -> TestClient:
    return TestClient(
        create_app(
            Settings(environment="test", allowed_ros_service_calls=(SERVICE,), allowed_ros_service_types=SERVICE_TYPES),
            repository or InMemoryConfigurationRepository(),
            ros_service_gateway=gateway,
            runtime_audit_log=audit_log,
        )
    )


def call(client: TestClient, service_type: str, **body: Any) -> Any:
    return client.post(CALL, json={"service": SERVICE, "service_type": service_type, **body})


def test_set_bool_carries_its_data_field(rosidl: None) -> None:
    gateway = RecordingServiceGateway()

    response = call(make_client(gateway), "std_srvs/srv/SetBool", payload={"data": True})

    assert response.status_code == 200
    assert gateway.requests[0].payload == {"data": True}


def test_payload_text_is_parsed_like_a_topic_payload(rosidl: None) -> None:
    gateway = RecordingServiceGateway()

    response = call(make_client(gateway), "example_interfaces/srv/AddTwoInts", payload_text="a: 2\nb: 3")

    assert response.status_code == 200
    assert gateway.requests[0].payload == {"a": 2, "b": 3}


def test_trigger_without_payload_still_works() -> None:
    gateway = RecordingServiceGateway()

    response = call(make_client(gateway), "std_srvs/srv/Trigger")

    assert response.status_code == 200
    assert gateway.requests[0].payload == {}


@pytest.mark.parametrize(
    ("body", "reason"),
    [
        ({"payload": {"a": 2**63, "b": 0}}, "'a' must be an integer"),
        ({"payload": {"a": "7", "b": 0}}, "'a' must be an integer"),
        ({"payload": {"a": True, "b": 0}}, "'a' must be an integer"),
        ({"payload": {"a": 1.5, "b": 0}}, "'a' must be an integer"),
        ({"payload_text": "a: .nan\nb: 0"}, "NaN"),
        ({"payload": {"a": "nan"}}, "'a' must be an integer"),
        ({"payload": {"c": 1}}, "no field c"),
    ],
)
def test_add_two_ints_refuses_out_of_range_and_non_integer_values(
    rosidl: None, body: dict[str, Any], reason: str
) -> None:
    gateway = RecordingServiceGateway()
    audit_log = InMemoryRuntimeAuditLog()

    response = call(make_client(gateway, audit_log), "example_interfaces/srv/AddTwoInts", **body)

    assert response.status_code == 422
    assert reason in response.json()["detail"]
    assert gateway.requests == []
    [record] = [r for r in audit_log.list_records() if r.channel == "http_ros_service"]
    assert record.status == "rejected"


def test_text_in_a_bool_field_is_refused(rosidl: None) -> None:
    with pytest.raises(RuntimePayloadShapeError, match="'data' must be a boolean"):
        validate_service_request_payload("std_srvs/srv/SetBool", {"data": "false"})


def test_a_type_outside_the_allowlist_is_refused() -> None:
    gateway = RecordingServiceGateway()

    response = call(make_client(gateway), "std_srvs/srv/SetBools", payload={"data": True})

    assert response.status_code == 403
    assert gateway.requests == []


def test_a_type_without_request_fields_refuses_a_payload(rosidl: None) -> None:
    gateway = RecordingServiceGateway()
    client = make_client(gateway)

    refused = call(client, "std_srvs/srv/Empty", payload={"data": True})
    empty = call(client, "std_srvs/srv/Empty", payload={})

    assert refused.status_code == 422
    assert "takes no fields" in refused.json()["detail"]
    assert empty.status_code == 200
    assert len(gateway.requests) == 1


def test_without_rosidl_non_finite_text_is_still_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(safety, "service_request_class", lambda _service_type: None)

    with pytest.raises(RuntimePayloadShapeError, match="must be a number"):
        validate_service_request_payload("lab_msgs/srv/Move", {"speed": "-inf"})
    validate_service_request_payload("lab_msgs/srv/Move", {"speed": 0.2, "label": "home"})


def with_service_preset(message_type: str, **preset_fields: Any) -> InMemoryConfigurationRepository:
    bundle = load_configuration_file(KINOVA_FIXTURE_PATH)
    applications = []
    for app in bundle.applications:
        presets = tuple(
            preset.model_copy(update={"message_type": message_type, **preset_fields})
            if preset.kind == "service-call"
            else preset
            for preset in app.action_presets
        )
        applications.append(app.model_copy(update={"action_presets": presets}))
    return InMemoryConfigurationRepository(
        {"kinova-manager": bundle.model_copy(update={"applications": tuple(applications)})}
    )


PRESET = {"app_id": "kinova-manager", "command": "kinova.reset_fault", "config_id": "kinova-manager"}


def test_a_service_preset_sends_its_payload_text(rosidl: None) -> None:
    gateway = RecordingServiceGateway()
    audit_log = InMemoryRuntimeAuditLog()
    repository = with_service_preset("std_srvs/srv/SetBool", payload_text="data: true")

    response = make_client(gateway, audit_log, repository).post(ACTIONS, json=PRESET)

    assert response.status_code == 200
    assert gateway.requests[0].payload == {"data": True}
    [record] = [r for r in audit_log.list_records() if r.channel == "runtime_action"]
    assert record.payload_summary["fields"] == ["data"]


def test_a_service_preset_with_an_out_of_range_payload_is_an_audited_422(rosidl: None) -> None:
    gateway = RecordingServiceGateway()
    audit_log = InMemoryRuntimeAuditLog()
    repository = with_service_preset("example_interfaces/srv/AddTwoInts", payload={"a": -(2**63) - 1, "b": 1})

    response = make_client(gateway, audit_log, repository).post(ACTIONS, json=PRESET)

    assert response.status_code == 422
    assert gateway.requests == []
    [record] = [r for r in audit_log.list_records() if r.channel == "runtime_action"]
    assert record.status == "rejected"


class AddingClient:
    """An rclpy client stand-in whose server adds the two request fields."""

    def __init__(self, service_cls: Any) -> None:
        self.service_cls = service_cls

    def wait_for_service(self, timeout_sec: float) -> bool:
        return True

    def call_async(self, ros_request: Any) -> Any:
        response = self.service_cls.Response(sum=ros_request.a + ros_request.b)
        return SimpleNamespace(add_done_callback=lambda callback: callback(None), result=lambda: response)


def test_the_rclpy_gateway_builds_the_request_and_reports_the_response() -> None:
    service_class("example_interfaces/srv/AddTwoInts")
    node = SimpleNamespace(create_client=lambda cls, _name: AddingClient(cls))

    receipt = RclpyRosServiceGateway(node).call(
        RosServiceRequest(service="/add", service_type="example_interfaces/srv/AddTwoInts", payload={"a": 2, "b": 3})
    )

    assert receipt.success is None
    assert receipt.detail == 'Service /add answered: {"sum": 5}'


def test_a_success_message_response_keeps_its_own_detail() -> None:
    service_cls = service_class("std_srvs/srv/SetBool")
    response = service_cls.Response(success=False, message="gripper busy")

    receipt = receipt_from_response(RosServiceRequest("/grip", "std_srvs/srv/SetBool"), response)

    assert (receipt.success, receipt.detail) == (False, "gripper busy")


def test_a_large_response_is_cut_in_the_detail() -> None:
    service_cls = service_class("rcl_interfaces/srv/ListParameters")
    response = service_cls.Response()
    response.result.names = [f"parameter_{index:04d}" for index in range(500)]

    receipt = receipt_from_response(RosServiceRequest("/list", "rcl_interfaces/srv/ListParameters"), response)

    assert receipt.detail.startswith('Service /list answered: {"result"')
    assert len(receipt.detail) <= len("Service /list answered: ") + MAX_RESPONSE_DETAIL_CHARS
    assert receipt.detail.endswith("…")


def test_a_stale_http_service_call_is_superseded_on_its_service_name() -> None:
    gateway = RecordingServiceGateway()
    client = make_client(gateway)
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        headers = {"X-Bloom-Runtime-Session": websocket.receive_json()["session_id"]}
        body = {"service": SERVICE, "service_type": "std_srvs/srv/Trigger"}
        assert client.post(CALL, headers=headers | {"X-Bloom-Publish-Seq": "2"}, json=body).status_code == 200

        stale = client.post(CALL, headers=headers | {"X-Bloom-Publish-Seq": "1"}, json=body)

    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "superseded"
    assert len(gateway.requests) == 1
