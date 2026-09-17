"""Shipped apps must command each robot within that robot's own limits."""

import json
import re
from pathlib import Path

SEEDS = Path(__file__).parents[1] / "seed" / "applications"


def widgets(config_id: str):
    bundle = json.loads((SEEDS / f"{config_id}.json").read_text(encoding="utf-8"))
    for application in bundle["applications"]:
        for screen in application["screens"]:
            yield from screen["widgets"]


def gripper_toggles(config_id: str):
    return [
        widget
        for widget in widgets(config_id)
        if widget["kind"] == "toggle" and widget["settings"].get("topic") == "/gripper_controller/commands"
    ]


def position(payload: str) -> float:
    return float(re.fullmatch(r"\{data: \[([-0-9.]+)\]\}", payload).group(1))


def test_kinova_gripper_stays_within_the_robotiq_85_range() -> None:
    # The knuckle joint is limited to 0.0-0.8 rad, and the kortex driver maps
    # 0.81 rad to 100%. Explorer's [1.1] asked the Kinova for about 136%.
    toggles = gripper_toggles("kinova-manager")
    assert toggles
    for toggle in toggles:
        for key in ("onPayload", "offPayload"):
            assert 0.0 <= position(toggle["settings"][key]) <= 0.8, (toggle["id"], key)


def test_gripper_labels_name_the_state_the_payload_commands() -> None:
    # A toggle shows onLabel while on, so on must be the closing position when
    # it reads Closed. The Joystick Lab toggles read "Open gripper" while closing.
    for config_id in ("explorer-manager", "kinova-manager"):
        for toggle in gripper_toggles(config_id):
            settings = toggle["settings"]
            closing_on = position(settings["onPayload"]) > position(settings["offPayload"])
            assert closing_on, (config_id, toggle["id"])
            assert settings["onLabel"] == "Closed", (config_id, toggle["id"])
            assert settings["offLabel"] == "Open", (config_id, toggle["id"])


def test_kinova_requests_no_joint_target_defined_for_another_arm() -> None:
    # cartesian_manager's Kinova params define `home` over six joints with
    # Explorer's angles (joint 4 at 2.97 rad, beyond the gen3's 2.57 rad).
    # Remove this guard once that target is corrected upstream.
    requests = [
        widget["id"]
        for widget in widgets("kinova-manager")
        if "behaviour/joint_target/" in json.dumps(widget["settings"])
    ]
    assert requests == []
