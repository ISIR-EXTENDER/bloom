from pathlib import Path

import pytest

from libs.config.models import ConfigurationBundle
from libs.config.repository import InMemoryConfigurationRepository
from libs.config.seed import (
    DEFAULT_SEED_DIR,
    adopt_file_configurations,
    available_seed_ids,
    seed_configurations,
)
from libs.config.storage import create_configuration_repository

SHARED_APP_IDS = {
    "bloom-debug",
    "explorer-manager",
    "kinova-manager",
    "explorer-user-tests",
    "petanque-admin",
    "sandbox",
    "webcam-visualizer",
}


def test_shipped_bundles_are_present_and_valid() -> None:
    """A missing or broken seed file is a clone that comes up empty."""
    assert SHARED_APP_IDS.issubset(set(available_seed_ids()))

    for config_id in available_seed_ids():
        path = DEFAULT_SEED_DIR / f"{config_id}.json"
        bundle = ConfigurationBundle.model_validate_json(path.read_text(encoding="utf-8"))
        assert bundle.applications, f"{config_id} ships no applications"


def test_seeding_an_empty_store_imports_every_shipped_app() -> None:
    repository = InMemoryConfigurationRepository()

    outcome = seed_configurations(repository)

    assert SHARED_APP_IDS.issubset(set(outcome.imported))
    assert outcome.skipped == ()
    assert outcome.changed is True
    assert SHARED_APP_IDS.issubset(set(repository.list_ids()))


def test_seeding_twice_changes_nothing() -> None:
    repository = InMemoryConfigurationRepository()
    seed_configurations(repository)

    outcome = seed_configurations(repository)

    assert outcome.imported == ()
    assert outcome.changed is False


def rename_first_screen(bundle: ConfigurationBundle, title: str) -> ConfigurationBundle:
    """Stand in for a screen someone rearranged in the builder."""
    payload = bundle.model_dump(mode="json")
    payload["applications"][0]["screens"][0]["title"] = title
    return ConfigurationBundle.model_validate(payload)


def first_screen_title(repository: InMemoryConfigurationRepository, config_id: str) -> str:
    return repository.get(config_id).applications[0].screens[0].title


def test_seeding_never_overwrites_local_work() -> None:
    """The store holds someone's screen layouts. Seeding must not touch them."""
    repository = InMemoryConfigurationRepository()
    seed_configurations(repository)
    repository.upsert(
        "explorer-manager",
        rename_first_screen(repository.get("explorer-manager"), "Drive (my layout)"),
    )

    outcome = seed_configurations(repository)

    assert "explorer-manager" in outcome.skipped
    assert first_screen_title(repository, "explorer-manager") == "Drive (my layout)"


def test_force_resets_one_app_and_leaves_the_others() -> None:
    repository = InMemoryConfigurationRepository()
    seed_configurations(repository)
    for config_id in ("explorer-manager", "sandbox"):
        repository.upsert(config_id, rename_first_screen(repository.get(config_id), "edited"))

    outcome = seed_configurations(repository, force_ids={"explorer-manager"})

    assert outcome.imported == ("explorer-manager",)
    assert first_screen_title(repository, "explorer-manager") != "edited"
    assert first_screen_title(repository, "sandbox") == "edited"


@pytest.mark.parametrize("storage", ["file", "sqlite"])
def test_seeding_works_for_both_storage_backends(tmp_path: Path, storage: str) -> None:
    repository = create_configuration_repository(
        storage,  # type: ignore[arg-type]
        configuration_dir=tmp_path / "configurations",
        database_path=tmp_path / "bloom.db",
    )

    outcome = seed_configurations(repository)

    assert SHARED_APP_IDS.issubset(set(outcome.imported))
    assert SHARED_APP_IDS.issubset(set(repository.list_ids()))
    assert repository.get("explorer-manager").applications[0].screens


def test_a_missing_seed_directory_is_not_a_crash(tmp_path: Path) -> None:
    """A partial checkout should degrade, not take the API down on startup."""
    repository = InMemoryConfigurationRepository()

    outcome = seed_configurations(repository, seed_dir=tmp_path / "absent")

    assert outcome.imported == ()
    assert available_seed_ids(tmp_path / "absent") == []


