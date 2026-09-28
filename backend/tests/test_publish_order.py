"""ADR 0141: a session's publishes to one target are applied in the order the client issued them."""

from __future__ import annotations

import time
from pathlib import Path
from threading import Event, Thread

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository, load_configuration_file
from libs.ros_adapters import RosPublishReceipt, RosPublishRequest, RosServiceReceipt, RosServiceRequest
from libs.ros_adapters.parameters import RosParameterReceipt, RosParameterRequest
from libs.sessions import PublishSupersededError, RuntimeSessionManager
from libs.sessions.audit import InMemoryRuntimeAuditLog

EXPLORER_FIXTURE_PATH = Path(__file__).parents[1] / "seed" / "applications" / "explorer-manager.json"
KINOVA_FIXTURE_PATH = Path(__file__).parents[1] / "seed" / "applications" / "kinova-manager.json"
PUBLISH = "/api/v1/ros/topics/publish"
ACTIONS = "/api/v1/runtime/actions"


class RecordingGateway:
    def __init__(self) -> None:
        self.requests: list[RosPublishRequest] = []
        self.fail_next = False

    def publish(self, request: RosPublishRequest) -> RosPublishReceipt:
        if self.fail_next:
            self.fail_next = False
            raise RuntimeError("publisher unavailable")
        self.requests.append(request)
        return RosPublishReceipt(
            detail="ok", message_type=request.message_type, status="published", topic=request.topic
        )

    def data(self, topic: str) -> list[object]:
        return [r.payload.get("data") for r in self.requests if r.topic == topic]


def bool_msg(topic: str, value: bool) -> dict:
    return {"topic": topic, "message_type": "std_msgs/msg/Bool", "payload": {"data": value}}


def make_client() -> tuple[TestClient, RecordingGateway, InMemoryRuntimeAuditLog]:
    gateway = RecordingGateway()
    audit_log = InMemoryRuntimeAuditLog()
    app = create_app(
        Settings(environment="test", runtime_control_required=True),
        InMemoryConfigurationRepository({"explorer-manager": load_configuration_file(EXPLORER_FIXTURE_PATH)}),
        ros_publisher_gateway=gateway,
        runtime_audit_log=audit_log,
    )
    return TestClient(app), gateway, audit_log


def owner_headers(websocket) -> dict[str, str]:
    session_id = websocket.receive_json()["session_id"]
    websocket.send_json({"type": "claim_control"})
    websocket.receive_json()
    return {"X-Bloom-Runtime-Session": session_id}


def seq(value: int | str) -> dict[str, str]:
    return {"X-Bloom-Publish-Seq": str(value)}


def eventually(condition, timeout: float = 2.0) -> bool:
    deadline = time.monotonic() + timeout
    while not condition():
        if time.monotonic() > deadline:
            return False
        time.sleep(0.01)
    return True


def test_a_stale_press_after_its_release_is_refused_and_not_published() -> None:
    client, gateway, audit_log = make_client()
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        headers = owner_headers(websocket)
        assert client.post(PUBLISH, headers=headers | seq(11), json=bool_msg("/ui/grip", False)).status_code == 200

        stale = client.post(PUBLISH, headers=headers | seq(10), json=bool_msg("/ui/grip", True))

        assert stale.status_code == 409
        assert stale.json()["detail"] == {
            "code": "superseded",
            "message": "A newer command for /ui/grip was already applied.",
        }
        assert gateway.data("/ui/grip") == [False]
        [record] = [r for r in audit_log.list_records(50) if r.payload_summary.get("reason") == "superseded"]
        assert record.status == "rejected"
        assert record.topic == "/ui/grip"
        assert record.payload_summary["publish_seq"] == 10


def test_an_equal_seq_is_refused() -> None:
    client, gateway, _ = make_client()
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        headers = owner_headers(websocket)
        client.post(PUBLISH, headers=headers | seq(5), json=bool_msg("/ui/grip", True))

        response = client.post(PUBLISH, headers=headers | seq(5), json=bool_msg("/ui/grip", True))

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "superseded"
        assert gateway.data("/ui/grip") == [True]


