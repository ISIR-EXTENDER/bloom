"""A config id that cannot be a storage key is the client's mistake, not a server fault."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config.seed import DEFAULT_SEED_DIR


@pytest.mark.parametrize("storage", ["sqlite", "file"])
@pytest.mark.parametrize("config_id", ["a%5Cb", "%2E%2E"])
def test_a_path_like_config_id_is_refused_with_422(tmp_path: Path, storage: str, config_id: str) -> None:
    settings = Settings(
        environment="test",
        configuration_storage=storage,
        configuration_dir=tmp_path / "configurations",
        configuration_database_path=tmp_path / "bloom.db",
        seed_shared_applications=False,
    )
    client = TestClient(create_app(settings), raise_server_exceptions=False)
    bundle = json.loads((DEFAULT_SEED_DIR / "sandbox.json").read_text())

    assert client.put(f"/api/v1/configurations/{config_id}", json=bundle).status_code == 422
