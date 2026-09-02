from pathlib import Path

import pytest

from libs.config.models import ConfigurationBundle
from libs.config.repository import InMemoryConfigurationRepository
from libs.config.seed import (
    DEFAULT_SEED_DIR,
    available_seed_ids,
    seed_configurations,
)
from libs.config.storage import create_configuration_repository

SHARED_APP_IDS = {
    "bloom-debug",
    "explorer-manager",
    "explorer-user-tests",
    "petanque-admin",
    "sandbox",
    "webcam-visualizer",
}


def test_shipped_bundles_are_present_and_valid() -> None:
    """A missing or broken seed file is a clone that comes up empty."""
    assert SHARED_APP_IDS.issubset(set(available_seed_ids()))

    for config_id in available_seed_ids():
        path = DEFAULT_SEED_DIR / f"{config_id}.json"
        bundle = ConfigurationBundle.model_validate_json(path.read_text(encoding="utf-8"))
        assert bundle.applications, f"{config_id} ships no applications"


def test_seeding_an_empty_store_imports_every_shipped_app() -> None:
    repository = InMemoryConfigurationRepository()

    outcome = seed_configurations(repository)

    assert SHARED_APP_IDS.issubset(set(outcome.imported))
    assert outcome.skipped == ()
    assert outcome.changed is True
    assert SHARED_APP_IDS.issubset(set(repository.list_ids()))


def test_seeding_twice_changes_nothing() -> None:
    repository = InMemoryConfigurationRepository()
    seed_configurations(repository)

    outcome = seed_configurations(repository)

    assert outcome.imported == ()
    assert outcome.changed is False


def rename_first_screen(bundle: ConfigurationBundle, title: str) -> ConfigurationBundle:
    """Stand in for a screen someone rearranged in the builder."""
    payload = bundle.model_dump(mode="json")
    payload["applications"][0]["screens"][0]["title"] = title
    return ConfigurationBundle.model_validate(payload)


def first_screen_title(repository: InMemoryConfigurationRepository, config_id: str) -> str:
    return repository.get(config_id).applications[0].screens[0].title


def test_seeding_never_overwrites_local_work() -> None:
    """The store holds someone's screen layouts. Seeding must not touch them."""
    repository = InMemoryConfigurationRepository()
    seed_configurations(repository)
    repository.upsert(
        "explorer-manager",
        rename_first_screen(repository.get("explorer-manager"), "Drive (my layout)"),
    )

    outcome = seed_configurations(repository)

    assert "explorer-manager" in outcome.skipped
    assert first_screen_title(repository, "explorer-manager") == "Drive (my layout)"


def test_force_resets_one_app_and_leaves_the_others() -> None:
    repository = InMemoryConfigurationRepository()
    seed_configurations(repository)
    for config_id in ("explorer-manager", "sandbox"):
        repository.upsert(config_id, rename_first_screen(repository.get(config_id), "edited"))

    outcome = seed_configurations(repository, force_ids={"explorer-manager"})

    assert outcome.imported == ("explorer-manager",)
    assert first_screen_title(repository, "explorer-manager") != "edited"
    assert first_screen_title(repository, "sandbox") == "edited"


@pytest.mark.parametrize("storage", ["file", "sqlite"])
def test_seeding_works_for_both_storage_backends(tmp_path: Path, storage: str) -> None:
    repository = create_configuration_repository(
        storage,  # type: ignore[arg-type]
        configuration_dir=tmp_path / "configurations",
        database_path=tmp_path / "bloom.db",
    )

    outcome = seed_configurations(repository)

    assert SHARED_APP_IDS.issubset(set(outcome.imported))
    assert SHARED_APP_IDS.issubset(set(repository.list_ids()))
    assert repository.get("explorer-manager").applications[0].screens


def test_a_missing_seed_directory_is_not_a_crash(tmp_path: Path) -> None:
    """A partial checkout should degrade, not take the API down on startup."""
    repository = InMemoryConfigurationRepository()

    outcome = seed_configurations(repository, seed_dir=tmp_path / "absent")

    assert outcome.imported == ()
    assert available_seed_ids(tmp_path / "absent") == []
