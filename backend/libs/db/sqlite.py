import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path


SCHEMA_VERSION = 3


def connect_sqlite_database(path: str | Path) -> sqlite3.Connection:
    database_path = Path(path)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def sqlite_connection(path: str | Path) -> Iterator[sqlite3.Connection]:
    connection = connect_sqlite_database(path)
    try:
        yield connection
    finally:
        connection.close()


def apply_sqlite_migrations(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS configuration_bundles (
            config_id TEXT PRIMARY KEY,
            bundle_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

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
        );

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
        );

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
        );

        CREATE TABLE IF NOT EXISTS theme_assets (
            asset_id TEXT PRIMARY KEY,
            uri TEXT NOT NULL UNIQUE,
            filename TEXT NOT NULL,
            content_type TEXT NOT NULL,
            byte_size INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
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
    connection.executemany(
        "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)",
        [(version,) for version in range(1, SCHEMA_VERSION + 1)],
    )
    connection.commit()


def get_applied_schema_versions(connection: sqlite3.Connection) -> list[int]:
    apply_sqlite_migrations(connection)
    rows = connection.execute("SELECT version FROM schema_migrations ORDER BY version").fetchall()
    return [int(row["version"]) for row in rows]


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
