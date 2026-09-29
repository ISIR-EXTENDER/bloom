"""Save the hand's pose with a saved position, and send it back to cartesian_manager's pose target."""

from __future__ import annotations

import math
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository, load_configuration_file
from libs.ros_adapters import RosPublishReceipt, RosPublishRequest
from libs.sessions.go_to import GO_KEY
from libs.sessions.positions import CartesianPose
from libs.sessions.stop import CANCEL_MODE_REQUEST

SEED_DIR = Path(__file__).parents[1] / "seed" / "applications"
MANAGER = "/cartesian_manager"
JOINTS = ["joint_1", "joint_2", "joint_3", "joint_4", "joint_5", "joint_6"]
HOME = [2.5, 0.3, -2.4, 2.97, 1.2, -0.5]
HAND = {"frame_id": "base_link", "position": [0.6, 0.27, 0.22], "orientation": [0.0, 0.0, 0.0, 1.0]}
EXPLORER = {"config_id": "explorer-manager", "app_id": "explorer-manager"}
KINOVA = {"config_id": "kinova-manager", "app_id": "kinova-manager"}
SANDBOX = {"config_id": "sandbox", "app_id": "sandbox"}
URL = "/api/v1/runtime/positions"


class RecordingGateway:
    def __init__(self) -> None:
        self.requests: list[RosPublishRequest] = []

    def publish(self, request: RosPublishRequest) -> RosPublishReceipt:
        self.requests.append(request)
        return RosPublishReceipt(
            detail="ok", message_type=request.message_type, status="published", topic=request.topic
        )

    def on(self, topic: str) -> list[RosPublishRequest]:
        return [request for request in self.requests if request.topic == topic]

    def cancels(self) -> list[RosPublishRequest]:
        return [r for r in self.on("/mode_request") if r.payload == {"data": CANCEL_MODE_REQUEST}]


class TipSource:
    """The measured tip, as TF would give it."""

    def __init__(self, pose: CartesianPose | None) -> None:
        self.pose = pose
        self.asked: list[tuple[str, str]] = []

    def lookup(self, base_frame: str, tip_frame: str) -> CartesianPose | None:
        self.asked.append((base_frame, tip_frame))
        return self.pose


def make_client(*, control: bool = False, **settings: object) -> tuple[TestClient, RecordingGateway]:
    gateway = RecordingGateway()
    repository = InMemoryConfigurationRepository(
        {
            config_id: load_configuration_file(SEED_DIR / f"{config_id}.json")
            for config_id in ("explorer-manager", "kinova-manager", "widget-lab", "sandbox")
        }
    )
    app = create_app(
        Settings(environment="test", runtime_control_required=control, **settings),
        repository,
        ros_publisher_gateway=gateway,
    )
    return TestClient(app), gateway


def arm_is_live(
    client: TestClient,
    hand: dict = HAND,
    joints: list[str] = JOINTS,
    base_frame: str | None = "base_link",
    tip_frame: str | None = None,
) -> None:
    """What the backend's own subscriptions and parameter reads give it on a running arm."""
    tracker = client.app.state.command_state_tracker
    tracker.record_ee_pose(hand["frame_id"], tuple(hand["position"]), tuple(hand["orientation"]))
    tracker.record_joint_states(joints, [0.0] * len(joints))
    if base_frame is not None:
        tracker.record_parameter(MANAGER, "frames.base_frame", base_frame)
    if tip_frame is not None:
        tracker.record_parameter("/qontrol_explorer", "tip_frame", tip_frame)


def save(client: TestClient, name: str | None = "pose_1", hand: dict | None = HAND, scope: dict = EXPLORER):
    body = {
        "joint_names": JOINTS,
        "positions": HOME,
        **({"name": name} if name else {}),
        **({"ee_pose": hand} if hand else {}),
    }
    return client.post(URL, json=body, params=scope)


def fingerprint(client: TestClient, name: str = "pose_1", scope: dict = EXPLORER) -> str:
    listed = client.get(URL, params=scope).json()["positions"]
    return next(pose for pose in listed if pose["name"] == name)["ee_pose"]["fingerprint"]


def go(client: TestClient, name: str = "pose_1", scope: dict = EXPLORER, session: str = "", print_: str = ""):
    headers = {"X-Bloom-Runtime-Session": session} if session else {}
    body = {"fingerprint": print_ or fingerprint(client, name, scope)}
    return client.post(f"{URL}/{name}/go", params=scope, headers=headers, json=body)


