import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings


@pytest.fixture
def test_settings() -> Settings:
    return Settings(environment="test")


@pytest.fixture
def client(test_settings: Settings) -> TestClient:
    return TestClient(create_app(test_settings))
