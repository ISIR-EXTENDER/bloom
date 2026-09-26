"""CLI mistakes end in one clear line and a non-zero exit, not a traceback or a false success."""

from pathlib import Path

from typer.testing import CliRunner

from apps.bloom_cli.main import cli
from libs.config.seed import DEFAULT_SEED_DIR


def store_options(tmp_path: Path) -> list[str]:
    return [
        "--storage",
        "file",
        "--configuration-dir",
        str(tmp_path / "configurations"),
    ]


def test_seed_force_with_an_unknown_id_fails_and_resets_nothing(tmp_path: Path) -> None:
    result = CliRunner().invoke(cli, ["config", "seed", "--force", "sandbx", *store_options(tmp_path)])

    assert result.exit_code == 1
    assert "Not a shipped application: sandbx" in result.stderr
    assert result.exception is None or isinstance(result.exception, SystemExit)
    assert not (tmp_path / "configurations").exists() or not list((tmp_path / "configurations").glob("*.json"))


def test_import_under_a_path_like_id_fails_cleanly(tmp_path: Path) -> None:
    result = CliRunner().invoke(
        cli, ["config", "import", "a\\b", str(DEFAULT_SEED_DIR / "sandbox.json"), *store_options(tmp_path)]
    )

    assert result.exit_code == 1
    assert "Could not import as" in result.stderr
    assert isinstance(result.exception, SystemExit)


def test_import_of_a_missing_file_fails_cleanly(tmp_path: Path) -> None:
    result = CliRunner().invoke(
        cli, ["config", "import", "demo", str(tmp_path / "absent.json"), *store_options(tmp_path)]
    )

    assert result.exit_code == 1
    assert "Could not read" in result.stderr
    assert isinstance(result.exception, SystemExit)


def test_export_of_an_unreadable_bundle_fails_cleanly(tmp_path: Path) -> None:
    configurations = tmp_path / "configurations"
    configurations.mkdir()
    (configurations / "broken.json").write_text("{ not json")

    result = CliRunner().invoke(
        cli, ["config", "export", "broken", str(tmp_path / "out.json"), *store_options(tmp_path)]
    )

    assert result.exit_code == 1
    assert "Could not read broken" in result.stderr
    assert isinstance(result.exception, SystemExit)