def eventually(condition, timeout: float = 2.0) -> bool:
    deadline = time.monotonic() + timeout
    while not condition():
        if time.monotonic() > deadline:
            return False
        time.sleep(0.01)
    return True


def last_refusal(client: TestClient) -> str:
    records = client.app.state.runtime_audit_log.list_records(10)
    return next(record.detail for record in reversed(records) if record.channel == "runtime_positions")


# Saving: the server's own /ee_pose, checked


def test_a_save_stores_the_servers_live_hand_pose_not_the_tablets() -> None:
    client, _ = make_client()
    arm_is_live(client, hand={**HAND, "position": [0.6, 0.27, 0.225]})

    response = save(client)
    assert response.status_code == 200
    stored = response.json()["ee_pose"]
    assert stored["position"] == [0.6, 0.27, 0.225]
    assert stored["verified"] is False
    assert len(stored["fingerprint"]) == 16


def test_a_tablets_hand_pose_far_from_the_live_one_is_refused() -> None:
    client, _ = make_client()
    arm_is_live(client, hand={**HAND, "position": [0.6, 0.27, 0.25]})

    response = save(client)
    assert response.status_code == 409
    assert "moved while saving" in response.json()["detail"]


def test_a_hand_pose_with_no_live_ee_pose_is_refused() -> None:
    client, _ = make_client()

    assert save(client).status_code == 409


def test_a_joints_only_save_needs_no_hand_pose() -> None:
    client, _ = make_client()

    response = save(client, hand=None)
    assert response.status_code == 200
    assert response.json()["ee_pose"] is None


def test_a_hand_pose_past_the_arms_reach_is_refused() -> None:
    client, _ = make_client()
    far = {**HAND, "position": [1.0, 0.8, 0.5]}
    arm_is_live(client, hand=far)

    response = save(client, hand=far)
    assert response.status_code == 422
    assert "past the arm's reach" in response.json()["detail"]


def test_a_save_where_the_measured_tip_disagrees_with_the_commanded_pose_is_refused() -> None:
    client, _ = make_client()
    arm_is_live(client, tip_frame="ft_frame")
    client.app.state.tip_pose_source = TipSource(CartesianPose("base_link", (0.6, 0.27, 0.245), (0.0, 0.0, 0.0, 1.0)))

    response = save(client)
    assert response.status_code == 409
    assert response.json()["detail"] == (
        "The arm is not where it was commanded (in contact or lagging): move it free and save again."
    )


def test_a_save_the_measured_tip_confirms_is_verified() -> None:
    client, _ = make_client()
    arm_is_live(client, tip_frame="ft_frame")
    tip = TipSource(CartesianPose("base_link", (0.6, 0.27, 0.224), (0.0, 0.0, 0.0, 1.0)))
    client.app.state.tip_pose_source = tip

    response = save(client)
    assert response.json()["ee_pose"]["verified"] is True
    assert tip.asked == [("base_link", "ft_frame")]


@pytest.mark.parametrize(
    ("tip_z", "tip_orientation", "status"),
    [
        # Small tracking error saves: 1.5 cm and 0.08 rad are inside the 2 cm / 0.1 rad band.
        (0.235, (0.0, 0.0, 0.0, 1.0), 200),
        (0.22, (0.0, 0.0, math.sin(0.04), math.cos(0.04)), 200),
        # Contact or gross lag does not: 2.5 cm, or 0.12 rad.
        (0.245, (0.0, 0.0, 0.0, 1.0), 409),
        (0.22, (0.0, 0.0, math.sin(0.06), math.cos(0.06)), 409),
    ],
)
def test_the_save_band_is_two_centimetres_and_a_tenth_of_a_radian(
    tip_z: float, tip_orientation: tuple[float, float, float, float], status: int
) -> None:
    client, _ = make_client()
    arm_is_live(client, tip_frame="ft_frame")
    client.app.state.tip_pose_source = TipSource(CartesianPose("base_link", (0.6, 0.27, tip_z), tip_orientation))

    assert save(client).status_code == status


def test_the_save_band_is_a_deployment_setting() -> None:
    client, _ = make_client(pose_save_max_offset_m=0.005)
    arm_is_live(client, tip_frame="ft_frame")
    client.app.state.tip_pose_source = TipSource(CartesianPose("base_link", (0.6, 0.27, 0.23), (0.0, 0.0, 0.0, 1.0)))

    assert save(client).status_code == 409


