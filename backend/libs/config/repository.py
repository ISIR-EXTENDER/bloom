from pathlib import Path

from libs.config.json_io import load_configuration_file, save_configuration_file
from libs.config.models import ConfigurationBundle


class ConfigurationNotFoundError(KeyError):
    pass


class InMemoryConfigurationRepository:
    def __init__(self, initial_bundles: dict[str, ConfigurationBundle] | None = None) -> None:
        self._bundles = dict(initial_bundles or {})

    def list_ids(self) -> list[str]:
        return sorted(self._bundles)

    def get(self, config_id: str) -> ConfigurationBundle:
        try:
            return self._bundles[config_id]
        except KeyError as exc:
            raise ConfigurationNotFoundError(config_id) from exc

    def upsert(self, config_id: str, bundle: ConfigurationBundle) -> ConfigurationBundle:
        self._bundles[config_id] = bundle
        return bundle

    def delete(self, config_id: str) -> None:
        if config_id not in self._bundles:
            raise ConfigurationNotFoundError(config_id)
        del self._bundles[config_id]


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
        return bundle

    def delete(self, config_id: str) -> None:
        path = self._path_for(config_id)
        if not path.exists():
            raise ConfigurationNotFoundError(config_id)
        path.unlink()

    def _path_for(self, config_id: str) -> Path:
        if "/" in config_id or "\\" in config_id or config_id in {"", ".", ".."}:
            raise ValueError("config_id must be a plain file stem")
        return self.root_dir / f"{config_id}.json"
