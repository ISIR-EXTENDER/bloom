from pathlib import Path
import json
import sqlite3

from libs.config.json_io import dump_configuration_json, load_configuration_json
from libs.config.models import ConfigurationBundle
from libs.config.repository import ConfigurationNotFoundError
from libs.db.sqlite import apply_sqlite_migrations, sqlite_connection


class SQLiteConfigurationRepository:
    def __init__(self, database_path: str | Path) -> None:
        self.database_path = Path(database_path)
        with sqlite_connection(self.database_path) as connection:
            apply_sqlite_migrations(connection)

    def list_ids(self) -> list[str]:
        with sqlite_connection(self.database_path) as connection:
            apply_sqlite_migrations(connection)
            rows = connection.execute("SELECT config_id FROM configuration_bundles ORDER BY config_id").fetchall()
            return [str(row["config_id"]) for row in rows]

    def get(self, config_id: str) -> ConfigurationBundle:
        with sqlite_connection(self.database_path) as connection:
            apply_sqlite_migrations(connection)
            row = connection.execute(
                "SELECT bundle_json FROM configuration_bundles WHERE config_id = ?",
                (config_id,),
            ).fetchone()
        if row is None:
            raise ConfigurationNotFoundError(config_id)
        return load_configuration_json(str(row["bundle_json"]))

    def upsert(self, config_id: str, bundle: ConfigurationBundle) -> ConfigurationBundle:
        if config_id in {"", ".", ".."} or "/" in config_id or "\\" in config_id:
            raise ValueError("config_id must be a plain storage key")
        bundle_json = dump_configuration_json(bundle)
        with sqlite_connection(self.database_path) as connection:
            apply_sqlite_migrations(connection)
            connection.execute(
                """
                INSERT INTO configuration_bundles (config_id, bundle_json)
                VALUES (?, ?)
                ON CONFLICT(config_id) DO UPDATE SET
                    bundle_json = excluded.bundle_json,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (config_id, bundle_json),
            )
            sync_normalized_configuration_rows(connection, config_id, bundle)
            connection.commit()
        return bundle

    def delete(self, config_id: str) -> None:
        with sqlite_connection(self.database_path) as connection:
            apply_sqlite_migrations(connection)
            cursor = connection.execute("DELETE FROM configuration_bundles WHERE config_id = ?", (config_id,))
            connection.commit()
        if cursor.rowcount == 0:
            raise ConfigurationNotFoundError(config_id)


def sync_normalized_configuration_rows(
    connection: sqlite3.Connection,
    config_id: str,
    bundle: ConfigurationBundle,
) -> None:
    """Keep Phase 2 queryable tables aligned with the canonical bundle.

    The JSON bundle remains the lossless migration bridge. These normalized rows
    make apps, screens, and widgets first-class database concepts without
    risking schema-driven data loss while the editor model is still evolving.
    """

    connection.execute("DELETE FROM configuration_applications WHERE config_id = ?", (config_id,))

    for application_position, application in enumerate(bundle.applications):
        connection.execute(
            """
            INSERT INTO configuration_applications (
                config_id,
                app_id,
                name,
                description,
                theme_json,
                profiles_json,
                position
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                config_id,
                application.id,
                application.name,
                application.description,
                json.dumps(application.theme.model_dump(mode="json"), sort_keys=True),
                json.dumps([profile.model_dump(mode="json") for profile in application.profiles], sort_keys=True),
                application_position,
            ),
        )

        for screen_position, screen in enumerate(application.screens):
            connection.execute(
                """
                INSERT INTO configuration_screens (
                    config_id,
                    app_id,
                    screen_id,
                    title,
                    canvas_json,
                    position
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    config_id,
                    application.id,
                    screen.id,
                    screen.title,
                    json.dumps(screen.canvas.model_dump(mode="json"), sort_keys=True),
                    screen_position,
                ),
            )

            for widget_position, widget in enumerate(screen.widgets):
                connection.execute(
                    """
                    INSERT INTO configuration_widgets (
                        config_id,
                        app_id,
                        screen_id,
                        widget_id,
                        kind,
                        title,
                        layout_json,
                        settings_json,
                        position
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        config_id,
                        application.id,
                        screen.id,
                        widget.id,
                        widget.kind.value,
                        widget.title,
                        json.dumps(widget.layout.model_dump(mode="json"), sort_keys=True),
                        json.dumps(widget.settings, sort_keys=True),
                        widget_position,
                    ),
                )