@pytest.mark.parametrize(
    "hand",
    [
        {**HAND, "orientation": [0.0, 0.0, 0.0, 0.0]},
        {**HAND, "frame_id": "base link"},
        {**HAND, "frame_id": ""},
        {**HAND, "position": [0.6, 0.27]},
        {**HAND, "orientation": [0.0, 0.0, 1.0]},
    ],
)
def test_a_hand_pose_the_manager_would_refuse_is_refused_here(hand: dict) -> None:
    client, _ = make_client()
    arm_is_live(client)

    assert save(client, hand=hand).status_code == 422


def test_the_server_names_a_nameless_save_and_refuses_a_name_already_held() -> None:
    client, _ = make_client()
    arm_is_live(client)

    assert save(client, name=None).json()["name"] == "pose_1"
    assert save(client, name=None).json()["name"] == "pose_2"
    assert save(client, name="pose_1").status_code == 409


# Go to


def test_go_to_sends_the_saved_hand_pose_as_a_pose_stamped_on_the_managers_pose_target() -> None:
    client, gateway = make_client()
    arm_is_live(client)
    save(client)

    response = go(client)

    assert response.status_code == 200, response.json()
    assert response.json() == {"name": "pose_1", "topic": "/pose_target", "status": "published", "detail": "ok"}
    [sent] = gateway.on("/pose_target")
    assert sent.message_type == "geometry_msgs/msg/PoseStamped"
    assert sent.payload == {
        "header": {"frame_id": "base_link"},
        "pose": {"position": {"x": 0.6, "y": 0.27, "z": 0.22}, "orientation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}},
    }


def test_go_to_follows_the_topic_the_manager_reports() -> None:
    client, gateway = make_client()
    arm_is_live(client)
    client.app.state.command_state_tracker.record_parameter(MANAGER, "topics.pose_target", "/arm/pose_target")
    save(client)

    assert go(client).status_code == 200
    assert len(gateway.on("/arm/pose_target")) == 1


def test_go_to_is_recorded_and_followed_until_the_manager_reports_otherwise() -> None:
    client, _ = make_client()
    arm_is_live(client)
    save(client)
    go(client)

    store = client.app.state.command_state_store
    assert store.get("manager:behaviour").value == "behaviour/pose_target"
    assert store.get(GO_KEY).value["state"] == "going"
    assert store.get(GO_KEY).value["name"] == "pose_1"


def test_go_to_needs_the_fingerprint_of_the_pose_it_showed() -> None:
    client, gateway = make_client()
    arm_is_live(client)
    save(client)

    response = go(client, print_="0000000000000000")
    assert response.status_code == 409
    assert "changed since it was shown" in response.json()["detail"]
    assert gateway.on("/pose_target") == []


def test_go_to_waits_for_the_managers_base_frame() -> None:
    client, gateway = make_client()
    arm_is_live(client)
    save(client)
    client.app.state.command_state_tracker.record_parameter(MANAGER, "frames.base_frame", None)

    response = go(client)
    assert response.status_code == 409
    assert "has not reported its base frame" in response.json()["detail"]
    assert gateway.on("/pose_target") == []


def test_a_pose_saved_outside_the_managers_base_frame_is_refused_with_the_reason() -> None:
    client, gateway = make_client()
    arm_is_live(client, hand={**HAND, "frame_id": "world"}, base_frame="base_link")
    save(client, hand={**HAND, "frame_id": "world"})

    response = go(client)
    assert response.status_code == 422
    assert response.json()["detail"] == (
        "'pose_1' was saved in frame 'world', but cartesian_manager takes a pose target only in its base frame "
        "'base_link'"
    )
    assert gateway.on("/pose_target") == []


def test_a_leading_slash_is_the_same_frame_on_both_sides() -> None:
    client, gateway = make_client()
    arm_is_live(client, hand={**HAND, "frame_id": "/base_link"}, base_frame="/base_link")
    save(client, hand={**HAND, "frame_id": "/base_link"})

    assert go(client).status_code == 200
    [sent] = gateway.on("/pose_target")
    assert sent.payload["header"] == {"frame_id": "base_link"}


def test_go_to_waits_for_live_joint_states_and_refuses_another_arms_pose() -> None:
    client, gateway = make_client()
    arm_is_live(client)
    save(client)
    client.app.state.command_state_tracker.record_joint_states(["j1", "j2"], [0.0, 0.0])

    response = go(client)
    assert response.status_code == 409
    assert "saved on another arm" in response.json()["detail"]
    assert gateway.on("/pose_target") == []


def test_an_unknown_pose_is_not_found_and_refused_in_the_audit_log() -> None:
    client, gateway = make_client()
    arm_is_live(client)
    save(client)

    response = go(client, "nowhere", print_="x")
    assert response.status_code == 404
    assert last_refusal(client) == "no saved position named 'nowhere'"
    assert gateway.on("/pose_target") == []


def test_a_pose_saved_without_the_hand_cannot_be_gone_to() -> None:
    client, gateway = make_client()
    save(client, hand=None)

    response = client.post(f"{URL}/pose_1/go", params=EXPLORER, json={"fingerprint": "x"})
    assert response.status_code == 422
    assert "without the hand's pose" in response.json()["detail"]
    assert gateway.on("/pose_target") == []


def test_go_to_is_refused_while_stopped_and_audited() -> None:
    client, gateway = make_client()
    arm_is_live(client)
    save(client)
    assert client.post("/api/v1/runtime/stop").status_code == 200

    response = go(client)
    assert response.status_code == 409
    assert gateway.on("/pose_target") == []
    assert "stop" in last_refusal(client).lower()


def test_go_to_is_refused_by_an_app_that_offers_no_go_to() -> None:
    client, gateway = make_client()
    arm_is_live(client)
    assert save(client, scope=SANDBOX).status_code == 200

    response = go(client, scope=SANDBOX)
    assert response.status_code == 403
    assert "offers no Go to" in response.json()["detail"]
    assert gateway.on("/pose_target") == []


def test_go_to_needs_the_robots_owner() -> None:
    client, gateway = make_client(control=True)
    arm_is_live(client)
    save(client)

    assert go(client, session="not-a-session").status_code == 409
    assert gateway.on("/pose_target") == []


def test_go_to_is_not_the_kinova_named_pose_target_refusal() -> None:
    # The refusal is about the Explorer's configured poses the Kinova's manager loads; a saved pose is the
    # Kinova's own hand pose, taken from its own /ee_pose.
    client, gateway = make_client(robot_name="kinova-gen3")
    joints = [*JOINTS, "joint_7"]
    arm_is_live(client, joints=joints)
    body = {"name": "pose_1", "joint_names": joints, "positions": [*HOME, 0.0], "ee_pose": HAND}
    assert client.post(URL, json=body, params=KINOVA).status_code == 200

    assert go(client, scope=KINOVA).status_code == 200
    assert len(gateway.on("/pose_target")) == 1


def test_go_to_names_a_pose_of_the_app_the_session_runs() -> None:
    client, gateway = make_client(control=True)
    arm_is_live(client)
    save(client)

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        session_id = websocket.receive_json()["session_id"]
        websocket.send_json({"type": "claim_control"})
        websocket.receive_json()
        websocket.send_json({"type": "app_context", **KINOVA})
        websocket.receive_json()
        assert go(client, session=session_id).status_code == 409
        assert "runs another app" in last_refusal(client)
        assert gateway.on("/pose_target") == []


def test_the_owner_leaving_cancels_the_pose_target_it_started() -> None:
    client, gateway = make_client(control=True)
    arm_is_live(client)
    save(client)

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        session_id = websocket.receive_json()["session_id"]
        websocket.send_json({"type": "claim_control"})
        websocket.receive_json()
        websocket.send_json({"type": "app_context", **EXPLORER})
        websocket.receive_json()
        assert go(client, session=session_id).status_code == 200
        assert gateway.cancels() == []

    assert eventually(lambda: len(gateway.cancels()) == 1)


def test_stop_cancels_a_pose_target_in_progress() -> None:
    client, gateway = make_client()
    arm_is_live(client)
    save(client)
    go(client)

    client.post("/api/v1/runtime/stop")
    assert len(gateway.cancels()) == 1


def test_the_librarys_cancel_sends_passthrough_even_while_stopped() -> None:
    client, gateway = make_client()
    arm_is_live(client)
    save(client)
    go(client)
    client.post("/api/v1/runtime/stop")

    response = client.post(f"{URL}/cancel")
    assert response.status_code == 200
    assert len(gateway.cancels()) == 2


# The generic publish never sends a pose target


@pytest.mark.parametrize("topic", ["/pose_target", "pose_target", "/pose_target/"])
def test_the_generic_publish_refuses_the_pose_target_for_every_app(topic: str) -> None:
    client, gateway = make_client(allowed_ros_publish_topics=("*",), allowed_ros_message_types=("*",))
    body = {
        "topic": topic,
        "message_type": "geometry_msgs/msg/PoseStamped",
        "payload": {"header": {"frame_id": "base_link"}, "pose": {"position": {"x": 0.6}}},
    }

    response = client.post("/api/v1/ros/topics/publish", json=body)
    assert response.status_code in (403, 422)
    assert gateway.on("/pose_target") == []


def test_a_latched_stop_answers_409_before_the_payload_is_read() -> None:
    client, _ = make_client()
    client.post("/api/v1/runtime/stop")
    body = {"topic": "/mode_request", "message_type": "std_msgs/msg/String", "payload_text": "{not yaml"}

    response = client.post("/api/v1/ros/topics/publish", json=body)
    assert response.status_code == 409


# Rename, delete, export


def test_a_pose_is_renamed_in_place_to_a_name_the_manager_can_reach() -> None:
    client, _ = make_client()
    arm_is_live(client)
    save(client, "pose_1")
    save(client, "pose_2")

    response = client.put(f"{URL}/pose_1/name", json={"name": "Pick-Up"}, params=EXPLORER)

    assert response.status_code == 200
    assert [pose["name"] for pose in response.json()["positions"]] == ["pick_up", "pose_2"]
    assert response.json()["positions"][0]["ee_pose"]["position"] == HAND["position"]


def test_a_rename_onto_another_pose_is_a_conflict() -> None:
    client, _ = make_client()
    save(client, "pose_1", hand=None)
    save(client, "pose_2", hand=None)

    assert client.put(f"{URL}/pose_1/name", json={"name": "pose_2"}, params=EXPLORER).status_code == 409


@pytest.mark.parametrize("name", ["pick up", "a/b", "x" * 65, ""])
def test_a_name_the_manager_cannot_reach_is_refused(name: str) -> None:
    client, _ = make_client()
    save(client, hand=None)

    assert client.put(f"{URL}/pose_1/name", json={"name": name}, params=EXPLORER).status_code == 422


def test_renaming_an_unknown_pose_is_not_found() -> None:
    client, _ = make_client()

    assert client.put(f"{URL}/nowhere/name", json={"name": "home"}, params=EXPLORER).status_code == 404


def test_the_pose_being_gone_to_cannot_be_deleted_or_renamed() -> None:
    client, _ = make_client()
    arm_is_live(client)
    save(client)
    go(client)

    assert client.delete(f"{URL}/pose_1", params=EXPLORER).status_code == 409
    assert client.put(f"{URL}/pose_1/name", json={"name": "other"}, params=EXPLORER).status_code == 409


def test_the_export_carries_the_pose_targets_block_for_saved_hand_poses() -> None:
    client, _ = make_client()
    arm_is_live(client)
    save(client)

    yaml = client.get(f"{URL}/export", params=EXPLORER).json()["yaml"]
    assert "joint_targets:" in yaml
    assert "pose_targets:" in yaml
    assert "target_names: [pose_1]" in yaml
    assert "frame_ids: [base_link]" in yaml
    assert "positions: [0.6000, 0.2700, 0.2200]" in yaml


def test_the_shipped_apps_that_offer_go_to_say_so_in_a_library() -> None:
    client, _ = make_client()
    for config_id in ("explorer-manager", "kinova-manager", "widget-lab"):
        application = client.app.state.configuration_repository.get(config_id).applications[0]
        assert "/pose_target" not in application.runtime_policy.allowed_publish_topics
        libraries = [w for s in application.screens for w in s.widgets if w.kind == "position-library"]
        assert any(widget.settings.get("go_to") is True for widget in libraries)


def test_the_quaternion_is_stored_unit_length() -> None:
    client, _ = make_client()
    hand = {**HAND, "orientation": [1.0, 1.0, 1.0, 1.0]}
    arm_is_live(client, hand=hand)
    save(client, hand=hand)

    orientation = client.get(URL, params=EXPLORER).json()["positions"][0]["ee_pose"]["orientation"]
    assert math.isclose(sum(value * value for value in orientation), 1.0)


def test_arrival_is_judged_on_the_measured_tip_when_tf_has_it() -> None:
    client, _ = make_client()
    arm_is_live(client, tip_frame="ft_frame")
    tip = TipSource(CartesianPose("base_link", (0.6, 0.27, 0.22), (0.0, 0.0, 0.0, 1.0)))
    client.app.state.tip_pose_source = tip
    save(client)
    # The commanded pose is back at the target; the measured tip hangs 5 cm short.
    go(client)
    tip.pose = CartesianPose("base_link", (0.55, 0.27, 0.22), (0.0, 0.0, 0.0, 1.0))
    client.app.state.command_state_tracker.record_manager_status({"behaviour": "behaviour/passthrough"})

    client.app.state.go_to_monitor.tick()
    record = client.app.state.command_state_store.get(GO_KEY).value
    assert (record["state"], record["offset_mm"], record["measured"]) == ("stopped", 50, True)