def test_topics_are_ordered_independently() -> None:
    client, gateway, _ = make_client()
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        headers = owner_headers(websocket)
        client.post(PUBLISH, headers=headers | seq(20), json=bool_msg("/ui/grip", True))

        response = client.post(PUBLISH, headers=headers | seq(3), json=bool_msg("/ui/servo", True))

        assert response.status_code == 200
        assert gateway.data("/ui/servo") == [True]


def test_without_the_header_publishes_are_applied_as_before() -> None:
    client, gateway, _ = make_client()
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        headers = owner_headers(websocket)
        client.post(PUBLISH, headers=headers | seq(20), json=bool_msg("/ui/grip", False))

        response = client.post(PUBLISH, headers=headers, json=bool_msg("/ui/grip", True))

        assert response.status_code == 200
        assert gateway.data("/ui/grip") == [False, True]


@pytest.mark.parametrize("raw", ["abc", "1.5", ""])
def test_a_malformed_header_is_refused_422_before_publishing(raw: str) -> None:
    client, gateway, _ = make_client()
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        headers = owner_headers(websocket)

        response = client.post(PUBLISH, headers=headers | seq(raw), json=bool_msg("/ui/grip", True))
        action = client.post(
            ACTIONS,
            headers=headers | seq(raw),
            json={"app_id": "explorer-manager", "command": "geometric/both", "config_id": "explorer-manager"},
        )

        assert response.status_code == 422
        assert action.status_code == 422
        assert gateway.requests == []


def test_a_publish_the_gateway_fails_still_supersedes_older_ones() -> None:
    client, gateway, _ = make_client()
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        headers = owner_headers(websocket)
        gateway.fail_next = True
        assert client.post(PUBLISH, headers=headers | seq(7), json=bool_msg("/ui/grip", False)).status_code == 503

        # The press issued before that release, still in flight, must not land after it.
        older = client.post(PUBLISH, headers=headers | seq(6), json=bool_msg("/ui/grip", True))
        retry = client.post(PUBLISH, headers=headers | seq(8), json=bool_msg("/ui/grip", False))

        assert older.status_code == 409
        assert retry.status_code == 200
        assert gateway.data("/ui/grip") == [False]


def test_a_publish_refused_by_policy_or_stop_does_not_record_its_seq() -> None:
    client, gateway, _ = make_client()
    manager: RuntimeSessionManager = client.app.state.runtime_session_manager
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        headers = owner_headers(websocket)
        session_id = headers["X-Bloom-Runtime-Session"]
        refused = {"topic": "/not/allowed", "message_type": "std_msgs/msg/Bool", "payload": {"data": True}}
        assert client.post(PUBLISH, headers=headers | seq(7), json=refused).status_code == 403
        assert manager.last_publish_seq(session_id, "/not/allowed") is None

        client.post("/api/v1/runtime/stop")
        assert client.post(PUBLISH, headers=headers | seq(9), json=bool_msg("/ui/grip", True)).status_code == 409
        assert manager.last_publish_seq(session_id, "/ui/grip") is None


def test_a_committed_operation_that_fails_records_its_seq() -> None:
    manager = RuntimeSessionManager()
    session = manager.connect()

    def gateway_down(commit) -> None:
        commit()
        raise RuntimeError("down")

    with pytest.raises(RuntimeError):
        manager.execute_in_publish_order(session.id, "/ui/grip", 6, gateway_down)

    assert manager.last_publish_seq(session.id, "/ui/grip") == 6


def test_action_presets_are_ordered_by_their_topic_shared_with_plain_publishes() -> None:
    client, gateway, audit_log = make_client()
    body = {"app_id": "explorer-manager", "command": "geometric/both", "config_id": "explorer-manager"}
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        headers = owner_headers(websocket)
        mode = {"topic": "/mode_request", "message_type": "std_msgs/msg/String", "payload": {"data": "geometric/snake"}}
        assert client.post(PUBLISH, headers=headers | seq(30), json=mode).status_code == 200

        stale = client.post(ACTIONS, headers=headers | seq(29), json=body)
        fresh = client.post(ACTIONS, headers=headers | seq(31), json=body)

        assert stale.status_code == 409
        assert stale.json()["detail"]["code"] == "superseded"
        assert fresh.status_code == 200
        assert gateway.data("/mode_request") == ["geometric/snake", "geometric/both"]
        [record] = [r for r in audit_log.list_records(50) if r.payload_summary.get("reason") == "superseded"]
        assert record.channel == "runtime_action"
        assert record.status == "rejected"


