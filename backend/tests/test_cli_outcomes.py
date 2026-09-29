"""What `bloom config` prints for each outcome, and how it fails when a share or write cannot happen."""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest
from typer.testing import CliRunner

from apps.bloom_cli.main import cli, main
from libs.config import load_configuration_file, save_configuration_file
from libs.config.storage import create_configuration_repository

SHIPPED_SANDBOX = Path(__file__).parents[1] / "seed" / "applications" / "sandbox.json"


def plain(text: str) -> str:
    """Rich wraps errors in a box at the terminal width, which differs in CI."""
    text = re.sub(r"\x1b\[[0-9;]*m", "", text)
    return " ".join(re.sub(r"[│╭╮╰╯─]", " ", text).split())


def sqlite_store(tmp_path: Path, seed_dir: Path | None = None) -> list[str]:
    options = ["--storage", "sqlite", "--database-path", str(tmp_path / "bloom.db")]
    return options + (["--seed-dir", str(seed_dir)] if seed_dir is not None else [])


def open_store(tmp_path: Path):
    return create_configuration_repository(
        "sqlite", configuration_dir=tmp_path / "cfg", database_path=tmp_path / "bloom.db"
    )


def test_seed_reports_what_it_updated_what_it_kept_and_when_there_is_nothing_to_do(tmp_path: Path) -> None:
    seed_dir = tmp_path / "seed"
    shipped = load_configuration_file(SHIPPED_SANDBOX)
    for config_id in ("alpha", "beta"):
        save_configuration_file(shipped, seed_dir / f"{config_id}.json")
    store = sqlite_store(tmp_path, seed_dir)
    runner = CliRunner()

    first = runner.invoke(cli, ["config", "seed", *store])
    again = runner.invoke(cli, ["config", "seed", *store])
    # alpha: untouched here while the shipped file moved on. beta: edited on this machine.
    save_configuration_file(shipped.model_copy(update={"applications": ()}), seed_dir / "alpha.json")
    repository = open_store(tmp_path)
    repository.upsert("beta", repository.get("beta").model_copy(update={"applications": ()}))
    third = runner.invoke(cli, ["config", "seed", *store])

    assert first.stdout.splitlines() == ["Imported alpha", "Imported beta"]
    assert again.stdout.splitlines() == ["Kept local alpha", "Kept local beta", "Nothing to import."]
    assert third.exit_code == 0
    assert third.stdout.splitlines() == ["Updated alpha to the shipped version", "Kept local beta"]
    assert open_store(tmp_path).get("alpha").applications == ()
    assert open_store(tmp_path).get("beta").applications == ()


def import_shipped_sandbox(runner: CliRunner, tmp_path: Path) -> None:
    result = runner.invoke(cli, ["config", "import", "sandbox", str(SHIPPED_SANDBOX), *sqlite_store(tmp_path)])
    assert result.exit_code == 0, result.output


def test_publishing_an_unknown_configuration_lists_what_the_store_holds(tmp_path: Path) -> None:
    store = sqlite_store(tmp_path, tmp_path / "seed")
    runner = CliRunner()
    import_shipped_sandbox(runner, tmp_path)

    result = runner.invoke(cli, ["config", "publish", "sandbx", *store])

    assert result.exit_code == 2
    assert "No configuration 'sandbx' in this store. Available: sandbox" in plain(result.stderr)
    assert not (tmp_path / "seed").exists()


def test_publishing_an_outdated_copy_points_to_the_shipped_update(tmp_path: Path) -> None:
    seed_dir = tmp_path / "seed"
    shipped = load_configuration_file(SHIPPED_SANDBOX)
    save_configuration_file(shipped, seed_dir / "alpha.json")
    store = sqlite_store(tmp_path, seed_dir)
    runner = CliRunner()
    runner.invoke(cli, ["config", "seed", *store])
    save_configuration_file(shipped.model_copy(update={"applications": ()}), seed_dir / "alpha.json")

    result = runner.invoke(cli, ["config", "publish", "alpha", *store])

    assert result.exit_code == 2
    assert "alpha has a newer shared version" in plain(result.stderr)
    assert "bloom config seed --force alpha" in plain(result.stderr)
    assert load_configuration_file(seed_dir / "alpha.json").applications == ()


def test_publishing_an_app_with_uploaded_theme_images_warns_that_they_stay_here(tmp_path: Path) -> None:
    store = sqlite_store(tmp_path, tmp_path / "seed")
    runner = CliRunner()
    import_shipped_sandbox(runner, tmp_path)
    repository = open_store(tmp_path)
    bundle = repository.get("sandbox")
    application = bundle.applications[0]
    inspiration = application.theme.inspiration.model_copy(
        update={"moodboard_image_uri": "/api/v1/configurations/sandbox/theme-assets/board.png"}
    )
    themed = application.model_copy(update={"theme": application.theme.model_copy(update={"inspiration": inspiration})})
    repository.upsert("sandbox", bundle.model_copy(update={"applications": (themed,)}))

    result = runner.invoke(cli, ["config", "publish", "sandbox", *store])

    assert result.exit_code == 0
    assert "warning: Uploaded theme images stay on this machine" in plain(result.stderr)
    assert "Published sandbox to" in result.stdout
    assert (tmp_path / "seed" / "sandbox.json").is_file()


def test_an_export_that_cannot_write_fails_cleanly(tmp_path: Path) -> None:
    store = sqlite_store(tmp_path)
    runner = CliRunner()
    runner.invoke(cli, ["config", "import", "sandbox", str(SHIPPED_SANDBOX), *store])
    read_only = tmp_path / "read-only"
    read_only.mkdir()
    read_only.chmod(0o500)
    try:
        result = runner.invoke(cli, ["config", "export", "sandbox", str(read_only / "out.json"), *store])
    finally:
        read_only.chmod(0o700)

    assert result.exit_code == 1
    assert "Could not write" in plain(result.stderr)
    assert isinstance(result.exception, SystemExit)
    assert not (read_only / "out.json").exists()


def test_main_runs_the_command_line(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    packaged = (Path(__file__).parents[1] / "pyproject.toml").read_text(encoding="utf-8")
    expected = re.search(r'^version = "([^"]+)"', packaged, re.MULTILINE)
    assert expected is not None
    monkeypatch.setattr(sys, "argv", ["bloom", "version"])

    with pytest.raises(SystemExit) as exit_info:
        main()

    assert exit_info.value.code == 0
    assert capsys.readouterr().out.strip() == expected.group(1)
