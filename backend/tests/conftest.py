from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import (
    ConfigurationBundle,
    InMemoryConfigurationRepository,
    load_configuration_file,
)

SHARED_FIXTURE_PATH = Path(__file__).parents[2] / "tests" / "fixtures" / "configuration-bundle.json"


@pytest.fixture
def test_settings() -> Settings:
    return Settings(environment="test")


@pytest.fixture
def sample_configuration_bundle() -> ConfigurationBundle:
    return load_configuration_file(SHARED_FIXTURE_PATH)


@pytest.fixture
def configuration_repository(sample_configuration_bundle: ConfigurationBundle) -> InMemoryConfigurationRepository:
    return InMemoryConfigurationRepository({"sandbox": sample_configuration_bundle})


@pytest.fixture
def client(test_settings: Settings, configuration_repository: InMemoryConfigurationRepository) -> TestClient:
    return TestClient(create_app(test_settings, configuration_repository))