def test_the_record_lives_with_the_session_and_is_dropped_on_disconnect() -> None:
    client, _, _ = make_client()
    manager: RuntimeSessionManager = client.app.state.runtime_session_manager
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        headers = owner_headers(websocket)
        session_id = headers["X-Bloom-Runtime-Session"]
        client.post(PUBLISH, headers=headers | seq(9), json=bool_msg("/ui/grip", True))
        client.post("/api/v1/runtime/stop")
        client.post("/api/v1/runtime/stop/resume", headers=headers)

        assert manager.last_publish_seq(session_id, "/ui/grip") == 9

    assert eventually(lambda: manager.last_publish_seq(session_id, "/ui/grip") is None)


def test_a_stale_lease_drop_forgets_the_record() -> None:
    now = [0.0]
    manager = RuntimeSessionManager(lease_timeout_sec=10.0, clock=lambda: now[0])
    stale = manager.connect()
    manager.claim_control(stale)
    manager.execute_in_publish_order(stale.id, "/ui/grip", 4, lambda _commit: None)

    now[0] = 11.0
    manager.claim_control(manager.connect())

    assert manager.last_publish_seq(stale.id, "/ui/grip") is None


def test_stop_does_not_reset_the_record() -> None:
    manager = RuntimeSessionManager()
    session = manager.connect()
    manager.execute_in_publish_order(session.id, "/ui/grip", 4, lambda _commit: None)

    manager.record_runtime_stop("/cmd")

    with pytest.raises(PublishSupersededError):
        manager.execute_in_publish_order(session.id, "/ui/grip", 3, lambda _commit: None)


def test_an_operation_refused_before_commit_leaves_the_last_applied_seq() -> None:
    manager = RuntimeSessionManager()
    session = manager.connect()
    manager.execute_in_publish_order(session.id, "/ui/grip", 4, lambda _commit: None)

    def fail(_commit) -> None:
        raise RuntimeError("down")

    with pytest.raises(RuntimeError):
        manager.execute_in_publish_order(session.id, "/ui/grip", 6, fail)

    assert manager.last_publish_seq(session.id, "/ui/grip") == 4
    with pytest.raises(PublishSupersededError):
        manager.execute_in_publish_order(session.id, "/ui/grip", 3, lambda _commit: None)


def test_a_lower_seq_arriving_while_a_higher_one_publishes_is_refused() -> None:
    manager = RuntimeSessionManager()
    session = manager.connect()
    applied: list[int] = []
    outcomes: dict[int, str] = {}
    inside, release = Event(), Event()

    def higher(_commit) -> None:
        inside.set()
        release.wait(2)
        applied.append(2)

    def run(value: int, operation) -> None:
        try:
            manager.execute_in_publish_order(session.id, "/ui/grip", value, operation)
            outcomes[value] = "applied"
        except PublishSupersededError:
            outcomes[value] = "superseded"

    first = Thread(target=run, args=(2, higher))
    first.start()
    assert inside.wait(2)
    second = Thread(target=run, args=(1, lambda _commit: applied.append(1)))
    second.start()
    time.sleep(0.05)
    release.set()
    first.join(2)
    second.join(2)

    assert applied == [2]
    assert outcomes == {2: "applied", 1: "superseded"}


def test_the_header_is_allowed_cross_origin() -> None:
    client, _, _ = make_client()
    response = client.options(
        PUBLISH,
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-bloom-publish-seq",
        },
    )
    assert "x-bloom-publish-seq" in response.headers["access-control-allow-headers"].lower()


