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
    configuration_to_dict,
    dump_configuration_json,
    load_configuration_file,
    load_configuration_json,
    save_configuration_file,
)


def make_bundle() -> ConfigurationBundle:
    return ConfigurationBundle(
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
                        id="main",
                        title="Main",
                        widgets=(
                            WidgetConfig(
                                id="toggle",
                                kind="command-button",
                                title="Toggle",
                                settings={"topic": "/ui/ros_toggle", "payloadOn": {"data": [13, 1]}},
                            ),
                        ),
                    ),
                ),
            ),
        ),
    )


def test_dump_and_load_configuration_json_round_trip() -> None:
    bundle = make_bundle()

    dumped = dump_configuration_json(bundle)
    loaded = load_configuration_json(dumped)

    assert loaded == bundle


def test_load_configuration_json_rejects_invalid_payload() -> None:
    payload = json.dumps(
        {
            "applications": [
                {"id": "sandbox", "name": "Sandbox A"},
                {"id": "sandbox", "name": "Sandbox B"},
            ]
        }
    )

    with pytest.raises(ValidationError, match="duplicate application ids"):
        load_configuration_json(payload)


def test_save_and_load_configuration_file(tmp_path) -> None:
    path = tmp_path / "nested" / "sandbox.json"
    bundle = make_bundle()

    save_configuration_file(bundle, path)
    loaded = load_configuration_file(path)

    assert loaded == bundle
    assert path.read_text(encoding="utf-8").endswith("\n")


def test_configuration_to_dict_uses_json_safe_values() -> None:
    bundle = make_bundle()

    data = configuration_to_dict(bundle)

    assert isinstance(data["metadata"]["exported_at"], str)
    assert data["applications"][0]["screens"][0]["widgets"][0]["settings"] == {
        "topic": "/ui/ros_toggle",
        "payloadOn": {"data": [13, 1]},
    }