def test_an_existing_file_store_is_carried_into_sqlite(tmp_path: Path) -> None:
    """Switching the default must not strand work people already have."""
    file_dir = tmp_path / "configurations"
    file_repository = create_configuration_repository(
        "file", configuration_dir=file_dir, database_path=tmp_path / "unused.db"
    )
    seed_configurations(file_repository)
    file_repository.upsert(
        "explorer-manager",
        rename_first_screen(file_repository.get("explorer-manager"), "Drive (my layout)"),
    )

    sqlite_repository = create_configuration_repository(
        "sqlite", configuration_dir=file_dir, database_path=tmp_path / "bloom.db"
    )
    adopted = adopt_file_configurations(sqlite_repository, configuration_dir=file_dir)

    assert "explorer-manager" in adopted
    assert sqlite_repository.get("explorer-manager").applications[0].screens[0].title == "Drive (my layout)"


def test_adoption_only_happens_into_an_empty_store(tmp_path: Path) -> None:
    """Once SQLite holds anything it is the source of truth, not the JSON files."""
    file_dir = tmp_path / "configurations"
    file_repository = create_configuration_repository(
        "file", configuration_dir=file_dir, database_path=tmp_path / "unused.db"
    )
    seed_configurations(file_repository)

    sqlite_repository = create_configuration_repository(
        "sqlite", configuration_dir=file_dir, database_path=tmp_path / "bloom.db"
    )
    adopt_file_configurations(sqlite_repository, configuration_dir=file_dir)
    sqlite_repository.upsert(
        "explorer-manager",
        rename_first_screen(sqlite_repository.get("explorer-manager"), "Drive (edited in sqlite)"),
    )

    adopted_again = adopt_file_configurations(sqlite_repository, configuration_dir=file_dir)

    assert adopted_again == ()
    assert sqlite_repository.get("explorer-manager").applications[0].screens[0].title == "Drive (edited in sqlite)"


def test_adoption_survives_having_no_file_store_at_all(tmp_path: Path) -> None:
    repository = create_configuration_repository(
        "sqlite", configuration_dir=tmp_path / "absent", database_path=tmp_path / "bloom.db"
    )

    assert adopt_file_configurations(repository, configuration_dir=tmp_path / "absent") == ()


def test_every_shipped_toggle_can_actually_publish() -> None:
    """A toggle without payloads for its declared type 422s at runtime."""
    from libs.ros_adapters.payloads import parse_ros_payload_text
    from libs.ros_adapters.safety import validate_minimum_payload_shape

    def resolve_payload(raw: object) -> dict:
        if isinstance(raw, str):
            return parse_ros_payload_text(raw)
        if isinstance(raw, dict):
            return raw
        return {"data": raw}

    checked = 0
    for config_id in available_seed_ids():
        path = DEFAULT_SEED_DIR / f"{config_id}.json"
        bundle = ConfigurationBundle.model_validate_json(path.read_text(encoding="utf-8"))
        for application in bundle.applications:
            for screen in application.screens:
                for widget in screen.widgets:
                    if widget.kind.value != "toggle" or not widget.settings.get("topic"):
                        continue
                    message_type = widget.settings.get("messageType", "")
                    for field in ("onPayload", "offPayload"):
                        assert field in widget.settings, (
                            f"{config_id}/{application.id}/{widget.id}: toggle publishes"
                            f" {message_type or 'an unknown type'} but ships no {field}"
                        )
                        payload = resolve_payload(widget.settings[field])
                        # Raises RuntimePayloadShapeError on a payload the
                        # publish route would refuse.
                        validate_minimum_payload_shape(message_type, payload)
                        checked += 1

    assert checked > 0, "no shipped toggles were checked; the walk is broken"


