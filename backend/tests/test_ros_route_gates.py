"""The publish, parameter and service routes refuse at each gate with the status the client acts on."""

from __future__ import annotations

from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters import RosServiceReceipt, RosServiceRequest
from libs.ros_adapters.parameters import RosParameterReading, RosParameterReceipt, RosParameterRequest
from libs.sessions import InMemoryRuntimeAuditLog, RuntimeCommandRateLimiter
from tests.conftest import FAULT_RESET_SERVICE, kinova_with_a_fault_reset_preset

PUBLISH = "/api/v1/ros/topics/publish"
PARAMETERS = "/api/v1/ros/parameters"
PARAMETER_SET = "/api/v1/ros/parameters/set"
SERVICE_CALL = "/api/v1/ros/services/call"
RESET_FAULT = {"service": FAULT_RESET_SERVICE, "service_type": "example_interfaces/srv/Trigger"}
SNAKE_GAIN = {"node": "/cartesian_manager", "name": "shapers.snake.gain"}


class ServiceGateway:
    def __init__(self, error: Exception | None = None) -> None:
        self.requests: list[RosServiceRequest] = []
        self.error = error

    def call(self, request: RosServiceRequest) -> RosServiceReceipt:
        if self.error is not None:
            raise self.error
        self.requests.append(request)
        return RosServiceReceipt(
            service=request.service, service_type=request.service_type, status="called", success=True, detail="ok"
        )


class ParameterGateway:
    def __init__(self, error: Exception | None = None) -> None:
        self.values: list[object] = []
        self.error = error

    def set(self, request: RosParameterRequest) -> RosParameterReceipt:
        self.values.append(request.value)
        return RosParameterReceipt(node=request.node, name=request.name, value=request.value, status="set", detail="")

    def get(self, node: str, names: tuple[str, ...]) -> tuple[RosParameterReading, ...]:
        if self.error is not None:
            raise self.error
        return tuple(RosParameterReading(node=node, name=name, value=1.0) for name in names)


class Clock:
    now = 0.0

    def __call__(self) -> float:
        return self.now


def make(
    *,
    service_gateway: ServiceGateway | None = None,
    parameter_gateway: ParameterGateway | None = None,
    rate_limiter: RuntimeCommandRateLimiter | None = None,
) -> tuple[TestClient, InMemoryRuntimeAuditLog]:
    audit_log = InMemoryRuntimeAuditLog()
    app = create_app(
        Settings(environment="test", allowed_ros_service_calls=(FAULT_RESET_SERVICE,)),
        InMemoryConfigurationRepository({"kinova-manager": kinova_with_a_fault_reset_preset()}),
        ros_service_gateway=service_gateway,
        ros_parameter_gateway=parameter_gateway,
        runtime_audit_log=audit_log,
        runtime_command_rate_limiter=rate_limiter,
    )
    return TestClient(app), audit_log


def seq(value: int) -> dict[str, str]:
    return {"X-Bloom-Publish-Seq": str(value)}


def rejected(audit_log: InMemoryRuntimeAuditLog, channel: str):
    return [r for r in audit_log.list_records(50) if r.channel == channel and r.status == "rejected"]


def test_a_stale_direct_service_call_is_superseded_and_audited_with_its_seq() -> None:
    gateway = ServiceGateway()
    client, audit_log = make(service_gateway=gateway)
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        headers = {"X-Bloom-Runtime-Session": websocket.receive_json()["session_id"]}
        assert client.post(SERVICE_CALL, headers=headers | seq(5), json=RESET_FAULT).status_code == 200

        stale = client.post(SERVICE_CALL, headers=headers | seq(4), json=RESET_FAULT)

    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "superseded"
    assert len(gateway.requests) == 1
    [record] = [r for r in rejected(audit_log, "http_ros_service") if r.payload_summary.get("reason") == "superseded"]
    assert record.payload_summary["publish_seq"] == 4
    assert record.target == FAULT_RESET_SERVICE


def test_service_calls_have_their_own_rate_limit() -> None:
    gateway = ServiceGateway()
    client, audit_log = make(
        service_gateway=gateway, rate_limiter=RuntimeCommandRateLimiter(max_commands_per_second=1, clock=Clock())
    )

    assert client.post(SERVICE_CALL, json=RESET_FAULT).status_code == 200
    limited = client.post(SERVICE_CALL, json=RESET_FAULT)

    assert limited.status_code == 429
    assert len(gateway.requests) == 1
    assert rejected(audit_log, "http_ros_service")[0].target == FAULT_RESET_SERVICE


