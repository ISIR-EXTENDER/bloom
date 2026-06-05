import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from pydantic import ValidationError

from libs.config import (
    ApplicationConfig,
    CanvasPresetId,
    CanvasSettings,
    ConfigurationBundle,
    ConfigurationMetadata,
    DisplayPreset,
    MotorAccessibilityPreset,
    RuntimeCanvasMode,
    RuntimeActionPreset,
    ScreenConfig,
    UserProfile,
    WidgetConfig,
    WidgetKind,
    WidgetLayout,
)

FIXTURE_DIR = Path(__file__).parents[2] / "tests" / "fixtures"
WIDGET_KIND_CONTRACT_PATH = FIXTURE_DIR / "widget-kinds-contract.json"
APP_CONFIGURATION_FIXTURE_PATHS = (
    FIXTURE_DIR / "configuration-bundle.json",
    FIXTURE_DIR / "petanque-admin-configuration-bundle.json",
    FIXTURE_DIR / "webcam-visualizer-configuration-bundle.json",
    FIXTURE_DIR / "bloom-debug-configuration.json",
    FIXTURE_DIR / "sandbox-teleop-lab-configuration.json",
    FIXTURE_DIR / "explorer-user-tests-configuration-bundle.json",
)


def test_widget_kind_enum_matches_shared_contract() -> None:
    contract = json.loads(WIDGET_KIND_CONTRACT_PATH.read_text(encoding="utf-8"))

    assert sorted(widget_kind.value for widget_kind in WidgetKind) == contract["widget_kinds"]


def test_app_configuration_fixtures_do_not_ship_empty_runtime_screens() -> None:
    for configuration_path in APP_CONFIGURATION_FIXTURE_PATHS:
        bundle = ConfigurationBundle.model_validate_json(configuration_path.read_text(encoding="utf-8"))

        for application in bundle.applications:
            for screen in application.screens:
                assert screen.widgets, (
                    f"{configuration_path.name}:{application.id}/{screen.id} should contain at least one widget "
                    "or stay out of the seeded app library."
                )


def test_configuration_bundle_serializes_to_json() -> None:
    bundle = ConfigurationBundle(
        metadata=ConfigurationMetadata(
            schema_version=1,
            exported_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
            source="unit-test",
        ),
        applications=(
            ApplicationConfig(
                id="sandbox",
                name="Sandbox",
                screens=(
                    ScreenConfig(
                        id="control",
                        title="Control",
                        widgets=(
                            WidgetConfig(
                                id="enable-output",
                                kind=WidgetKind.COMMAND_BUTTON,
                                title="Enable Output",
                                layout=WidgetLayout(x=24, y=32, width=220, height=96),
                                settings={
                                    "topic": "/ui/ros_toggle",
                                    "messageType": "std_msgs/msg/Int32MultiArray",
                                    "payloadOn": {"data": [13, 1]},
                                    "payloadOff": {"data": [13, 0]},
                                },
                            ),
                        ),
                    ),
                ),
            ),
        ),
    )

    serialized = bundle.model_dump_json()
    parsed = json.loads(serialized)

    assert parsed["metadata"]["source"] == "unit-test"
    assert parsed["applications"][0]["theme"] == {
        "inspiration": {
            "moodboard_image_uri": "",
            "reference_url": "",
        },
        "preset_id": "bloom-default",
        "palette": {
            "accent": "#d9a441",
            "background": "#f7f1e6",
            "primary": "#7f967e",
            "surface": "#fffdf7",
        },
    }
    assert parsed["applications"][0]["profiles"] == []
    assert parsed["applications"][0]["screens"][0]["canvas"] == {"preset_id": "hd", "runtime_mode": "fit"}
    assert parsed["applications"][0]["screens"][0]["widgets"][0]["layout"] == {
        "x": 24,
        "y": 32,
        "width": 220,
        "height": 96,
    }
    assert parsed["applications"][0]["screens"][0]["widgets"][0]["settings"]["payloadOn"] == {"data": [13, 1]}


