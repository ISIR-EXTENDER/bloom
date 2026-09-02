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


@pytest.fixture(autouse=True)
def isolate_configuration_store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep every test out of the developer's own configuration store.

    `configuration_dir` and `configuration_database_path` default to relative
    paths, resolved from the working directory. A test run happens inside this
    backend, so any test that built settings from bare defaults wrote straight
    into the real store: a run used to leave a `play-petanque` configuration
    behind and replace `sandbox` with a test fixture, silently.

    Fixing that test by test is whack-a-mole, and the next one to forget would
    reintroduce it. Moving the working directory makes the real store
    unreachable no matter how a test builds its settings.
    """
    monkeypatch.chdir(tmp_path)


@pytest.fixture
def test_settings(tmp_path: Path) -> Settings:
    """Settings that cannot reach the developer's own store.

    The defaults are relative paths -- `data/configurations` and
    `data/bloom.db` -- resolved from the working directory, which for a test
    run is this backend. Any test that built an app from bare defaults wrote
    into the real store: a run of the suite used to leave a `play-petanque`
    configuration behind and replace `sandbox` with a test fixture.
    """
    return Settings(
        environment="test",
        configuration_dir=tmp_path / "configurations",
        configuration_database_path=tmp_path / "bloom.db",
        theme_asset_dir=tmp_path / "theme-assets",
        seed_shared_applications=False,
    )


@pytest.fixture
def sample_configuration_bundle() -> ConfigurationBundle:
    return load_configuration_file(SHARED_FIXTURE_PATH)


@pytest.fixture
def configuration_repository(sample_configuration_bundle: ConfigurationBundle) -> InMemoryConfigurationRepository:
    return InMemoryConfigurationRepository({"sandbox": sample_configuration_bundle})


@pytest.fixture
def client(test_settings: Settings, configuration_repository: InMemoryConfigurationRepository) -> TestClient:
    return TestClient(create_app(test_settings, configuration_repository))