def test_explorer_speed_sliders_target_topics_qontrol_reads() -> None:
    """/cmd/max_velocity died with sandbox_controller; qontrol reads these."""
    path = DEFAULT_SEED_DIR / "explorer-manager.json"
    bundle = ConfigurationBundle.model_validate_json(path.read_text(encoding="utf-8"))
    topics = {
        widget.settings.get("topic")
        for application in bundle.applications
        for screen in application.screens
        for widget in screen.widgets
        if widget.kind.value == "slider"
    }

    # Values of topic_max_linear_velocity / topic_max_angular_velocity in
    # cartesian_manager bringup/config/explorer_params.yaml.
    assert "/explorer_user_interfaces/rqt_armcontrol/max_linear_speed" in topics
    assert "/explorer_user_interfaces/rqt_armcontrol/max_angular_speed" in topics
    assert "/cmd/max_velocity" not in topics

    drive = next(screen for screen in bundle.applications[0].screens if screen.id == "manager_drive")
    speed_settings = {
        widget.id: widget.settings
        for widget in drive.widgets
        if widget.id in {"drive-max-linear-speed", "drive-max-angular-speed"}
    }
    assert speed_settings["drive-max-linear-speed"]["value"] == 0.15
    assert speed_settings["drive-max-angular-speed"]["value"] == 0.4
    assert all(settings["messageType"] == "std_msgs/msg/Float64" for settings in speed_settings.values())


def test_cartesian_manager_monitors_use_its_twist_stamped_command_type() -> None:
    """A wrong type leaves an apparently healthy topic widget permanently empty."""
    checked = 0
    for config_id in ("bloom-debug", "explorer-manager", "kinova-manager"):
        path = DEFAULT_SEED_DIR / f"{config_id}.json"
        bundle = ConfigurationBundle.model_validate_json(path.read_text(encoding="utf-8"))
        for application in bundle.applications:
            for screen in application.screens:
                for widget in screen.widgets:
                    if widget.settings.get("topic") != "/joystick_cartesian_command":
                        continue
                    assert widget.settings.get("messageType") == "geometry_msgs/msg/TwistStamped", (
                        f"{config_id}/{screen.id}/{widget.id} subscribes with the wrong cartesian_manager type"
                    )
                    checked += 1

    assert checked > 0, "no cartesian_manager command monitors were checked"


@pytest.mark.parametrize("config_id", ["explorer-manager", "kinova-manager"])
def test_manager_drive_screen_is_a_complete_virtual_joystick(config_id: str) -> None:
    """The experiment UI replaces every physical joystick input on one screen."""
    from libs.ros_adapters.payloads import parse_ros_payload_text

    path = DEFAULT_SEED_DIR / f"{config_id}.json"
    bundle = ConfigurationBundle.model_validate_json(path.read_text(encoding="utf-8"))
    application = bundle.applications[0]
    drive = next(screen for screen in application.screens if screen.id == "manager_drive")
    widgets = {widget.id: widget for widget in drive.widgets}

    assert application.runtime_policy.command_frame_id == "base_link"
    assert {widgets[widget_id].kind.value for widget_id in ("drive-translation", "drive-rotation")} == {"joystick"}
    assert {widgets[widget_id].kind.value for widget_id in ("drive-z", "drive-rz")} == {"slider"}
    assert {
        widget_id
        for widget_id in ("drive-gripper", "drive-mode-both", "drive-mode-jaco", "drive-snake-hold")
        if widget_id in widgets
    } == {"drive-gripper", "drive-mode-both", "drive-mode-jaco", "drive-snake-hold"}

    both = widgets["drive-mode-both"].settings
    jaco = widgets["drive-mode-jaco"].settings
    snake = widgets["drive-snake-hold"].settings
    gripper = widgets["drive-gripper"].settings
    assert (both["topic"], both["payload"]) == ("/mode_request", {"data": "geometric/both"})
    assert (jaco["topic"], jaco["payload"]) == ("/mode_request", {"data": "geometric/jaco"})
    assert (snake["topic"], snake["payload"], snake["releasedPayload"], snake["momentary"]) == (
        "/mode_request",
        {"data": "geometric/snake"},
        {"data": "geometric/both"},
        True,
    )
    assert (gripper["topic"], gripper["messageType"]) == (
        "/gripper_controller/commands",
        "std_msgs/msg/Float64MultiArray",
    )
    assert (
        parse_ros_payload_text(gripper["onPayload"]),
        parse_ros_payload_text(gripper["offPayload"]),
    ) == ({"data": [1.1]}, {"data": [0.2]})

    for widget_id in ("drive-translation", "drive-rotation", "drive-z", "drive-rz"):
        value_mapping = widgets[widget_id].settings["runtime_binding"].get("value_mapping", {})
        assert value_mapping["target_topic"] == "/joystick_cartesian_command"


