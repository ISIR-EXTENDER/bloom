from pathlib import Path
from typing import Literal

from libs.config.repository import ConfigurationRepository, FileConfigurationRepository
from libs.config.sqlite_repository import SQLiteConfigurationRepository


ConfigurationStorageKind = Literal["file", "sqlite"]


def create_configuration_repository(
    storage: ConfigurationStorageKind,
    *,
    configuration_dir: str | Path,
    database_path: str | Path,
) -> ConfigurationRepository:
    if storage == "sqlite":
        return SQLiteConfigurationRepository(database_path)
    return FileConfigurationRepository(configuration_dir)
