import json
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from libs.config import (
    ApplicationConfig,
    ConfigurationBundle,
    ConfigurationMetadata,
    ScreenConfig,
    WidgetConfig,
    WidgetKind,
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
    assert bundle.applications[0].screens[0].widgets[0].kind == WidgetKind.COMMAND_BUTTON


def test_duplicate_application_ids_are_rejected() -> None:
    with pytest.raises(ValidationError, match="duplicate application ids: sandbox"):
        ConfigurationBundle(
            applications=(
                ApplicationConfig(id="sandbox", name="Sandbox A"),
                ApplicationConfig(id="sandbox", name="Sandbox B"),
            )
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


def test_extra_fields_are_rejected() -> None:
    with pytest.raises(ValidationError):
        WidgetConfig(id="camera", title="Camera", unexpected=True)


def test_widget_settings_must_be_json_serializable() -> None:
    with pytest.raises(ValidationError, match="settings must be JSON serializable"):
        WidgetConfig(id="bad-widget", title="Bad Widget", settings={"callback": object()})