def test_configuration_bundle_validates_from_json_payload() -> None:
    payload = {
        "metadata": {"schema_version": 1, "source": "legacy-json"},
        "applications": [
            {
                "id": "petanque",
                "name": "Petanque",
                "screens": [
                    {
                        "id": "throw",
                        "title": "Throw",
                        "widgets": [
                            {
                                "id": "state-change",
                                "kind": "command-button",
                                "title": "Activate Throw",
                                "settings": {
                                    "topic": "/petanque_state_machine/change_state",
                                    "messageType": "std_msgs/msg/String",
                                    "payload": {"data": "activate_throw"},
                                },
                            }
                        ],
                    }
                ],
            }
        ],
    }

    bundle = ConfigurationBundle.model_validate(payload)

    assert bundle.metadata.source == "legacy-json"
    assert bundle.applications[0].theme.preset_id == "bloom-default"
    assert bundle.applications[0].screens[0].widgets[0].kind == WidgetKind.COMMAND_BUTTON


def test_application_theme_accepts_inspiration_references() -> None:
    application = ApplicationConfig.model_validate(
        {
            "id": "camera-demo",
            "name": "Camera Demo",
            "theme": {
                "inspiration": {
                    "moodboard_image_uri": "/theme-assets/camera-demo-moodboard.png",
                    "reference_url": "https://lifesum.com/nutrition-explained/",
                },
                "preset_id": "custom-demo",
                "palette": {
                    "primary": "#5f7f63",
                    "accent": "#ffd89b",
                    "background": "#f7f1e6",
                    "surface": "#fffdf7",
                },
            },
        }
    )

    assert application.theme.inspiration.moodboard_image_uri == "/theme-assets/camera-demo-moodboard.png"
    assert application.theme.inspiration.reference_url == "https://lifesum.com/nutrition-explained/"


def test_application_accepts_user_profiles_for_future_personalization() -> None:
    application = ApplicationConfig(
        id="extender-tests",
        name="Extender Tests",
        profiles=(
            UserProfile(
                id="meal-layout",
                name="Meal layout",
                display_preset=DisplayPreset.COMFORT,
                font_scale=1.25,
                app_theme_preset_id="bloom-default",
                preferred_control_layout_id="meal-control",
                motor_accessibility_preset=MotorAccessibilityPreset.LARGE_TARGETS,
            ),
        ),
    )

    profile = application.profiles[0]

    assert profile.display_preset == DisplayPreset.COMFORT
    assert profile.font_scale == 1.25
    assert profile.preferred_control_layout_id == "meal-control"
    assert profile.motor_accessibility_preset == MotorAccessibilityPreset.LARGE_TARGETS


def test_application_accepts_runtime_adapter_policy_for_app_specific_safety() -> None:
    application = ApplicationConfig.model_validate(
        {
            "id": "petanque",
            "name": "Petanque",
            "runtime_policy": {
                "allowed_message_types": ["std_msgs/msg/String"],
                "allowed_publish_topics": ["/petanque_state_machine/change_state"],
                "allowed_recording_topics": ["/rosout"],
                "allowed_teleop_targets": ["/teleop_cmd"],
            },
        }
    )

    assert application.runtime_policy.allowed_message_types == ("std_msgs/msg/String",)
    assert application.runtime_policy.allowed_publish_topics == ("/petanque_state_machine/change_state",)
    assert application.runtime_policy.allowed_recording_topics == ("/rosout",)
    assert application.runtime_policy.allowed_teleop_targets == ("/teleop_cmd",)


def test_application_accepts_reusable_runtime_action_presets() -> None:
    application = ApplicationConfig.model_validate(
        {
            "id": "explorer-tests",
            "name": "Explorer Tests",
            "action_presets": [
                {
                    "id": "emergency-stop",
                    "name": "Emergency stop",
                    "kind": "topic-publish",
                    "command": "emergency_stop",
                    "topic": "/explorer/emergency_stop",
                    "message_type": "std_msgs/msg/Bool",
                    "payload": {"data": True},
                    "tags": ["safety", "explorer"],
                }
            ],
        }
    )

    preset = application.action_presets[0]

    assert preset.name == "Emergency stop"
    assert preset.payload == {"data": True}
    assert preset.tags == ("safety", "explorer")