class RecordingServiceGateway:
    def __init__(self) -> None:
        self.requests: list[RosServiceRequest] = []

    def call(self, request: RosServiceRequest) -> RosServiceReceipt:
        self.requests.append(request)
        return RosServiceReceipt(
            service=request.service, service_type=request.service_type, status="called", success=True, detail="ok"
        )


def test_a_service_preset_is_ordered_by_its_service_name() -> None:
    gateway = RecordingServiceGateway()
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository({"kinova-manager": load_configuration_file(KINOVA_FIXTURE_PATH)}),
            ros_service_gateway=gateway,
        )
    )
    body = {"app_id": "kinova-manager", "command": "kinova.reset_fault", "config_id": "kinova-manager"}
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        headers = {"X-Bloom-Runtime-Session": websocket.receive_json()["session_id"]}
        assert client.post(ACTIONS, headers=headers | seq(2), json=body).status_code == 200

        stale = client.post(ACTIONS, headers=headers | seq(1), json=body)

        assert stale.status_code == 409
        assert stale.json()["detail"]["code"] == "superseded"
        assert "/fault_controller/reset_fault" in stale.json()["detail"]["message"]
        assert len(gateway.requests) == 1


class RecordingParameterGateway:
    def __init__(self) -> None:
        self.values: list[object] = []

    def set(self, request: RosParameterRequest) -> RosParameterReceipt:
        self.values.append(request.value)
        return RosParameterReceipt(
            node=request.node, name=request.name, value=request.value, status="set", detail="Parameter set."
        )

    def get(self, node: str, names: tuple[str, ...]) -> tuple:
        return ()


PARAMETER_SET = "/api/v1/ros/parameters/set"
SNAKE_GAIN = {"node": "/cartesian_manager", "name": "shapers.snake.gain"}


def make_parameter_client() -> tuple[TestClient, RecordingParameterGateway, InMemoryRuntimeAuditLog]:
    gateway = RecordingParameterGateway()
    audit_log = InMemoryRuntimeAuditLog()
    app = create_app(
        Settings(environment="test", runtime_control_required=True),
        InMemoryConfigurationRepository(),
        ros_parameter_gateway=gateway,
        runtime_audit_log=audit_log,
    )
    return TestClient(app), gateway, audit_log


def test_a_stale_parameter_set_after_a_newer_one_is_refused_and_not_applied() -> None:
    client, gateway, audit_log = make_parameter_client()
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        headers = owner_headers(websocket)
        fresh = client.post(PARAMETER_SET, headers=headers | seq(21), json=SNAKE_GAIN | {"value": 2.0})

        stale = client.post(PARAMETER_SET, headers=headers | seq(20), json=SNAKE_GAIN | {"value": 4.0})

        assert fresh.status_code == 200
        assert stale.status_code == 409
        assert stale.json()["detail"]["code"] == "superseded"
        assert gateway.values == [2.0]
        [record] = [r for r in audit_log.list_records(50) if r.payload_summary.get("reason") == "superseded"]
        assert record.channel == "http_ros_parameter"
        assert record.target == "/cartesian_manager:shapers.snake.gain"
        assert record.payload_summary["publish_seq"] == 20


def test_parameters_are_ordered_per_node_and_name() -> None:
    client, gateway, _ = make_parameter_client()
    manager: RuntimeSessionManager = client.app.state.runtime_session_manager
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        headers = owner_headers(websocket)
        client.post(PARAMETER_SET, headers=headers | seq(40), json=SNAKE_GAIN | {"value": 2.0})

        other = client.post(
            PARAMETER_SET, headers=headers | seq(3), json={"node": "/cartesian_manager", "name": "other", "value": 1.0}
        )

        session_id = headers["X-Bloom-Runtime-Session"]
        assert manager.last_publish_seq(session_id, "/cartesian_manager:shapers.snake.gain") == 40
        assert other.status_code != 409


def test_a_malformed_seq_on_a_parameter_set_is_refused() -> None:
    client, gateway, _ = make_parameter_client()
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        headers = owner_headers(websocket)

        response = client.post(PARAMETER_SET, headers=headers | seq("soon"), json=SNAKE_GAIN | {"value": 2.0})

        assert response.status_code == 422
        assert gateway.values == []
