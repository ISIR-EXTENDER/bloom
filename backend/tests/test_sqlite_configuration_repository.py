from pathlib import Path

import pytest

from libs.config import (
    ApplicationConfig,
    ConfigurationBundle,
    ConfigurationMetadata,
    ConfigurationNotFoundError,
    SQLiteConfigurationRepository,
    load_legacy_screen_file,
)
from libs.db.sqlite import apply_sqlite_migrations, get_applied_schema_versions, sqlite_connection


FIXTURE_DIR = Path(__file__).parent / "fixtures" / "legacy"


def test_sqlite_migrations_are_idempotent(tmp_path: Path) -> None:
    database_path = tmp_path / "bloom.db"

    with sqlite_connection(database_path) as connection:
        apply_sqlite_migrations(connection)
        apply_sqlite_migrations(connection)
        versions = get_applied_schema_versions(connection)

    assert versions == [1, 2]


def test_sqlite_repository_lists_ids_sorted(tmp_path: Path, sample_configuration_bundle: ConfigurationBundle) -> None:
    repository = SQLiteConfigurationRepository(tmp_path / "bloom.db")

    repository.upsert("zeta", sample_configuration_bundle)
    repository.upsert("alpha", sample_configuration_bundle)

    assert repository.list_ids() == ["alpha", "zeta"]


def test_sqlite_repository_upserts_and_gets_bundle(
    tmp_path: Path,
    sample_configuration_bundle: ConfigurationBundle,
) -> None:
    repository = SQLiteConfigurationRepository(tmp_path / "bloom.db")

    repository.upsert("sandbox", sample_configuration_bundle)

    assert repository.get("sandbox") == sample_configuration_bundle


def test_sqlite_repository_syncs_normalized_app_screen_and_widget_rows(
    tmp_path: Path,
    sample_configuration_bundle: ConfigurationBundle,
) -> None:
    database_path = tmp_path / "bloom.db"
    repository = SQLiteConfigurationRepository(database_path)

    repository.upsert("sandbox", sample_configuration_bundle)

    with sqlite_connection(database_path) as connection:
        application_rows = connection.execute(
            "SELECT app_id, name, position FROM configuration_applications WHERE config_id = ?",
            ("sandbox",),
        ).fetchall()
        screen_rows = connection.execute(
            "SELECT screen_id, title, position FROM configuration_screens WHERE config_id = ?",
            ("sandbox",),
        ).fetchall()
        widget_rows = connection.execute(
            "SELECT widget_id, kind, position FROM configuration_widgets WHERE config_id = ? ORDER BY position",
            ("sandbox",),
        ).fetchall()

    assert [(row["app_id"], row["name"], row["position"]) for row in application_rows] == [("sandbox", "Sandbox", 0)]
    assert [(row["screen_id"], row["title"], row["position"]) for row in screen_rows] == [("main", "Main", 0)]
    assert [row["widget_id"] for row in widget_rows] == ["toggle"]
    assert [row["kind"] for row in widget_rows] == ["command-button"]


def test_sqlite_repository_deletes_normalized_rows_with_bundle(
    tmp_path: Path,
    sample_configuration_bundle: ConfigurationBundle,
) -> None:
    database_path = tmp_path / "bloom.db"
    repository = SQLiteConfigurationRepository(database_path)
    repository.upsert("sandbox", sample_configuration_bundle)

    repository.delete("sandbox")

    with sqlite_connection(database_path) as connection:
        application_count = connection.execute("SELECT COUNT(*) AS count FROM configuration_applications").fetchone()
        screen_count = connection.execute("SELECT COUNT(*) AS count FROM configuration_screens").fetchone()
        widget_count = connection.execute("SELECT COUNT(*) AS count FROM configuration_widgets").fetchone()

    assert application_count["count"] == 0
    assert screen_count["count"] == 0
    assert widget_count["count"] == 0


def test_sqlite_repository_persists_between_instances(
    tmp_path: Path,
    sample_configuration_bundle: ConfigurationBundle,
) -> None:
    database_path = tmp_path / "bloom.db"
    first_repository = SQLiteConfigurationRepository(database_path)
    first_repository.upsert("sandbox", sample_configuration_bundle)

    second_repository = SQLiteConfigurationRepository(database_path)

    assert second_repository.get("sandbox") == sample_configuration_bundle


def test_sqlite_repository_deletes_bundle(
    tmp_path: Path,
    sample_configuration_bundle: ConfigurationBundle,
) -> None:
    repository = SQLiteConfigurationRepository(tmp_path / "bloom.db")
    repository.upsert("sandbox", sample_configuration_bundle)

    repository.delete("sandbox")

    assert repository.list_ids() == []
    with pytest.raises(ConfigurationNotFoundError):
        repository.get("sandbox")


def test_sqlite_repository_rejects_missing_and_nested_ids(
    tmp_path: Path,
    sample_configuration_bundle: ConfigurationBundle,
) -> None:
    repository = SQLiteConfigurationRepository(tmp_path / "bloom.db")

    with pytest.raises(ConfigurationNotFoundError):
        repository.get("missing")
    with pytest.raises(ConfigurationNotFoundError):
        repository.delete("missing")
    with pytest.raises(ValueError, match="config_id must be a plain storage key"):
        repository.upsert("../escape", sample_configuration_bundle)


def test_sqlite_repository_round_trips_real_legacy_screen_fixture(tmp_path: Path) -> None:
    legacy_screen = load_legacy_screen_file(FIXTURE_DIR / "sandbox_control.json")
    bundle = ConfigurationBundle(
        metadata=ConfigurationMetadata(source="legacy-sqlite-fixture"),
        applications=(
            ApplicationConfig(
                id="sandbox",
                name="Sandbox",
                screens=(legacy_screen,),
            ),
        ),
    )
    repository = SQLiteConfigurationRepository(tmp_path / "bloom.db")

    repository.upsert("sandbox-from-legacy", bundle)
    loaded = repository.get("sandbox-from-legacy")

    loaded_screen = loaded.applications[0].screens[0]
    ros_toggle = next(widget for widget in loaded_screen.widgets if widget.id == "widget-1777993123607-1d1c3")
    assert loaded.metadata.source == "legacy-sqlite-fixture"
    assert len(loaded_screen.widgets) == 12
    assert ros_toggle.settings["topic"] == "/ui/ros_toggle"
    assert ros_toggle.settings["messageType"] == "std_msgs/msg/Int32MultiArray"
