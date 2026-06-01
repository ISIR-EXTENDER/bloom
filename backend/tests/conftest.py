import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import (
    ApplicationConfig,
    ConfigurationBundle,
    ConfigurationMetadata,
    InMemoryConfigurationRepository,
    ScreenConfig,
    WidgetConfig,
)


@pytest.fixture
def test_settings() -> Settings:
    return Settings(environment="test")


@pytest.fixture
def sample_configuration_bundle() -> ConfigurationBundle:
    return ConfigurationBundle(
        metadata=ConfigurationMetadata(source="test-suite"),
        applications=(
            ApplicationConfig(
                id="sandbox",
                name="Sandbox",
                screens=(
                    ScreenConfig(
                        id="main",
                        title="Main",
                        widgets=(
                            WidgetConfig(
                                id="toggle",
                                kind="command-button",
                                title="Toggle",
                                settings={"topic": "/ui/ros_toggle", "payloadOn": {"data": [13, 1]}},
                            ),
                        ),
                    ),
                ),
            ),
        ),
    )


@pytest.fixture
def configuration_repository(sample_configuration_bundle: ConfigurationBundle) -> InMemoryConfigurationRepository:
    return InMemoryConfigurationRepository({"sandbox": sample_configuration_bundle})


@pytest.fixture
def client(test_settings: Settings, configuration_repository: InMemoryConfigurationRepository) -> TestClient:
    return TestClient(create_app(test_settings, configuration_repository))