def test_parameter_sets_have_their_own_rate_limit() -> None:
    gateway = ParameterGateway()
    client, audit_log = make(
        parameter_gateway=gateway, rate_limiter=RuntimeCommandRateLimiter(max_commands_per_second=1, clock=Clock())
    )

    assert client.post(PARAMETER_SET, json=SNAKE_GAIN | {"value": 2.0}).status_code == 200
    limited = client.post(PARAMETER_SET, json=SNAKE_GAIN | {"value": 3.0})

    assert limited.status_code == 429
    assert gateway.values == [2.0]
    assert rejected(audit_log, "http_ros_parameter")[0].target == "/cartesian_manager:shapers.snake.gain"


def test_a_service_request_text_that_does_not_parse_is_refused_before_the_gateway() -> None:
    gateway = ServiceGateway()
    client, audit_log = make(service_gateway=gateway)

    response = client.post(SERVICE_CALL, json=RESET_FAULT | {"payload_text": "{data: [1, 2"})

    assert response.status_code == 422
    assert gateway.requests == []
    assert rejected(audit_log, "http_ros_service")


def test_a_service_that_refuses_its_request_is_a_422_not_a_gateway_failure() -> None:
    client, audit_log = make(service_gateway=ServiceGateway(error=ValueError("request field 'x' unknown")))

    response = client.post(SERVICE_CALL, json=RESET_FAULT)

    assert response.status_code == 422
    assert "request field 'x' unknown" in response.json()["detail"]
    assert rejected(audit_log, "http_ros_service")[0].detail == "request field 'x' unknown"


def test_reading_parameters_from_a_node_that_is_down_is_a_503() -> None:
    client, _ = make(parameter_gateway=ParameterGateway(error=RuntimeError("/cartesian_manager does not answer")))

    response = client.get(PARAMETERS, params={"node": "/cartesian_manager", "names": "shapers.snake.gain,"})

    assert response.status_code == 503
    assert "does not answer" in response.json()["detail"]


def test_a_message_type_must_name_its_package_and_hold_no_whitespace() -> None:
    client, _ = make()
    for message_type in ("Bool", "std_msgs/msg/ Bool"):
        response = client.post(
            PUBLISH, json={"topic": "/ui/ros_toggle", "message_type": message_type, "payload": {"data": True}}
        )
        assert response.status_code == 422, message_type
    padded = client.post(
        PUBLISH, json={"topic": "/ui/ros_toggle", "message_type": " std_msgs/msg/Bool ", "payload": {"data": True}}
    )
    assert padded.status_code == 200
    assert padded.json()["message_type"] == "std_msgs/msg/Bool"


def test_a_publish_with_neither_payload_nor_text_sends_nothing_a_std_msg_can_hold() -> None:
    client, _ = make()

    response = client.post(PUBLISH, json={"topic": "/ui/ros_toggle", "message_type": "std_msgs/msg/Bool"})

    assert response.status_code == 422
    assert "must include a 'data' field" in response.json()["detail"]


def test_a_service_type_must_use_srv_notation_without_whitespace() -> None:
    client, _ = make(service_gateway=ServiceGateway())
    for service_type in ("example_interfaces/Trigger", "example_interfaces/srv/ Trigger"):
        response = client.post(SERVICE_CALL, json=RESET_FAULT | {"service_type": service_type})
        assert response.status_code == 422, service_type


def test_a_parameter_name_with_spaces_is_refused() -> None:
    gateway = ParameterGateway()
    client, _ = make(parameter_gateway=gateway)

    response = client.post(PARAMETER_SET, json={"node": "/cartesian_manager", "name": "snake gain", "value": 1.0})

    assert response.status_code == 422
    assert gateway.values == []


def test_a_service_call_with_both_payload_forms_is_refused_before_anything_runs() -> None:
    gateway = ServiceGateway()
    client, _ = make(service_gateway=gateway)

    response = client.post(SERVICE_CALL, json=RESET_FAULT | {"payload": {}, "payload_text": "{}"})

    assert response.status_code == 422
    assert gateway.requests == []


def test_a_service_request_the_type_cannot_carry_is_refused_and_audited() -> None:
    # A Trigger takes no fields; with rosidl the field is unknown, without it the text is a NaN in disguise.
    gateway = ServiceGateway()
    client, audit_log = make(service_gateway=gateway)

    response = client.post(SERVICE_CALL, json=RESET_FAULT | {"payload": {"level": "nan"}})

    assert response.status_code == 422
    assert "request" in response.json()["detail"]
    assert gateway.requests == []
    assert rejected(audit_log, "http_ros_service")[0].target == FAULT_RESET_SERVICE
