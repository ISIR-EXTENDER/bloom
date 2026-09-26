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


def test_gripper_labels_name_the_press_and_the_commanded_state() -> None:
    # The button names what pressing does; the header names what was last commanded.
    # On is the closing position, so while on the button offers to open.
    for config_id in ("explorer-manager", "kinova-manager", "sandbox", "petanque-admin", "widget-lab"):
        for toggle in gripper_toggles(config_id):
            settings = toggle["settings"]
            closing_on = position(settings["onPayload"]) > position(settings["offPayload"])
            assert closing_on, (config_id, toggle["id"])
            assert (settings["onLabel"], settings["offLabel"]) == ("Open gripper", "Close gripper"), toggle["id"]
            assert (settings["onStateLabel"], settings["offStateLabel"]) == ("closed", "open"), toggle["id"]


def test_kinova_requests_no_joint_target_defined_for_another_arm() -> None:
    # cartesian_manager's Kinova params define `home` over six joints with
    # Explorer's angles (joint 4 at 2.97 rad, beyond the gen3's 2.57 rad).
    # Remove this guard once that target is corrected upstream.
    requests = [
        widget["id"]
        for widget in widgets("kinova-manager")
        if "behaviour/joint_target/" in json.dumps(widget["settings"].get("payload"))
    ]
    assert requests == []


# The Explorer profile the Explorer Manager app was validated with: swap X/Y, invert linear X.
EXPLORER_PAD = {
    "translation": {"x": {"component": "linear_y"}, "y": {"component": "linear_x", "scale": -1}},
    "rotation": {"x": {"component": "angular_y"}, "y": {"component": "angular_x"}},
}


def test_explorer_apps_drive_on_the_validated_axes() -> None:
    # Without an axis_mapping a pad falls back to identity, which moves the Explorer on the wrong axes.
    for config_id in ("sandbox", "petanque-admin"):
        for widget in widgets(config_id):
            binding = widget["settings"].get("runtime_binding") or {}
            if binding.get("adapter") != "teleop":
                continue
            if widget["kind"] == "joystick":
                pad = "rotation" if widget["settings"].get("mode_id") == "rotation" else "translation"
                assert binding.get("axis_mapping") == EXPLORER_PAD[pad], (config_id, widget["id"])
            elif binding["axis_mapping"]["value"]["component"] == "angular_z":
                assert binding["axis_mapping"]["value"].get("scale") == -1, (config_id, widget["id"])


def test_normalized_teleop_sliders_show_no_speed_unit() -> None:
    # The manager normalizes to unit scale; a -1..1 slider in m/s would read as a real speed.
    for path in SEEDS.glob("*.json"):
        for widget in widgets(path.stem):
            binding = widget["settings"].get("runtime_binding") or {}
            if widget["kind"] == "slider" and binding.get("adapter") == "teleop":
                assert widget["settings"].get("unit", "") not in ("m/s", "rad/s"), (path.stem, widget["id"])


def test_kinova_manager_reads_no_explorer_only_topic() -> None:
    assert "effort_overload" not in (SEEDS / "kinova-manager.json").read_text(encoding="utf-8")
