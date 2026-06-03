from pathlib import Path

import pytest

from libs.config import (
    ApplicationConfig,
    ConfigurationBundle,
    ConfigurationMetadata,
    ConfigurationNotFoundError,
    FileConfigurationRepository,
    load_legacy_screen_file,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "legacy"
DATA_CONFIGURATION_DIR = Path(__file__).parents[1] / "data" / "configurations"


def test_file_repository_persists_bundle(tmp_path, sample_configuration_bundle: ConfigurationBundle) -> None:
    repository = FileConfigurationRepository(tmp_path)

    repository.upsert("sandbox", sample_configuration_bundle)

    assert repository.list_ids() == ["sandbox"]
    assert repository.get("sandbox") == sample_configuration_bundle
    assert (tmp_path / "sandbox.json").exists()


def test_file_repository_reads_existing_files(tmp_path, sample_configuration_bundle: ConfigurationBundle) -> None:
    first_repository = FileConfigurationRepository(tmp_path)
    first_repository.upsert("sandbox", sample_configuration_bundle)

    second_repository = FileConfigurationRepository(tmp_path)

    assert second_repository.get("sandbox") == sample_configuration_bundle


def test_file_repository_deletes_bundle(tmp_path, sample_configuration_bundle: ConfigurationBundle) -> None:
    repository = FileConfigurationRepository(tmp_path)
    repository.upsert("sandbox", sample_configuration_bundle)

    repository.delete("sandbox")

    assert repository.list_ids() == []
    assert not (tmp_path / "sandbox.json").exists()


def test_file_repository_raises_for_missing_bundle(tmp_path) -> None:
    repository = FileConfigurationRepository(tmp_path)

    with pytest.raises(ConfigurationNotFoundError):
        repository.get("missing")


def test_file_repository_rejects_nested_config_ids(tmp_path, sample_configuration_bundle: ConfigurationBundle) -> None:
    repository = FileConfigurationRepository(tmp_path)

    with pytest.raises(ValueError, match="config_id must be a plain file stem"):
        repository.upsert("../escape", sample_configuration_bundle)


def test_file_repository_round_trips_real_legacy_screen_fixture(tmp_path) -> None:
    legacy_screen = load_legacy_screen_file(FIXTURE_DIR / "sandbox_control.json")
    bundle = ConfigurationBundle(
        metadata=ConfigurationMetadata(source="legacy-fixture"),
        applications=(
            ApplicationConfig(
                id="sandbox",
                name="Sandbox",
                screens=(legacy_screen,),
            ),
        ),
    )
    repository = FileConfigurationRepository(tmp_path)

    repository.upsert("sandbox-from-legacy", bundle)
    loaded = repository.get("sandbox-from-legacy")

    loaded_screen = loaded.applications[0].screens[0]
    ros_toggle = next(widget for widget in loaded_screen.widgets if widget.id == "widget-1777993123607-1d1c3")
    assert loaded.metadata.source == "legacy-fixture"
    assert ros_toggle.settings["topic"] == "/ui/ros_toggle"
    assert ros_toggle.settings["messageType"] == "std_msgs/msg/Int32MultiArray"
    assert ros_toggle.settings["onPayload"] == "{data: [13, 1]}"


def test_shipped_webcam_visualizer_demo_configuration_is_loadable() -> None:
    repository = FileConfigurationRepository(DATA_CONFIGURATION_DIR)

    bundle = repository.get("webcam-visualizer")
    application = bundle.applications[0]
    screen = application.screens[0]
    widget = screen.widgets[0]

    assert bundle.metadata.source == "bloom-demo:webcam-visualizer"
    assert application.name == "Webcam visualizer"
    assert screen.title == "Camera viewer"
    assert widget.kind == "camera"
    assert widget.settings["source"] == "webcam"
