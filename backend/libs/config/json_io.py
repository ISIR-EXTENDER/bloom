import json
from pathlib import Path
from typing import Any

from libs.config.models import ConfigurationBundle


def load_configuration_json(content: str) -> ConfigurationBundle:
    payload = json.loads(content)
    return ConfigurationBundle.model_validate(payload)


def dump_configuration_json(bundle: ConfigurationBundle, *, indent: int = 2) -> str:
    return bundle.model_dump_json(indent=indent)


def load_configuration_file(path: str | Path) -> ConfigurationBundle:
    config_path = Path(path)
    return load_configuration_json(config_path.read_text(encoding="utf-8"))


def save_configuration_file(bundle: ConfigurationBundle, path: str | Path, *, indent: int = 2) -> None:
    config_path = Path(path)
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(f"{dump_configuration_json(bundle, indent=indent)}\n", encoding="utf-8")


def configuration_to_dict(bundle: ConfigurationBundle) -> dict[str, Any]:
    return bundle.model_dump(mode="json")

