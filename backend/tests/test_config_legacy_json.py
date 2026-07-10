from pathlib import Path

from libs.config import (
    WidgetKind,
    load_legacy_application_file,
    load_legacy_application_with_screens_file,
    load_legacy_screen_file,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "legacy"


def test_load_legacy_sandbox_control_screen() -> None:
    screen = load_legacy_screen_file(FIXTURE_DIR / "sandbox_control.json")

    assert screen.id == "sandbox_control"
    assert screen.title == "sandbox_control"
    assert len(screen.widgets) == 12

    ros_toggle = next(widget for widget in screen.widgets if widget.id == "widget-1777993123607-1d1c3")
    assert ros_toggle.kind == WidgetKind.TOGGLE
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

    max_velocity = next(widget for widget in screen.widgets if widget.id == "pet-speed")
    assert max_velocity.kind == WidgetKind.SLIDER
    assert max_velocity.settings["reverseDirection"] is True

    gripper = next(widget for widget in screen.widgets if widget.id == "pet-gripper")
    assert gripper.kind == WidgetKind.TOGGLE

    state_button = next(widget for widget in screen.widgets if widget.id == "pet-state-teleop")
    assert state_button.kind == WidgetKind.COMMAND_BUTTON


def test_load_legacy_configurations_screen() -> None:
    screen = load_legacy_screen_file(FIXTURE_DIR / "configurations.json")

    assert screen.id == "configurations"
    assert screen.widgets[0].kind == WidgetKind.LABEL
    assert screen.widgets[0].title == "Text"
    assert screen.widgets[1].kind == WidgetKind.LABEL

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


def test_load_legacy_application_with_real_screens() -> None:
    application = load_legacy_application_with_screens_file(
        FIXTURE_DIR / "app-petanque-admin.json",
        (
            FIXTURE_DIR / "default_control.json",
            FIXTURE_DIR / "default_live_teleop.json",
            FIXTURE_DIR / "default_petanque.json",
        ),
    )

    assert application.id == "app-petanque-admin"
    assert application.name == "app-petanque-admin"
    assert [screen.id for screen in application.screens[:3]] == [
        "default_control",
        "default_live_teleop",
        "articular",
    ]

    control_screen = application.screens[0]
    assert len(control_screen.widgets) == 7
    assert {widget.kind for widget in control_screen.widgets} >= {
        WidgetKind.JOYSTICK,
        WidgetKind.SLIDER,
        WidgetKind.TOGGLE,
    }
    translation_joystick = next(widget for widget in control_screen.widgets if widget.id == "control-translation")
    assert translation_joystick.settings["mode_id"] == "both"
    assert translation_joystick.settings["runtime_binding"] == {
        "adapter": "teleop",
        "value_mapping": {"mode": 3, "target_topic": "/teleop_cmd"},
    }
    rotation_joystick = next(widget for widget in control_screen.widgets if widget.id == "control-rotation")
    assert rotation_joystick.settings["mode_id"] == "rotation"
    assert rotation_joystick.settings["runtime_binding"]["value_mapping"]["mode"] == 1

    live_teleop_screen = application.screens[1]
    assert len(live_teleop_screen.widgets) == 6
    assert any(widget.kind == WidgetKind.CAMERA for widget in live_teleop_screen.widgets)

    migrated_petanque_screen = next(screen for screen in application.screens if screen.id == "default_petanque")
    assert migrated_petanque_screen.widgets[0].kind == WidgetKind.LABEL
    assert migrated_petanque_screen.widgets[2].kind == WidgetKind.COMMAND_BUTTON


def test_load_legacy_petanque_gesture_widget_as_generic_pad(tmp_path: Path) -> None:
    screen_path = tmp_path / "play_petanque_lancer_draw.json"
    screen_path.write_text(
        """
        {
          "name": "play_petanque_lancer_draw",
          "widgets": [
            {
              "id": "throw-gesture",
              "kind": "throw-draw",
              "label": "Throw gesture",
              "topic": "/petanque/throw/gesture",
              "rect": { "x": 40, "y": 120, "w": 420, "h": 280 }
            }
          ]
        }
        """,
        encoding="utf-8",
    )
    screen = load_legacy_screen_file(screen_path)

    gesture = next(widget for widget in screen.widgets if widget.kind == WidgetKind.GESTURE_PAD)

    assert gesture.title == "Throw gesture"
    assert gesture.layout.width > 0
    assert gesture.layout.height > 0
    assert gesture.settings["topic"] == "/petanque/throw/gesture"


def test_load_legacy_sandbox_momentary_and_topic_monitor_widgets(tmp_path: Path) -> None:
    screen_path = tmp_path / "snake_and_monitor.json"
    screen_path.write_text(
        """
        {
          "name": "snake_and_monitor",
          "widgets": [
            {
              "id": "snake-hold",
              "kind": "momentary-ros-message",
              "label": "Hold Snake",
              "topic": "/snake_control/enable",
              "messageType": "std_msgs/msg/Bool",
              "pressedPayload": "{data: true}",
              "releasedPayload": "{data: false}",
              "rect": { "x": 20, "y": 20, "w": 220, "h": 76 }
            },
            {
              "id": "servo-topic-monitor",
              "kind": "topic-monitor",
              "label": "ROS Topic Monitor",
              "topics": [
                {
                  "label": "Velocity command",
                  "topic": "/visual_servoing/velocity_command",
                  "messageType": "geometry_msgs/msg/TwistStamped"
                }
              ],
              "rect": { "x": 20, "y": 120, "w": 420, "h": 240 }
            }
          ]
        }
        """,
        encoding="utf-8",
    )
    screen = load_legacy_screen_file(screen_path)

    momentary = next(widget for widget in screen.widgets if widget.id == "snake-hold")
    assert momentary.kind == WidgetKind.COMMAND_BUTTON
    assert momentary.settings["momentary"] is True
    assert momentary.settings["topic"] == "/snake_control/enable"
    assert momentary.settings["payload"] == "{data: true}"
    assert momentary.settings["releasedPayload"] == "{data: false}"

    monitor = next(widget for widget in screen.widgets if widget.id == "servo-topic-monitor")
    assert monitor.kind == WidgetKind.TOPIC_ECHO
    assert monitor.settings["topic"] == "/visual_servoing/velocity_command"
    assert monitor.settings["messageType"] == "geometry_msgs/msg/TwistStamped"
    assert monitor.settings["maxMessages"] == 20
