import json
import sqlite3
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 7

#: How long a statement waits for another connection's write before giving up.
#: The CLI holds a write for the length of a seed, which is longer than the
#: 5 s default, and an API read that waits is better than a 500.
BUSY_TIMEOUT_MS = 15_000


class SQLiteMigrationError(RuntimeError):
    """Raised when a database cannot be upgraded without risking stored data."""


def connect_sqlite_database(path: str | Path) -> sqlite3.Connection:
    database_path = Path(path)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    # WAL lets a reader read the last committed version while a writer holds the
    # write lock, which is what a status poll needs while the CLI seeds.
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute(f"PRAGMA busy_timeout = {BUSY_TIMEOUT_MS}")
    return connection


@contextmanager
def sqlite_connection(path: str | Path) -> Iterator[sqlite3.Connection]:
    connection = connect_sqlite_database(path)
    try:
        yield connection
    finally:
        connection.close()


def apply_sqlite_migrations(connection: sqlite3.Connection) -> None:
    if connection.in_transaction:
        raise SQLiteMigrationError("database migrations cannot run inside an existing transaction")

    # Read the ledger before reaching for a write. A fully migrated database is the normal case, and
    # opening BEGIN IMMEDIATE for it blocks behind any other writer and can fail on a busy timeout,
    # which turned a routine call into a 15 second stall and a 500.
    if _is_fully_migrated(connection):
        return

    _create_migration_table(connection)

    while True:
        connection.execute("BEGIN IMMEDIATE")
        try:
            applied_versions = _read_applied_versions(connection)
            _validate_applied_versions(applied_versions)
            applied = set(applied_versions)
            pending = [(version, migration) for version, migration in MIGRATIONS if version not in applied]
            if not pending:
                connection.commit()
                return

            version, migration = pending[0]
            migration(connection)
            connection.execute("INSERT INTO schema_migrations (version) VALUES (?)", (version,))
        except Exception:
            connection.rollback()
            raise
        else:
            connection.commit()


def _is_fully_migrated(connection: sqlite3.Connection) -> bool:
    """True when the ledger exists and already records every migration this build knows."""
    try:
        applied_versions = _read_applied_versions(connection)
    except sqlite3.DatabaseError:
        return False
    if not applied_versions:
        return False
    _validate_applied_versions(applied_versions)
    return {version for version, _ in MIGRATIONS}.issubset(set(applied_versions))


def get_applied_schema_versions(connection: sqlite3.Connection) -> list[int]:
    apply_sqlite_migrations(connection)
    return _read_applied_versions(connection)


def ensure_column(
    connection: sqlite3.Connection,
    table_name: str,
    column_name: str,
    column_definition: str,
) -> None:
    columns = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    if any(row["name"] == column_name for row in columns):
        return

    connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}")


def _create_migration_table(connection: sqlite3.Connection) -> None:
    connection.execute("BEGIN IMMEDIATE")
    try:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    except Exception:
        connection.rollback()
        raise
    else:
        connection.commit()


def _read_applied_versions(connection: sqlite3.Connection) -> list[int]:
    rows = connection.execute("SELECT version FROM schema_migrations ORDER BY version").fetchall()
    return [int(row["version"]) for row in rows]


def _validate_applied_versions(applied_versions: list[int]) -> None:
    unsupported = [version for version in applied_versions if version < 1 or version > SCHEMA_VERSION]
    if unsupported:
        versions = ", ".join(str(version) for version in unsupported)
        raise SQLiteMigrationError(
            f"database schema version {versions} is not supported by this Bloom build "
            f"(latest supported version: {SCHEMA_VERSION})"
        )

    expected = list(range(1, max(applied_versions, default=0) + 1))
    if applied_versions != expected:
        raise SQLiteMigrationError(
            "database migration history is not contiguous; restore a backup or repair the migration ledger"
        )


