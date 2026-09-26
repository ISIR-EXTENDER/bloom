"""Legacy file configurations reach the SQLite store even when one of them is broken."""

from pathlib import Path

from libs.config.json_io import load_configuration_file, save_configuration_file
from libs.config.seed import DEFAULT_SEED_DIR, adopt_file_configurations
from libs.config.storage import create_configuration_repository


def sqlite_store(tmp_path: Path):
    return create_configuration_repository(
        "sqlite", configuration_dir=tmp_path / "configurations", database_path=tmp_path / "bloom.db"
    )


def write_legacy(file_dir: Path, *config_ids: str) -> None:
    file_dir.mkdir(parents=True, exist_ok=True)
    bundle = load_configuration_file(DEFAULT_SEED_DIR / "sandbox.json")
    for config_id in config_ids:
        save_configuration_file(bundle, file_dir / f"{config_id}.json")


def test_one_malformed_file_does_not_stop_the_others(tmp_path: Path) -> None:
    file_dir = tmp_path / "configurations"
    write_legacy(file_dir, "alpha", "gamma")
    (file_dir / "beta.json").write_text("{ not json")
    repository = sqlite_store(tmp_path)

    adopted = adopt_file_configurations(repository, configuration_dir=file_dir)

    assert adopted == ("alpha", "gamma")
    assert set(repository.list_ids()) == {"alpha", "gamma"}


def test_a_store_that_already_holds_something_still_gets_missing_ids(tmp_path: Path) -> None:
    file_dir = tmp_path / "configurations"
    write_legacy(file_dir, "alpha")
    repository = sqlite_store(tmp_path)
    adopt_file_configurations(repository, configuration_dir=file_dir)

    # A file fixed after a failed first run, or one written later, is picked up next time.
    write_legacy(file_dir, "beta")
    assert adopt_file_configurations(repository, configuration_dir=file_dir) == ("beta",)


def test_a_deleted_id_is_not_brought_back(tmp_path: Path) -> None:
    file_dir = tmp_path / "configurations"
    write_legacy(file_dir, "alpha", "beta")
    repository = sqlite_store(tmp_path)
    adopt_file_configurations(repository, configuration_dir=file_dir)
    repository.delete("beta")

    assert adopt_file_configurations(repository, configuration_dir=file_dir) == ()
    assert repository.list_ids() == ["alpha"]
