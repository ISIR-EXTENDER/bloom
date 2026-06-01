import pytest

from libs.config import ConfigurationBundle, ConfigurationNotFoundError, InMemoryConfigurationRepository


def test_repository_lists_ids_sorted(sample_configuration_bundle: ConfigurationBundle) -> None:
    repository = InMemoryConfigurationRepository(
        {
            "zeta": sample_configuration_bundle,
            "alpha": sample_configuration_bundle,
        }
    )

    assert repository.list_ids() == ["alpha", "zeta"]


def test_repository_upserts_and_gets_bundle(sample_configuration_bundle: ConfigurationBundle) -> None:
    repository = InMemoryConfigurationRepository()

    repository.upsert("sandbox", sample_configuration_bundle)

    assert repository.get("sandbox") == sample_configuration_bundle


def test_repository_raises_for_missing_bundle() -> None:
    repository = InMemoryConfigurationRepository()

    with pytest.raises(ConfigurationNotFoundError):
        repository.get("missing")


def test_repository_deletes_bundle(sample_configuration_bundle: ConfigurationBundle) -> None:
    repository = InMemoryConfigurationRepository({"sandbox": sample_configuration_bundle})

    repository.delete("sandbox")

    assert repository.list_ids() == []
