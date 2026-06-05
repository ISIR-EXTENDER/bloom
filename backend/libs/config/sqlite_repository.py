import json
import sqlite3
from pathlib import Path

from libs.config.json_io import dump_configuration_json, load_configuration_json
from libs.config.models import (
    ApplicationConfig,
    ApplicationTheme,
    CanvasSettings,
    ConfigurationBundle,
    ConfigurationMetadata,
    RuntimeActionPreset,
    RuntimeAdapterPolicy,
    ScreenConfig,
    UserProfile,
    WidgetConfig,
    WidgetLayout,
)
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
                "SELECT bundle_json, metadata_json FROM configuration_bundles WHERE config_id = ?",
                (config_id,),
            ).fetchone()
            if row is not None:
                bundle = load_normalized_configuration_bundle(connection, config_id, row)

        if row is None:
            raise ConfigurationNotFoundError(config_id)
        return bundle

    def upsert(self, config_id: str, bundle: ConfigurationBundle) -> ConfigurationBundle:
        if config_id in {"", ".", ".."} or "/" in config_id or "\\" in config_id:
            raise ValueError("config_id must be a plain storage key")

        bundle_json = dump_configuration_json(bundle)
        with sqlite_connection(self.database_path) as connection:
            apply_sqlite_migrations(connection)
            connection.execute(
                """
                INSERT INTO configuration_bundles (config_id, bundle_json, metadata_json)
                VALUES (?, ?, ?)
                ON CONFLICT(config_id) DO UPDATE SET
                    bundle_json = excluded.bundle_json,
                    metadata_json = excluded.metadata_json,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    config_id,
                    bundle_json,
                    json.dumps(bundle.metadata.model_dump(mode="json"), sort_keys=True),
                ),
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
    """Keep queryable rows aligned with the lossless JSON bundle."""

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
                runtime_policy_json,
                action_presets_json,
                position
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                config_id,
                application.id,
                application.name,
                application.description,
                json.dumps(application.theme.model_dump(mode="json"), sort_keys=True),
                json.dumps([profile.model_dump(mode="json") for profile in application.profiles], sort_keys=True),
                json.dumps(application.runtime_policy.model_dump(mode="json"), sort_keys=True),
                json.dumps([preset.model_dump(mode="json") for preset in application.action_presets], sort_keys=True),
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


def load_normalized_configuration_bundle(
    connection: sqlite3.Connection,
    config_id: str,
    bundle_row: sqlite3.Row,
) -> ConfigurationBundle:
    application_rows = connection.execute(
        """
        SELECT
            app_id,
            name,
            description,
            theme_json,
            profiles_json,
            runtime_policy_json,
            action_presets_json
        FROM configuration_applications
        WHERE config_id = ?
        ORDER BY position, app_id
        """,
        (config_id,),
    ).fetchall()

    if not application_rows:
        return load_configuration_json(str(bundle_row["bundle_json"]))

    return ConfigurationBundle(
        metadata=ConfigurationMetadata.model_validate(json.loads(str(bundle_row["metadata_json"]))),
        applications=tuple(
            load_normalized_application(connection, config_id, application_row)
            for application_row in application_rows
        ),
    )


def load_normalized_application(
    connection: sqlite3.Connection,
    config_id: str,
    application_row: sqlite3.Row,
) -> ApplicationConfig:
    app_id = str(application_row["app_id"])
    screen_rows = connection.execute(
        """
        SELECT screen_id, title, canvas_json
        FROM configuration_screens
        WHERE config_id = ? AND app_id = ?
        ORDER BY position, screen_id
        """,
        (config_id, app_id),
    ).fetchall()

    return ApplicationConfig(
        id=app_id,
        name=str(application_row["name"]),
        description=str(application_row["description"]),
        action_presets=tuple(
            RuntimeActionPreset.model_validate(preset)
            for preset in json.loads(str(application_row["action_presets_json"]))
        ),
        runtime_policy=RuntimeAdapterPolicy.model_validate(json.loads(str(application_row["runtime_policy_json"]))),
        theme=ApplicationTheme.model_validate(json.loads(str(application_row["theme_json"]))),
        profiles=tuple(UserProfile.model_validate(profile) for profile in json.loads(str(application_row["profiles_json"]))),
        screens=tuple(
            load_normalized_screen(connection, config_id, app_id, screen_row)
            for screen_row in screen_rows
        ),
    )


def load_normalized_screen(
    connection: sqlite3.Connection,
    config_id: str,
    app_id: str,
    screen_row: sqlite3.Row,
) -> ScreenConfig:
    screen_id = str(screen_row["screen_id"])
    widget_rows = connection.execute(
        """
        SELECT widget_id, kind, title, layout_json, settings_json
        FROM configuration_widgets
        WHERE config_id = ? AND app_id = ? AND screen_id = ?
        ORDER BY position, widget_id
        """,
        (config_id, app_id, screen_id),
    ).fetchall()

    return ScreenConfig(
        id=screen_id,
        title=str(screen_row["title"]),
        canvas=CanvasSettings.model_validate(json.loads(str(screen_row["canvas_json"]))),
        widgets=tuple(load_normalized_widget(widget_row) for widget_row in widget_rows),
    )


def load_normalized_widget(widget_row: sqlite3.Row) -> WidgetConfig:
    return WidgetConfig(
        id=str(widget_row["widget_id"]),
        kind=str(widget_row["kind"]),
        title=str(widget_row["title"]),
        layout=WidgetLayout.model_validate(json.loads(str(widget_row["layout_json"]))),
        settings=json.loads(str(widget_row["settings_json"])),
    )
