from pathlib import Path

from typer.testing import CliRunner

from apps.bloom_cli.main import cli
from libs.config import ConfigurationBundle, load_configuration_file, save_configuration_file

LEGACY_FIXTURE_DIR = Path(__file__).parent / "fixtures" / "legacy"


def test_version_command_prints_backend_version() -> None:
    runner = CliRunner()

    result = runner.invoke(cli, ["version"])

    assert result.exit_code == 0
    assert result.stdout.strip() == "0.1.0"


def test_cli_without_args_shows_help() -> None:
    runner = CliRunner()

    result = runner.invoke(cli)

    assert result.exit_code == 0
    assert "Bloom backend developer and operations commands." in result.stdout


def test_api_without_args_shows_help() -> None:
    runner = CliRunner()

    result = runner.invoke(cli, ["api"])

    assert result.exit_code == 0
    assert "Run and inspect the Bloom API." in result.stdout
    assert "run" in result.stdout
    assert "run-ros" in result.stdout


def test_config_without_args_shows_help() -> None:
    runner = CliRunner()

    result = runner.invoke(cli, ["config"])

    assert result.exit_code == 0
    assert "Import, export, and inspect Bloom configurations." in result.stdout
    assert "import" in result.stdout
    assert "export" in result.stdout


def test_config_cli_round_trips_sqlite_storage(
    tmp_path,
    sample_configuration_bundle: ConfigurationBundle,
) -> None:
    source_path = tmp_path / "source.json"
    database_path = tmp_path / "bloom.db"
    exported_path = tmp_path / "exported.json"
    save_configuration_file(sample_configuration_bundle, source_path)
    runner = CliRunner()

    import_result = runner.invoke(
        cli,
        [
            "config",
            "import",
            "sandbox",
            str(source_path),
            "--storage",
            "sqlite",
            "--database-path",
            str(database_path),
        ],
    )
    list_result = runner.invoke(
        cli,
        ["config", "list", "--storage", "sqlite", "--database-path", str(database_path)],
    )
    export_result = runner.invoke(
        cli,
        [
            "config",
            "export",
            "sandbox",
            str(exported_path),
            "--storage",
            "sqlite",
            "--database-path",
            str(database_path),
        ],
    )

    assert import_result.exit_code == 0
    assert "Imported sandbox" in import_result.stdout
    assert list_result.exit_code == 0
    assert list_result.stdout.strip() == "sandbox"
    assert export_result.exit_code == 0
    assert "Exported sandbox" in export_result.stdout
    assert load_configuration_file(exported_path) == sample_configuration_bundle


def test_config_cli_keeps_file_storage_available(
    tmp_path,
    sample_configuration_bundle: ConfigurationBundle,
) -> None:
    source_path = tmp_path / "source.json"
    configuration_dir = tmp_path / "configurations"
    save_configuration_file(sample_configuration_bundle, source_path)
    runner = CliRunner()

    import_result = runner.invoke(
        cli,
        ["config", "import", "sandbox", str(source_path), "--configuration-dir", str(configuration_dir)],
    )
    list_result = runner.invoke(cli, ["config", "list", "--configuration-dir", str(configuration_dir)])

    assert import_result.exit_code == 0
    assert (configuration_dir / "sandbox.json").exists()
    assert list_result.exit_code == 0
    assert list_result.stdout.strip() == "sandbox"