def _migrate_to_v1(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS configuration_bundles (
            config_id TEXT PRIMARY KEY,
            bundle_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def _migrate_to_v2(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS configuration_applications (
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
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS configuration_screens (
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
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS configuration_widgets (
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
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS theme_assets (
            asset_id TEXT PRIMARY KEY,
            uri TEXT NOT NULL UNIQUE,
            filename TEXT NOT NULL,
            content_type TEXT NOT NULL,
            byte_size INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def _migrate_to_v3(connection: sqlite3.Connection) -> None:
    ensure_column(
        connection,
        "configuration_bundles",
        "metadata_json",
        "TEXT NOT NULL DEFAULT '{}'",
    )
    ensure_column(
        connection,
        "configuration_applications",
        "runtime_policy_json",
        "TEXT NOT NULL DEFAULT '{}'",
    )
    ensure_column(
        connection,
        "configuration_applications",
        "action_presets_json",
        "TEXT NOT NULL DEFAULT '[]'",
    )

    for config_id, payload in _load_bundle_payloads(connection).items():
        metadata = payload.get("metadata", {})
        if not isinstance(metadata, dict):
            raise SQLiteMigrationError(f"configuration {config_id!r} has invalid metadata JSON")
        connection.execute(
            "UPDATE configuration_bundles SET metadata_json = ? WHERE config_id = ?",
            (_dump_json(metadata), config_id),
        )

        applications = _application_payloads(config_id, payload)
        rows = connection.execute(
            "SELECT app_id FROM configuration_applications WHERE config_id = ?",
            (config_id,),
        ).fetchall()
        for row in rows:
            app_id = str(row["app_id"])
            application = applications.get(app_id, {})
            runtime_policy = application.get("runtime_policy", {})
            action_presets = application.get("action_presets", [])
            if not isinstance(runtime_policy, dict) or not isinstance(action_presets, list):
                raise SQLiteMigrationError(
                    f"configuration {config_id!r} application {app_id!r} has invalid runtime policy JSON"
                )
            connection.execute(
                """
                UPDATE configuration_applications
                SET runtime_policy_json = ?, action_presets_json = ?
                WHERE config_id = ? AND app_id = ?
                """,
                (_dump_json(runtime_policy), _dump_json(action_presets), config_id, app_id),
            )


def _migrate_to_v4(connection: sqlite3.Connection) -> None:
    ensure_column(
        connection,
        "configuration_bundles",
        "workspace_id",
        "TEXT NOT NULL DEFAULT 'default'",
    )
    ensure_column(
        connection,
        "configuration_applications",
        "workspace_id",
        "TEXT NOT NULL DEFAULT 'default'",
    )
    ensure_column(
        connection,
        "configuration_applications",
        "project_id",
        "TEXT NOT NULL DEFAULT ''",
    )
    ensure_column(
        connection,
        "configuration_screens",
        "workspace_id",
        "TEXT NOT NULL DEFAULT 'default'",
    )
    ensure_column(
        connection,
        "configuration_screens",
        "project_id",
        "TEXT NOT NULL DEFAULT ''",
    )
    ensure_column(
        connection,
        "configuration_widgets",
        "workspace_id",
        "TEXT NOT NULL DEFAULT 'default'",
    )
    ensure_column(
        connection,
        "configuration_widgets",
        "project_id",
        "TEXT NOT NULL DEFAULT ''",
    )
    connection.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_configuration_bundles_workspace
            ON configuration_bundles(workspace_id, config_id)
        """
    )
    connection.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_configuration_applications_workspace_project
            ON configuration_applications(workspace_id, project_id, config_id, app_id)
        """
    )
    connection.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_configuration_screens_workspace_project
            ON configuration_screens(workspace_id, project_id, config_id, app_id, screen_id)
        """
    )


def _migrate_to_v5(connection: sqlite3.Connection) -> None:
    ensure_column(
        connection,
        "configuration_applications",
        "lifecycle",
        "TEXT NOT NULL DEFAULT 'active'",
    )

    for config_id, payload in _load_bundle_payloads(connection).items():
        applications = _application_payloads(config_id, payload)
        rows = connection.execute(
            "SELECT app_id FROM configuration_applications WHERE config_id = ?",
            (config_id,),
        ).fetchall()
        for row in rows:
            app_id = str(row["app_id"])
            application = applications.get(app_id)
            if application is None:
                continue
            lifecycle = application.get("lifecycle", "active")
            if lifecycle not in {"active", "archived"}:
                raise SQLiteMigrationError(
                    f"configuration {config_id!r} application {app_id!r} has invalid lifecycle {lifecycle!r}"
                )
            connection.execute(
                """
                UPDATE configuration_applications
                SET lifecycle = ?
                WHERE config_id = ? AND app_id = ?
                """,
                (lifecycle, config_id, app_id),
            )


def _load_bundle_payloads(connection: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    payloads: dict[str, dict[str, Any]] = {}
    rows = connection.execute("SELECT config_id, bundle_json FROM configuration_bundles").fetchall()
    for row in rows:
        config_id = str(row["config_id"])
        try:
            payload = json.loads(str(row["bundle_json"]))
        except json.JSONDecodeError as exc:
            raise SQLiteMigrationError(f"configuration {config_id!r} has invalid bundle JSON") from exc
        if not isinstance(payload, dict):
            raise SQLiteMigrationError(f"configuration {config_id!r} bundle JSON must be an object")
        payloads[config_id] = payload
    return payloads


def _application_payloads(config_id: str, payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    applications = payload.get("applications", [])
    if not isinstance(applications, list):
        raise SQLiteMigrationError(f"configuration {config_id!r} applications JSON must be a list")

    result: dict[str, dict[str, Any]] = {}
    for application in applications:
        if not isinstance(application, dict):
            raise SQLiteMigrationError(f"configuration {config_id!r} contains an invalid application")
        app_id = application.get("id")
        if isinstance(app_id, str):
            result[app_id] = application
    return result


def _dump_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True)


def _migrate_to_v6(connection: sqlite3.Connection) -> None:
    # Remembers deliberate deletions, so seeding does not bring a shipped app back.
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS deleted_configurations (
            config_id TEXT PRIMARY KEY,
            deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def _migrate_to_v7(connection: sqlite3.Connection) -> None:
    ensure_column(connection, "configuration_screens", "reserved_regions_json", "TEXT NOT NULL DEFAULT '[]'")

    for config_id, payload in _load_bundle_payloads(connection).items():
        for app_id, application in _application_payloads(config_id, payload).items():
            screens = application.get("screens", [])
            for screen in screens if isinstance(screens, list) else []:
                regions = screen.get("reserved_regions") if isinstance(screen, dict) else None
                if regions is None:
                    continue
                # Reading iterates this column, so anything but a list would fail every later GET.
                regions = regions if isinstance(regions, list) else []
                connection.execute(
                    """
                    UPDATE configuration_screens
                    SET reserved_regions_json = ?
                    WHERE config_id = ? AND app_id = ? AND screen_id = ?
                    """,
                    (json.dumps(regions), config_id, app_id, screen.get("id")),
                )


MIGRATIONS: tuple[tuple[int, Callable[[sqlite3.Connection], None]], ...] = (
    (1, _migrate_to_v1),
    (2, _migrate_to_v2),
    (3, _migrate_to_v3),
    (4, _migrate_to_v4),
    (5, _migrate_to_v5),
    (6, _migrate_to_v6),
    (7, _migrate_to_v7),
)