def test_duplicate_runtime_action_preset_ids_are_rejected() -> None:
    with pytest.raises(ValidationError, match="duplicate action preset ids: stop"):
        ApplicationConfig(
            id="explorer-tests",
            name="Explorer Tests",
            action_presets=(
                RuntimeActionPreset(id="stop", name="Stop"),
                RuntimeActionPreset(id="stop", name="Stop duplicate"),
            ),
        )


def test_runtime_action_preset_payload_must_be_json_serializable() -> None:
    with pytest.raises(ValidationError, match="payload must be JSON serializable"):
        RuntimeActionPreset(id="bad", name="Bad", payload=object())


def test_robot_3d_widget_kind_is_reserved_for_optional_visualization_extensions() -> None:
    widget = WidgetConfig(
        id="robot-state",
        kind=WidgetKind.ROBOT_3D,
        title="Robot state",
        settings={
            "modelSource": "extension",
            "jointStateTopic": "/joint_states",
            "showAxes": True,
        },
    )

    assert widget.kind == WidgetKind.ROBOT_3D
    assert widget.settings["jointStateTopic"] == "/joint_states"


def test_duplicate_application_ids_are_rejected() -> None:
    with pytest.raises(ValidationError, match="duplicate application ids: sandbox"):
        ConfigurationBundle(
            applications=(
                ApplicationConfig(id="sandbox", name="Sandbox A"),
                ApplicationConfig(id="sandbox", name="Sandbox B"),
            )
        )


def test_duplicate_profile_ids_are_rejected() -> None:
    with pytest.raises(ValidationError, match="duplicate profile ids: default"):
        ApplicationConfig(
            id="sandbox",
            name="Sandbox",
            profiles=(
                UserProfile(id="default", name="Default"),
                UserProfile(id="default", name="Default copy"),
            ),
        )


def test_duplicate_screen_ids_are_rejected() -> None:
    with pytest.raises(ValidationError, match="duplicate screen ids: control"):
        ApplicationConfig(
            id="sandbox",
            name="Sandbox",
            screens=(
                ScreenConfig(id="control", title="Control A"),
                ScreenConfig(id="control", title="Control B"),
            ),
        )


def test_duplicate_widget_ids_are_rejected() -> None:
    with pytest.raises(ValidationError, match="duplicate widget ids: camera"):
        ScreenConfig(
            id="control",
            title="Control",
            widgets=(
                WidgetConfig(id="camera", title="Camera A"),
                WidgetConfig(id="camera", title="Camera B"),
            ),
        )


def test_widget_layout_rejects_negative_positions() -> None:
    with pytest.raises(ValidationError):
        WidgetLayout(x=-1, y=0, width=160, height=80)


def test_widget_layout_rejects_empty_sizes() -> None:
    with pytest.raises(ValidationError):
        WidgetLayout(x=0, y=0, width=0, height=80)


def test_screen_canvas_settings_use_known_presets_and_modes() -> None:
    screen = ScreenConfig(
        id="control",
        title="Control",
        canvas=CanvasSettings(preset_id=CanvasPresetId.FULL_HD, runtime_mode=RuntimeCanvasMode.CENTER),
    )

    assert screen.canvas.preset_id == CanvasPresetId.FULL_HD
    assert screen.canvas.runtime_mode == RuntimeCanvasMode.CENTER


def test_extra_fields_are_rejected() -> None:
    with pytest.raises(ValidationError):
        WidgetConfig(id="camera", title="Camera", unexpected=True)


def test_widget_settings_must_be_json_serializable() -> None:
    with pytest.raises(ValidationError, match="settings must be JSON serializable"):
        WidgetConfig(id="bad-widget", title="Bad Widget", settings={"callback": object()})
