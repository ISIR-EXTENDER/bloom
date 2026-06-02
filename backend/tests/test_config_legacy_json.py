from pathlib import Path

from libs.config import (
    WidgetKind,
    load_legacy_application_file,
    load_legacy_screen_file,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "legacy"


def test_load_legacy_sandbox_control_screen() -> None:
    screen = load_legacy_screen_file(FIXTURE_DIR / "sandbox_control.json")

    assert screen.id == "sandbox_control"
    assert screen.title == "sandbox_control"
    assert len(screen.widgets) == 12

    ros_toggle = next(widget for widget in screen.widgets if widget.id == "widget-1777993123607-1d1c3")
    assert ros_toggle.kind == WidgetKind.COMMAND_BUTTON
    assert ros_toggle.title == "ROS Toggle"
    assert ros_toggle.layout.x == 394
    assert ros_toggle.layout.y == 17
    assert ros_toggle.layout.width == 203
    assert ros_toggle.layout.height == 91
    assert ros_toggle.settings["topic"] == "/ui/ros_toggle"
    assert ros_toggle.settings["messageType"] == "std_msgs/msg/Int32MultiArray"
    assert ros_toggle.settings["onPayload"] == "{data: [13, 1]}"
    assert "rect" not in ros_toggle.settings
    assert screen.canvas.preset_id == "hd"
    assert screen.canvas.runtime_mode == "fit"


def test_load_legacy_configurations_screen() -> None:
    screen = load_legacy_screen_file(FIXTURE_DIR / "configurations.json")

    assert screen.id == "configurations"
    assert screen.widgets[0].kind == WidgetKind.LABEL
    assert screen.widgets[0].title == "Text"

    navigation = next(widget for widget in screen.widgets if widget.id == "cfg-nav")
    assert navigation.kind == WidgetKind.UNKNOWN
    assert navigation.settings["items"][0]["targetScreenId"] == "default_control"
    assert navigation.layout.width > 0
    assert navigation.layout.height > 0


def test_load_legacy_play_petanque_application() -> None:
    application = load_legacy_application_file(FIXTURE_DIR / "application-play-petanque.json")

    assert application.id == "application-play-petanque"
    assert application.name == "PlayPetanque"
    assert application.description == "Legacy home screen: petanque"
    assert [screen.id for screen in application.screens] == [
        "petanque",
        "petanque_teleop_config",
        "play_petanque_camera",
        "play_petanque_lancer",
        "play_petanque_lancer_draw",
        "petanque_draw",
        "play_petanque_ramassage",
        "play_petanque_measures",
    ]
