import json
import sqlite3
from pathlib import Path

import pytest

from libs.config import (
    ApplicationConfig,
    ConfigurationBundle,
    ConfigurationMetadata,
    ConfigurationNotFoundError,
    ReservedRegion,
    RuntimeActionPreset,
    RuntimeAdapterPolicy,
    ScreenConfig,
    SQLiteConfigurationRepository,
    WidgetConfig,
    WidgetLayout,
    dump_configuration_json,
    load_legacy_screen_file,
)
from libs.db.sqlite import (
    SCHEMA_VERSION,
    SQLiteMigrationError,
    apply_sqlite_migrations,
    get_applied_schema_versions,
    sqlite_connection,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "legacy"


def make_schema_upgrade_bundle() -> ConfigurationBundle:
    return ConfigurationBundle(
        metadata=ConfigurationMetadata(source="schema-upgrade-snapshot"),
        applications=(
            ApplicationConfig(
                id="archived-manager",
                name="Archived Manager",
                description="Stored before lifecycle had its own column.",
                lifecycle="archived",
                action_presets=(
                    RuntimeActionPreset(
                        id="reset-fault",
                        name="Reset fault",
                        kind="service-call",
                        topic="/fault_controller/reset_fault",
                        message_type="example_interfaces/srv/Trigger",
                    ),
                ),
                runtime_policy=RuntimeAdapterPolicy(
                    allowed_service_calls=("/fault_controller/reset_fault",),
                ),
            ),
        ),
    )


def create_schema_snapshot(
    connection: sqlite3.Connection,
    version: int,
    bundle: ConfigurationBundle,
    *,
    include_unversioned_lifecycle_column: bool = False,
) -> None:
    connection.executescript(
        """
        CREATE TABLE schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE configuration_bundles (
            config_id TEXT PRIMARY KEY,
            bundle_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    if version >= 2:
        connection.executescript(
            """
            CREATE TABLE configuration_applications (
                config_id TEXT NOT NULL,
                app_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                theme_json TEXT NOT NULL,
                profiles_json TEXT NOT NULL,
                position INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (config_id, app_id),
                FOREIGN KEY (config_id)
                    REFERENCES configuration_bundles(config_id)
                    ON DELETE CASCADE
            );

            CREATE TABLE configuration_screens (
                config_id TEXT NOT NULL,
                app_id TEXT NOT NULL,
                screen_id TEXT NOT NULL,
                title TEXT NOT NULL,
                canvas_json TEXT NOT NULL,
                position INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (config_id, app_id, screen_id),
                FOREIGN KEY (config_id, app_id)
                    REFERENCES configuration_applications(config_id, app_id)
                    ON DELETE CASCADE
            );

            CREATE TABLE configuration_widgets (
                config_id TEXT NOT NULL,
                app_id TEXT NOT NULL,
                screen_id TEXT NOT NULL,
                widget_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                layout_json TEXT NOT NULL,
                settings_json TEXT NOT NULL,
                position INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (config_id, app_id, screen_id, widget_id),
                FOREIGN KEY (config_id, app_id, screen_id)
                    REFERENCES configuration_screens(config_id, app_id, screen_id)
                    ON DELETE CASCADE
            );

            CREATE TABLE theme_assets (
                asset_id TEXT PRIMARY KEY,
                uri TEXT NOT NULL UNIQUE,
                filename TEXT NOT NULL,
                content_type TEXT NOT NULL,
                byte_size INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
    if version >= 3:
        connection.executescript(
            """
            ALTER TABLE configuration_bundles
                ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
            ALTER TABLE configuration_applications
                ADD COLUMN runtime_policy_json TEXT NOT NULL DEFAULT '{}';
            ALTER TABLE configuration_applications
                ADD COLUMN action_presets_json TEXT NOT NULL DEFAULT '[]';
            """
        )
    if version >= 4:
        connection.executescript(
            """
            ALTER TABLE configuration_bundles
                ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
            ALTER TABLE configuration_applications
                ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
            ALTER TABLE configuration_applications
                ADD COLUMN project_id TEXT NOT NULL DEFAULT '';
            ALTER TABLE configuration_screens
                ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
            ALTER TABLE configuration_screens
                ADD COLUMN project_id TEXT NOT NULL DEFAULT '';
            ALTER TABLE configuration_widgets
                ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
            ALTER TABLE configuration_widgets
                ADD COLUMN project_id TEXT NOT NULL DEFAULT '';

            CREATE INDEX idx_configuration_bundles_workspace
                ON configuration_bundles(workspace_id, config_id);
            CREATE INDEX idx_configuration_applications_workspace_project
                ON configuration_applications(workspace_id, project_id, config_id, app_id);
            CREATE INDEX idx_configuration_screens_workspace_project
                ON configuration_screens(workspace_id, project_id, config_id, app_id, screen_id);
            """
        )
    if include_unversioned_lifecycle_column:
        connection.execute(
            """
            ALTER TABLE configuration_applications
                ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'active'
            """
        )

    connection.executemany(
        "INSERT INTO schema_migrations (version) VALUES (?)",
        [(applied_version,) for applied_version in range(1, version + 1)],
    )
    application = bundle.applications[0]
    bundle_columns = ["config_id", "bundle_json"]
    bundle_values: list[object] = ["upgrade", dump_configuration_json(bundle)]
    if version >= 3:
        bundle_columns.append("metadata_json")
        bundle_values.append(json.dumps(bundle.metadata.model_dump(mode="json"), sort_keys=True))
    connection.execute(
        f"INSERT INTO configuration_bundles ({', '.join(bundle_columns)}) "
        f"VALUES ({', '.join('?' for _ in bundle_columns)})",
        bundle_values,
    )

    if version >= 2:
        app_columns = [
            "config_id",
            "app_id",
            "name",
            "description",
            "theme_json",
            "profiles_json",
            "position",
        ]
        app_values: list[object] = [
            "upgrade",
            application.id,
            application.name,
            application.description,
            json.dumps(application.theme.model_dump(mode="json"), sort_keys=True),
            json.dumps([profile.model_dump(mode="json") for profile in application.profiles], sort_keys=True),
            0,
        ]
        if version >= 3:
            app_columns.extend(("runtime_policy_json", "action_presets_json"))
            app_values.extend(
                (
                    json.dumps(application.runtime_policy.model_dump(mode="json"), sort_keys=True),
                    json.dumps(
                        [preset.model_dump(mode="json") for preset in application.action_presets],
                        sort_keys=True,
                    ),
                )
            )
        if include_unversioned_lifecycle_column:
            app_columns.append("lifecycle")
            app_values.append("active")
        connection.execute(
            f"INSERT INTO configuration_applications ({', '.join(app_columns)}) "
            f"VALUES ({', '.join('?' for _ in app_columns)})",
            app_values,
        )
    connection.commit()


def test_sqlite_migrations_are_idempotent(tmp_path: Path) -> None:
    database_path = tmp_path / "bloom.db"

    with sqlite_connection(database_path) as connection:
        apply_sqlite_migrations(connection)
        apply_sqlite_migrations(connection)
        versions = get_applied_schema_versions(connection)

    assert versions == list(range(1, SCHEMA_VERSION + 1))


@pytest.mark.parametrize("snapshot_version", [1, 2, 3, 4])
def test_sqlite_migrations_upgrade_historical_snapshots_without_data_loss(
    tmp_path: Path,
    snapshot_version: int,
) -> None:
    database_path = tmp_path / f"bloom-v{snapshot_version}.db"
    bundle = make_schema_upgrade_bundle()
    with sqlite_connection(database_path) as connection:
        create_schema_snapshot(connection, snapshot_version, bundle)

    repository = SQLiteConfigurationRepository(database_path)

    assert repository.get("upgrade") == bundle
    with sqlite_connection(database_path) as connection:
        assert get_applied_schema_versions(connection) == list(range(1, SCHEMA_VERSION + 1))


def test_v5_migration_repairs_lifecycle_added_without_a_version_bump(tmp_path: Path) -> None:
    database_path = tmp_path / "bloom-v4-with-lifecycle.db"
    bundle = make_schema_upgrade_bundle()
    with sqlite_connection(database_path) as connection:
        create_schema_snapshot(
            connection,
            4,
            bundle,
            include_unversioned_lifecycle_column=True,
        )
        row = connection.execute(
            "SELECT lifecycle FROM configuration_applications WHERE config_id = 'upgrade'"
        ).fetchone()
        assert row["lifecycle"] == "active"

    repository = SQLiteConfigurationRepository(database_path)

    assert repository.get("upgrade").applications[0].lifecycle == "archived"


def test_sqlite_migrations_reject_a_database_from_a_newer_bloom(tmp_path: Path) -> None:
    database_path = tmp_path / "future.db"
    with sqlite_connection(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute("INSERT INTO schema_migrations (version) VALUES (?)", (SCHEMA_VERSION + 1,))
        connection.commit()

        with pytest.raises(SQLiteMigrationError, match="not supported by this Bloom build"):
            apply_sqlite_migrations(connection)

        versions = [row["version"] for row in connection.execute("SELECT version FROM schema_migrations").fetchall()]
        assert versions == [SCHEMA_VERSION + 1]


def test_failed_sqlite_migration_rolls_back_schema_and_version(tmp_path: Path) -> None:
    database_path = tmp_path / "invalid-v2.db"
    bundle = make_schema_upgrade_bundle()
    with sqlite_connection(database_path) as connection:
        create_schema_snapshot(connection, 2, bundle)
        payload = json.loads(dump_configuration_json(bundle))
        payload["metadata"] = []
        connection.execute(
            "UPDATE configuration_bundles SET bundle_json = ? WHERE config_id = 'upgrade'",
            (json.dumps(payload),),
        )
        connection.commit()

        with pytest.raises(SQLiteMigrationError, match="invalid metadata JSON"):
            apply_sqlite_migrations(connection)

        versions = [row["version"] for row in connection.execute("SELECT version FROM schema_migrations").fetchall()]
        bundle_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(configuration_bundles)").fetchall()
        }
        application_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(configuration_applications)").fetchall()
        }
        assert versions == [1, 2]
        assert "metadata_json" not in bundle_columns
        assert "runtime_policy_json" not in application_columns


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


def test_sqlite_repository_reconstructs_bundle_from_normalized_rows(
    tmp_path: Path,
    sample_configuration_bundle: ConfigurationBundle,
) -> None:
    database_path = tmp_path / "bloom.db"
    repository = SQLiteConfigurationRepository(database_path)
    repository.upsert("sandbox", sample_configuration_bundle)

    with sqlite_connection(database_path) as connection:
        connection.execute(
            """
            UPDATE configuration_widgets
            SET title = ?, settings_json = ?
            WHERE config_id = ? AND widget_id = ?
            """,
            (
                "Reconstructed toggle",
                '{"command": "test.reconstructed", "payload": {"data": true}}',
                "sandbox",
                "toggle",
            ),
        )
        connection.commit()

    loaded = repository.get("sandbox")
    loaded_widget = loaded.applications[0].screens[0].widgets[0]

    assert loaded_widget.title == "Reconstructed toggle"
    assert loaded_widget.settings == {
        "command": "test.reconstructed",
        "payload": {"data": True},
    }


def test_sqlite_repository_reconstructs_runtime_policy_and_action_presets(tmp_path: Path) -> None:
    bundle = ConfigurationBundle(
        metadata=ConfigurationMetadata(source="normalized-policy-test"),
        applications=(
            ApplicationConfig(
                id="robot-app",
                name="Robot App",
                action_presets=(
                    RuntimeActionPreset(
                        id="activate",
                        name="Activate",
                        message_type="std_msgs/msg/String",
                        payload={"data": "activate"},
                        topic="/state_machine/change_state",
                    ),
                ),
                runtime_policy=RuntimeAdapterPolicy(
                    allowed_message_types=("std_msgs/msg/String",),
                    allowed_publish_topics=("/state_machine/change_state",),
                ),
            ),
        ),
    )
    repository = SQLiteConfigurationRepository(tmp_path / "bloom.db")

    repository.upsert("robot", bundle)
    loaded = repository.get("robot")

    loaded_app = loaded.applications[0]
    assert loaded.metadata.source == "normalized-policy-test"
    assert loaded_app.runtime_policy.allowed_publish_topics == ("/state_machine/change_state",)
    assert loaded_app.action_presets[0].payload == {"data": "activate"}


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


def test_sqlite_repository_prepares_workspace_and_project_columns(
    tmp_path: Path,
    sample_configuration_bundle: ConfigurationBundle,
) -> None:
    database_path = tmp_path / "bloom.db"
    repository = SQLiteConfigurationRepository(database_path)

    repository.upsert("sandbox", sample_configuration_bundle)

    with sqlite_connection(database_path) as connection:
        bundle_row = connection.execute(
            "SELECT workspace_id FROM configuration_bundles WHERE config_id = ?",
            ("sandbox",),
        ).fetchone()
        application_row = connection.execute(
            """
            SELECT workspace_id, project_id
            FROM configuration_applications
            WHERE config_id = ? AND app_id = ?
            """,
            ("sandbox", "sandbox"),
        ).fetchone()
        screen_row = connection.execute(
            """
            SELECT workspace_id, project_id
            FROM configuration_screens
            WHERE config_id = ? AND app_id = ? AND screen_id = ?
            """,
            ("sandbox", "sandbox", "main"),
        ).fetchone()
        widget_row = connection.execute(
            """
            SELECT workspace_id, project_id
            FROM configuration_widgets
            WHERE config_id = ? AND app_id = ? AND screen_id = ? AND widget_id = ?
            """,
            ("sandbox", "sandbox", "main", "toggle"),
        ).fetchone()

    assert bundle_row["workspace_id"] == "default"
    assert application_row["workspace_id"] == "default"
    assert application_row["project_id"] == ""
    assert screen_row["workspace_id"] == "default"
    assert screen_row["project_id"] == ""
    assert widget_row["workspace_id"] == "default"
    assert widget_row["project_id"] == ""


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


def test_every_shipped_bundle_survives_a_round_trip(tmp_path) -> None:
    """The normalized tables must not quietly lose a field.

    SQLite keeps the canonical bundle JSON *and* a mirror in normalized rows,
    and reads rebuild from the rows. So a field added to the model but not to
    the mirror is dropped on the way back out, with no error anywhere. That is
    what happened to `lifecycle`: an archived application came back active, and
    the archive state would have undone itself the first time anyone saved.

    Checking every shipped bundle catches the next one without anybody having
    to remember this.
    """
    from libs.config.json_io import configuration_to_dict, load_configuration_file
    from libs.config.seed import DEFAULT_SEED_DIR

    repository = SQLiteConfigurationRepository(tmp_path / "parity.db")

    lost: list[str] = []
    for path in sorted(DEFAULT_SEED_DIR.glob("*.json")):
        original = load_configuration_file(path)
        repository.upsert(path.stem, original)
        if configuration_to_dict(original) != configuration_to_dict(repository.get(path.stem)):
            lost.append(path.stem)

    assert lost == []


def test_an_archived_application_stays_archived(tmp_path) -> None:
    from libs.config.json_io import load_configuration_file
    from libs.config.seed import DEFAULT_SEED_DIR

    repository = SQLiteConfigurationRepository(tmp_path / "lifecycle.db")
    bundle = load_configuration_file(DEFAULT_SEED_DIR / "petanque-admin.json")
    assert bundle.applications[0].lifecycle == "archived", "fixture no longer covers the archived case"

    repository.upsert("petanque-admin", bundle)

    assert repository.get("petanque-admin").applications[0].lifecycle == "archived"


def make_reserved_region_bundle() -> ConfigurationBundle:
    return ConfigurationBundle(
        metadata=ConfigurationMetadata(source="reserved-region"),
        applications=(
            ApplicationConfig(
                id="manager",
                name="Manager",
                screens=(
                    ScreenConfig(
                        id="drive",
                        title="Drive",
                        widgets=(
                            WidgetConfig(id="pad", kind="joystick", title="Pad", layout=WidgetLayout(x=14, y=14)),
                        ),
                        reserved_regions=(ReservedRegion(id="stop", x=928, y=410, width=338, height=252),),
                    ),
                ),
            ),
        ),
    )


def test_reserved_regions_round_trip_through_sqlite(tmp_path: Path) -> None:
    repository = SQLiteConfigurationRepository(tmp_path / "bloom.db")
    bundle = make_reserved_region_bundle()

    repository.upsert("manager", bundle)

    assert repository.get("manager") == bundle


def test_v7_migration_backfills_reserved_regions_from_the_stored_bundle(tmp_path: Path) -> None:
    database_path = tmp_path / "bloom.db"
    bundle = make_reserved_region_bundle()
    SQLiteConfigurationRepository(database_path).upsert("manager", bundle)
    with sqlite_connection(database_path) as connection:
        connection.execute("UPDATE configuration_screens SET reserved_regions_json = '[]'")
        connection.execute("DELETE FROM schema_migrations WHERE version = 7")
        connection.commit()

    assert SQLiteConfigurationRepository(database_path).get("manager") == bundle
