from pathlib import Path
from typing import Protocol

from libs.config.json_io import load_configuration_file, save_configuration_file
from libs.config.models import ConfigurationBundle

# Not a .json file, so it is never listed as a configuration.
DELETED_IDS_FILENAME = "deleted-configurations.txt"


class ConfigurationNotFoundError(KeyError):
    pass


class ConfigurationRepository(Protocol):
    def list_ids(self) -> list[str]:
        pass

    def get(self, config_id: str) -> ConfigurationBundle:
        pass

    def upsert(self, config_id: str, bundle: ConfigurationBundle) -> ConfigurationBundle:
        pass

    def delete(self, config_id: str) -> None:
        pass

    def deleted_ids(self) -> list[str]:
        """Ids deleted on purpose and not saved since."""


class InMemoryConfigurationRepository:
    def __init__(self, initial_bundles: dict[str, ConfigurationBundle] | None = None) -> None:
        self._bundles = dict(initial_bundles or {})
        self._deleted_ids: set[str] = set()

    def list_ids(self) -> list[str]:
        return sorted(self._bundles)

    def get(self, config_id: str) -> ConfigurationBundle:
        try:
            return self._bundles[config_id]
        except KeyError as exc:
            raise ConfigurationNotFoundError(config_id) from exc

    def upsert(self, config_id: str, bundle: ConfigurationBundle) -> ConfigurationBundle:
        self._bundles[config_id] = bundle
        self._deleted_ids.discard(config_id)
        return bundle

    def delete(self, config_id: str) -> None:
        if config_id not in self._bundles:
            raise ConfigurationNotFoundError(config_id)
        del self._bundles[config_id]
        self._deleted_ids.add(config_id)

    def deleted_ids(self) -> list[str]:
        return sorted(self._deleted_ids)


class FileConfigurationRepository:
    def __init__(self, root_dir: str | Path) -> None:
        self.root_dir = Path(root_dir)
        self.root_dir.mkdir(parents=True, exist_ok=True)

    def list_ids(self) -> list[str]:
        return sorted(path.stem for path in self.root_dir.glob("*.json") if path.is_file())

    def get(self, config_id: str) -> ConfigurationBundle:
        path = self._path_for(config_id)
        if not path.exists():
            raise ConfigurationNotFoundError(config_id)
        return load_configuration_file(path)

    def upsert(self, config_id: str, bundle: ConfigurationBundle) -> ConfigurationBundle:
        save_configuration_file(bundle, self._path_for(config_id))
        self._write_deleted_ids(set(self.deleted_ids()) - {config_id})
        return bundle

    def delete(self, config_id: str) -> None:
        path = self._path_for(config_id)
        if not path.exists():
            raise ConfigurationNotFoundError(config_id)
        path.unlink()
        self._write_deleted_ids({*self.deleted_ids(), config_id})

    def deleted_ids(self) -> list[str]:
        path = self.root_dir / DELETED_IDS_FILENAME
        return sorted(line for line in path.read_text().splitlines() if line) if path.exists() else []

    def _write_deleted_ids(self, config_ids: set[str]) -> None:
        path = self.root_dir / DELETED_IDS_FILENAME
        if config_ids:
            path.write_text("".join(f"{config_id}\n" for config_id in sorted(config_ids)))
        elif path.exists():
            path.unlink()

    def _path_for(self, config_id: str) -> Path:
        if "/" in config_id or "\\" in config_id or config_id in {"", ".", ".."}:
            raise ValueError("config_id must be a plain file stem")
        return self.root_dir / f"{config_id}.json"
