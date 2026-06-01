from typer.testing import CliRunner

from apps.bloom_cli.main import cli


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