# Sizes of the canvas presets operator apps target, from CANVAS_PRESETS in
# frontend/libs/widgets/src/index.ts.
OPERATOR_CANVAS_SIZES = {
    "native-1024x600": (1024, 600),
    "native-1280x720": (1280, 720),
    "hd": (1280, 720),
}

INTERACTIVE_WIDGET_KINDS = {"button", "command-button", "gesture-pad", "joystick", "slider", "toggle"}


def test_operator_screens_fit_their_canvas_and_controls_do_not_overlap() -> None:
    """A control off the artboard or under another control cannot be tapped.

    Both shipped: the explorer feedback screen ran to x=1450 on a 1280-wide
    canvas, and the review's finding 5 documents a slider buried under a
    joystick card. Enforced for the operator canvases; decorative overlap
    stays legal.
    """
    checked = 0
    for config_id in available_seed_ids():
        path = DEFAULT_SEED_DIR / f"{config_id}.json"
        bundle = ConfigurationBundle.model_validate_json(path.read_text(encoding="utf-8"))
        for application in bundle.applications:
            for screen in application.screens:
                size = OPERATOR_CANVAS_SIZES.get(screen.canvas.preset_id)
                if size is None or screen.canvas.preset_id == "hd":
                    # hd predates the operator panel work; legacy apps on it
                    # are not held to the panel rules.
                    continue
                width, height = size
                for widget in screen.widgets:
                    layout = widget.layout
                    assert layout.x >= 0 and layout.y >= 0, f"{config_id}/{screen.id}/{widget.id} off-canvas"
                    assert layout.x + layout.width <= width and layout.y + layout.height <= height, (
                        f"{config_id}/{screen.id}/{widget.id} overflows the {screen.canvas.preset_id} canvas"
                    )
                    checked += 1
                interactive = [w for w in screen.widgets if w.kind.value in INTERACTIVE_WIDGET_KINDS]
                for index, first in enumerate(interactive):
                    for second in interactive[index + 1 :]:
                        a, b = first.layout, second.layout
                        overlaps = (
                            a.x < b.x + b.width
                            and b.x < a.x + a.width
                            and a.y < b.y + b.height
                            and b.y < a.y + a.height
                        )
                        assert not overlaps, (
                            f"{config_id}/{screen.id}: controls {first.id} and {second.id} overlap"
                        )

    assert checked > 0, "no operator screens were checked; the walk is broken"


def test_no_interactive_control_shares_glass_with_the_stop_chrome() -> None:
    """STOP is fixed chrome above the widgets; a control under it is untappable."""
    panel_width, panel_height = 1024, 600
    stop_width, stop_height, margin = 176, 132, 24

    checked = 0
    for config_id in available_seed_ids():
        path = DEFAULT_SEED_DIR / f"{config_id}.json"
        bundle = ConfigurationBundle.model_validate_json(path.read_text(encoding="utf-8"))
        for application in bundle.applications:
            for screen in application.screens:
                size = OPERATOR_CANVAS_SIZES.get(screen.canvas.preset_id)
                if size is None or screen.canvas.preset_id == "hd":
                    continue
                width, height = size
                scale = min(panel_width / width, panel_height / height) * 0.99
                reserve_x = width - (stop_width + margin) / scale
                reserve_y = height - (stop_height + margin) / scale
                for widget in screen.widgets:
                    if widget.kind.value not in INTERACTIVE_WIDGET_KINDS:
                        continue
                    layout = widget.layout
                    in_reserve = layout.x + layout.width > reserve_x and layout.y + layout.height > reserve_y
                    assert not in_reserve, (
                        f"{config_id}/{screen.id}/{widget.id} reaches under the STOP chrome"
                    )
                    checked += 1

    assert checked > 0, "no interactive widgets were checked; the walk is broken"
