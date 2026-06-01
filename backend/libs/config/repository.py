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