def test_config_cli_imports_legacy_screen_to_sqlite(tmp_path) -> None:
    database_path = tmp_path / "bloom.db"
    exported_path = tmp_path / "legacy-screen.json"
    runner = CliRunner()

    import_result = runner.invoke(
        cli,
        [
            "config",
            "import-legacy-screen",
            "legacy-sandbox",
            str(LEGACY_FIXTURE_DIR / "sandbox_control.json"),
            "--application-id",
            "sandbox",
            "--application-name",
            "Sandbox",
            "--storage",
            "sqlite",
            "--database-path",
            str(database_path),
        ],
    )
    export_result = runner.invoke(
        cli,
        [
            "config",
            "export",
            "legacy-sandbox",
            str(exported_path),
            "--storage",
            "sqlite",
            "--database-path",
            str(database_path),
        ],
    )
    bundle = load_configuration_file(exported_path)

    assert import_result.exit_code == 0
    assert "Imported legacy screen sandbox_control as legacy-sandbox" in import_result.stdout
    assert export_result.exit_code == 0
    assert bundle.metadata.source == "legacy-screen:sandbox_control.json"
    assert bundle.applications[0].id == "sandbox"
    assert bundle.applications[0].screens[0].id == "sandbox_control"
    assert len(bundle.applications[0].screens[0].widgets) == 12


def test_config_cli_imports_legacy_application_to_file_storage(tmp_path) -> None:
    configuration_dir = tmp_path / "configurations"
    runner = CliRunner()

    import_result = runner.invoke(
        cli,
        [
            "config",
            "import-legacy-application",
            "play-petanque",
            str(LEGACY_FIXTURE_DIR / "application-play-petanque.json"),
            "--configuration-dir",
            str(configuration_dir),
        ],
    )
    bundle = load_configuration_file(configuration_dir / "play-petanque.json")

    assert import_result.exit_code == 0
    assert "Imported legacy application application-play-petanque as play-petanque" in import_result.stdout
    assert bundle.metadata.source == "legacy-application:application-play-petanque.json"
    assert bundle.applications[0].id == "application-play-petanque"
    assert bundle.applications[0].screens[0].id == "petanque"


def test_config_cli_imports_legacy_application_with_real_screens(tmp_path) -> None:
    configuration_dir = tmp_path / "configurations"
    runner = CliRunner()

    import_result = runner.invoke(
        cli,
        [
            "config",
            "import-legacy-application-screens",
            "petanque-admin",
            str(LEGACY_FIXTURE_DIR / "app-petanque-admin.json"),
            str(LEGACY_FIXTURE_DIR / "default_control.json"),
            str(LEGACY_FIXTURE_DIR / "default_live_teleop.json"),
            str(LEGACY_FIXTURE_DIR / "default_petanque.json"),
            "--configuration-dir",
            str(configuration_dir),
        ],
    )
    bundle = load_configuration_file(configuration_dir / "petanque-admin.json")

    assert import_result.exit_code == 0
    assert "Imported legacy application app-petanque-admin with 12 screens as petanque-admin" in import_result.stdout
    assert bundle.metadata.source == "legacy-application-screens:app-petanque-admin.json"
    assert bundle.applications[0].screens[0].id == "default_control"
    assert bundle.applications[0].screens[0].widgets[0].id == "control-rz"
    assert bundle.applications[0].screens[1].id == "default_live_teleop"
    assert bundle.applications[0].screens[1].widgets[1].kind == "camera"


def test_config_cli_export_missing_configuration_fails(tmp_path) -> None:
    runner = CliRunner()

    result = runner.invoke(
        cli,
        [
            "config",
            "export",
            "missing",
            str(tmp_path / "missing.json"),
            "--storage",
            "sqlite",
            "--database-path",
            str(tmp_path / "bloom.db"),
        ],
    )

    assert result.exit_code == 1
    assert "Configuration not found: missing" in result.stderr


def test_api_run_delegates_to_uvicorn(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_run(app: str, **kwargs: object) -> None:
        captured["app"] = app
        captured.update(kwargs)

    monkeypatch.setattr("apps.bloom_cli.main.uvicorn.run", fake_run)
    runner = CliRunner()

    result = runner.invoke(cli, ["api", "run", "--host", "0.0.0.0", "--port", "9000", "--reload"])

    assert result.exit_code == 0
    assert captured == {
        "app": "apps.bloom_api.main:app",
        "host": "0.0.0.0",
        "port": 9000,
        "reload": True,
    }
