"""Every accepted publish, parameter set, service call and server reset writes the store; a refusal writes nothing."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository, load_configuration_file
from libs.ros_adapters import RosPublishReceipt, RosPublishRequest, RosServiceReceipt, RosServiceRequest
from libs.ros_adapters.parameters import RosParameterReceipt, RosParameterRequest
from libs.sessions import RuntimeSessionManager
from libs.sessions.command_state import BY_SERVER, CommandStateStore, manager_key, session_alias

EXPLORER_FIXTURE_PATH = Path(__file__).parents[1] / "seed" / "applications" / "explorer-manager.json"
PUBLISH = "/api/v1/ros/topics/publish"
SESSION = "X-Bloom-Runtime-Session"


class RosGateway:
    def __init__(self) -> None:
        self.requests: list[RosPublishRequest] = []
        self.failing: set[str] = set()

    def publish(self, request: RosPublishRequest) -> RosPublishReceipt:
        if request.topic in self.failing:
            raise RuntimeError(f"{request.topic} is down")
        self.requests.append(request)
        return RosPublishReceipt(
            detail="ok", message_type=request.message_type, status="published", topic=request.topic
        )


class ParameterGateway:
    def __init__(self) -> None:
        self.refuse = False

    def set(self, request: RosParameterRequest) -> RosParameterReceipt:
        if self.refuse:
            raise RuntimeError("refused")
        return RosParameterReceipt(
            node=request.node, name=request.name, value=request.value, status="set", detail="Parameter set."
        )

    def get(self, node: str, names: tuple[str, ...]) -> tuple:
        return ()


class ServiceGateway:
    def __init__(self, success: bool | None = True) -> None:
        self.success = success

    def call(self, request: RosServiceRequest) -> RosServiceReceipt:
        return RosServiceReceipt(
            service=request.service,
            service_type=request.service_type,
            status="called",
            success=self.success,
            detail="done",
        )


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def make(control_required: bool = False, **gateways: Any) -> tuple[TestClient, CommandStateStore, RosGateway]:
    ros = RosGateway()
    app = create_app(
        Settings(
            environment="test",
            runtime_control_required=control_required,
            allowed_ros_service_calls=("/fault_controller/reset_fault",),
        ),
        InMemoryConfigurationRepository({"explorer-manager": load_configuration_file(EXPLORER_FIXTURE_PATH)}),
        ros_publisher_gateway=ros,
        **gateways,
    )
    return TestClient(app), app.state.command_state_store, ros


def publish(client: TestClient, topic: str, message_type: str, data: Any, headers: dict | None = None):
    return client.post(
        PUBLISH, headers=headers or {}, json={"topic": topic, "message_type": message_type, "payload": {"data": data}}
    )


def held(store: CommandStateStore, key: str) -> tuple[Any, str, str]:
    entry = store.get(key)
    assert entry is not None, key
    return entry.value, entry.source, entry.by


def test_an_accepted_publish_is_commanded_by_the_session_alias() -> None:
    client, store, _ros = make()

    response = publish(client, "/mode_request", "std_msgs/msg/String", "GEOMETRIC/SNAKE", {SESSION: "s-1"})

    assert response.status_code == 200
    assert held(store, manager_key("shaping")) == ("geometric/snake", "commanded", session_alias("s-1"))
    assert held(store, "/mode_request")[0] == {"data": "geometric/snake"}


def test_refused_publishes_write_nothing() -> None:
    client, store, ros = make()
    ros.failing.add("/gripper_controller/commands")

    assert publish(client, "/not/allowed", "std_msgs/msg/Bool", True).status_code == 403
    assert publish(client, "/mode_request", "std_msgs/msg/String", "geometric/unknown").status_code == 422
    assert publish(client, "/gripper_controller/commands", "std_msgs/msg/Float64MultiArray", [1.1]).status_code == 503
    assert client.post("/api/v1/runtime/stop").status_code == 200
    revision = store.revision
    assert publish(client, "/ui/visual_servoing/on", "std_msgs/msg/Bool", True).status_code == 409

    assert store.revision == revision
    assert store.get("/not/allowed") is None
    assert store.get("/gripper_controller/commands") is None
    assert held(store, "/ui/visual_servoing/on")[1] == "reset"


def test_stop_writes_the_resets_it_published() -> None:
    client, store, _ros = make()
    publish(client, "/mode_request", "std_msgs/msg/String", "geometric/snake")
    publish(client, "/mode_request", "std_msgs/msg/String", "behaviour/pose_target/ready")
    publish(client, "/ui/visual_servoing/on", "std_msgs/msg/Bool", True)

    assert client.post("/api/v1/runtime/stop").status_code == 200

    assert held(store, manager_key("shaping")) == ("geometric/both", "reset", BY_SERVER)
    assert held(store, manager_key("behaviour")) == ("behaviour/passthrough", "reset", BY_SERVER)
    assert held(store, manager_key("target")) == (None, "reset", BY_SERVER)
    assert held(store, "/ui/visual_servoing/on") == ({"data": False}, "reset", BY_SERVER)


def test_a_reset_that_failed_to_publish_is_not_written() -> None:
    client, store, ros = make()
    publish(client, "/ui/visual_servoing/on", "std_msgs/msg/Bool", True)
    ros.failing.add("/ui/visual_servoing/on")

    assert client.post("/api/v1/runtime/stop").status_code == 503

    assert held(store, "/ui/visual_servoing/on")[:2] == ({"data": True}, "commanded")
    assert held(store, manager_key("shaping"))[1] == "reset"


def test_an_action_preset_publish_is_recorded() -> None:
    client, store, _ros = make()

    response = client.post(
        "/api/v1/runtime/actions",
        headers={SESSION: "s-2"},
        json={"config_id": "explorer-manager", "app_id": "explorer-manager", "preset_id": "manager-release"},
    )

    assert response.status_code == 200
    assert held(store, manager_key("behaviour")) == ("behaviour/passthrough", "commanded", session_alias("s-2"))


def test_a_confirmed_parameter_set_is_measured_and_a_failed_one_writes_nothing() -> None:
    parameters = ParameterGateway()
    client, store, _ros = make(ros_parameter_gateway=parameters)
    body = {"node": "/cartesian_manager", "name": "shapers.snake.gain", "value": 0.5}

    assert client.post("/api/v1/ros/parameters/set", json=body).status_code == 200
    assert held(store, "param:/cartesian_manager:shapers.snake.gain") == (0.5, "measured", "api")

    parameters.refuse = True
    assert client.post("/api/v1/ros/parameters/set", json=body | {"value": 0.9}).status_code == 503
    assert held(store, "param:/cartesian_manager:shapers.snake.gain")[0] == 0.5


def test_a_service_call_is_recorded_unless_refused() -> None:
    services = ServiceGateway()
    client, store, _ros = make(ros_service_gateway=services)
    body = {"service": "/fault_controller/reset_fault", "service_type": "std_srvs/srv/Trigger"}

    assert client.post("/api/v1/ros/services/call", json=body).status_code == 200
    assert held(store, "service:/fault_controller/reset_fault")[:2] == ({"request": {}, "success": True}, "commanded")

    services.success = False
    revision = store.revision
    assert client.post("/api/v1/ros/services/call", json=body).status_code == 200
    assert store.revision == revision


def test_a_leaving_owner_resets_what_it_left_set() -> None:
    client, store, _ros = make(control_required=True)
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        session_id = websocket.receive_json()["session_id"]
        websocket.send_json({"type": "claim_control"})
        websocket.receive_json()
        headers = {SESSION: session_id}
        assert publish(client, "/mode_request", "std_msgs/msg/String", "geometric/snake", headers).status_code == 200
        assert publish(client, "/ui/visual_servoing/on", "std_msgs/msg/Bool", True, headers).status_code == 200

    assert held(store, manager_key("shaping")) == ("geometric/both", "reset", BY_SERVER)
    assert held(store, "/ui/visual_servoing/on") == ({"data": False}, "reset", BY_SERVER)


def test_a_stale_lease_is_reset_for_the_next_owner() -> None:
    client, store, _ros = make(control_required=True)
    clock = Clock()
    manager: RuntimeSessionManager = client.app.state.runtime_session_manager
    manager._clock = clock
    with client.websocket_connect("/api/v1/runtime/ws") as stale:
        stale_id = stale.receive_json()["session_id"]
        stale.send_json({"type": "claim_control"})
        stale.receive_json()
        publish(client, "/mode_request", "std_msgs/msg/String", "geometric/snake", {SESSION: stale_id})
        with client.websocket_connect("/api/v1/runtime/ws") as fresh:
            fresh.receive_json()
            clock.now = 60.0
            fresh.send_json({"type": "claim_control"})
            assert fresh.receive_json()["payload"]["is_owner"] is True

            assert held(store, manager_key("shaping")) == ("geometric/both", "reset", BY_SERVER)
