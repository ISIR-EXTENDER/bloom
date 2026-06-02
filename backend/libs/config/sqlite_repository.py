from pathlib import Path

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
            connection.commit()
        return bundle

    def delete(self, config_id: str) -> None:
        with sqlite_connection(self.database_path) as connection:
            apply_sqlite_migrations(connection)
            cursor = connection.execute("DELETE FROM configuration_bundles WHERE config_id = ?", (config_id,))
            connection.commit()
        if cursor.rowcount == 0:
            raise ConfigurationNotFoundError(config_id)
