"""The Kinova's manager carries the Explorer's home pose (cartesian_manager#10), so Go home is refused there."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository, load_configuration_file
from libs.config.models import RuntimeActionPreset
from libs.ros_adapters import RosPublishReceipt, RosPublishRequest
from libs.ros_adapters.safety import KINOVA_HOME_REFUSAL, is_kinova_robot
from libs.sessions.audit import InMemoryRuntimeAuditLog

EXPLORER_FIXTURE_PATH = Path(__file__).parents[1] / "seed" / "applications" / "explorer-manager.json"
HOME = {
    "topic": "/mode_request",
    "message_type": "std_msgs/msg/String",
    "payload": {"data": "Behaviour/Joint-Target/Home"},
}


class RecordingGateway:
    def __init__(self) -> None:
        self.requests: list[RosPublishRequest] = []

    def publish(self, request: RosPublishRequest) -> RosPublishReceipt:
        self.requests.append(request)
        return RosPublishReceipt(
            detail="ok", message_type=request.message_type, status="published", topic=request.topic
        )


def explorer_with_a_home_preset():
    configuration = load_configuration_file(EXPLORER_FIXTURE_PATH)
    home = RuntimeActionPreset(
        id="home",
        name="Go home",
        command="behaviour/joint_target/home",
        topic="/mode_request",
        message_type="std_msgs/msg/String",
        payload={"data": "behaviour/joint_target/home"},
    )
    [application, *others] = configuration.applications
    application = application.model_copy(update={"action_presets": (*application.action_presets, home)})
    return configuration.model_copy(update={"applications": (application, *others)})


def make_client(robot_name: str, allow: bool = False) -> tuple[TestClient, RecordingGateway, InMemoryRuntimeAuditLog]:
    gateway = RecordingGateway()
    audit_log = InMemoryRuntimeAuditLog()
    app = create_app(
        Settings(
            environment="test",
            runtime_control_required=False,
            robot_name=robot_name,
            allow_kinova_home=allow,
            allowed_ros_publish_topics=("/mode_request", "/arm2/mode_request"),
        ),
        InMemoryConfigurationRepository({"explorer-manager": explorer_with_a_home_preset()}),
        ros_publisher_gateway=gateway,
        runtime_audit_log=audit_log,
    )
    return TestClient(app), gateway, audit_log


@pytest.mark.parametrize("name", ["Kinova Gen3", "gen3-lite", "KINOVA"])
def test_kinova_family_matches_the_frontend(name: str) -> None:
    assert is_kinova_robot(name)
    assert not is_kinova_robot("Explorer")


@pytest.mark.parametrize("topic", ["/mode_request", "/arm2/mode_request"])
def test_go_home_on_a_kinova_is_refused_on_the_topic_path(topic: str) -> None:
    client, gateway, audit_log = make_client("Kinova Gen3")

    response = client.post("/api/v1/ros/topics/publish", json=HOME | {"topic": topic})

    assert response.status_code == 422
    assert response.json()["detail"] == KINOVA_HOME_REFUSAL
    assert gateway.requests == []
    assert any(r.status == "rejected" and r.detail == KINOVA_HOME_REFUSAL for r in audit_log.list_records(20))


def test_go_home_on_a_kinova_is_refused_on_the_action_preset_path() -> None:
    client, gateway, audit_log = make_client("kinova gen3")

    response = client.post(
        "/api/v1/runtime/actions",
        json={"app_id": "explorer-manager", "command": "behaviour/joint_target/home", "config_id": "explorer-manager"},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == KINOVA_HOME_REFUSAL
    assert gateway.requests == []
    assert any(r.status == "rejected" and r.detail == KINOVA_HOME_REFUSAL for r in audit_log.list_records(20))


def test_other_joint_targets_and_modes_still_publish_on_a_kinova() -> None:
    client, gateway, _ = make_client("Kinova Gen3")

    for mode in ("behaviour/joint_target/ready", "geometric/snake"):
        assert client.post("/api/v1/ros/topics/publish", json=HOME | {"payload": {"data": mode}}).status_code == 200
    assert [r.payload["data"] for r in gateway.requests] == ["behaviour/joint_target/ready", "geometric/snake"]


@pytest.mark.parametrize(("robot_name", "allow"), [("Explorer", False), ("", False), ("Kinova Gen3", True)])
def test_go_home_still_works_on_the_explorer_and_when_allowed(robot_name: str, allow: bool) -> None:
    client, gateway, _ = make_client(robot_name, allow)

    assert client.post("/api/v1/ros/topics/publish", json=HOME).status_code == 200
    action = client.post(
        "/api/v1/runtime/actions",
        json={"app_id": "explorer-manager", "command": "behaviour/joint_target/home", "config_id": "explorer-manager"},
    )

    assert action.status_code == 200
    assert [r.payload["data"] for r in gateway.requests] == ["behaviour/joint_target/home"] * 2


def test_the_allow_setting_reads_its_env_var(monkeypatch: pytest.MonkeyPatch) -> None:
    assert Settings.from_environment().allow_kinova_home is False
    monkeypatch.setenv("BLOOM_ALLOW_KINOVA_HOME", "true")
    assert Settings.from_environment().allow_kinova_home is True
