from pathlib import Path

import typer
import uvicorn

from apps.bloom_api.settings import get_settings
from libs.config import (
    ConfigurationNotFoundError,
    ConfigurationRepository,
    ConfigurationStorageKind,
    create_configuration_repository,
    load_configuration_file,
    save_configuration_file,
)

cli = typer.Typer(
    name="bloom",
    help="Bloom backend developer and operations commands.",
)
api_cli = typer.Typer(help="Run and inspect the Bloom API.")
config_cli = typer.Typer(help="Import, export, and inspect Bloom configurations.")
cli.add_typer(api_cli, name="api")
cli.add_typer(config_cli, name="config")


@cli.callback(invoke_without_command=True)
def root(ctx: typer.Context) -> None:
    """Bloom backend developer and operations commands."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())
        raise typer.Exit()


@api_cli.callback(invoke_without_command=True)
def api_root(ctx: typer.Context) -> None:
    """Run and inspect the Bloom API."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())
        raise typer.Exit()


@config_cli.callback(invoke_without_command=True)
def config_root(ctx: typer.Context) -> None:
    """Import, export, and inspect Bloom configurations."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())
        raise typer.Exit()


@cli.command()
def version() -> None:
    """Print the Bloom backend version."""
    settings = get_settings()
    typer.echo(settings.app_version)


@api_cli.command("run")
def run_api(
    host: str = typer.Option("127.0.0.1", "--host", help="Host interface to bind."),
    port: int = typer.Option(8000, "--port", min=1, max=65535, help="Port to bind."),
    reload: bool = typer.Option(False, "--reload", help="Reload the server on code changes."),
) -> None:
    """Run the Bloom FastAPI application."""
    uvicorn.run(
        "apps.bloom_api.main:app",
        host=host,
        port=port,
        reload=reload,
    )


def open_configuration_repository(
    storage: ConfigurationStorageKind,
    configuration_dir: Path | None,
    database_path: Path | None,
) -> ConfigurationRepository:
    settings = get_settings()
    return create_configuration_repository(
        storage,
        configuration_dir=configuration_dir or settings.configuration_dir,
        database_path=database_path or settings.configuration_database_path,
    )


@config_cli.command("list")
def list_configurations(
    storage: ConfigurationStorageKind = typer.Option("file", "--storage", help="Storage backend to inspect."),
    configuration_dir: Path | None = typer.Option(None, "--configuration-dir", help="JSON configuration directory."),
    database_path: Path | None = typer.Option(None, "--database-path", help="SQLite database path."),
) -> None:
    """List stored configuration IDs."""
    repository = open_configuration_repository(storage, configuration_dir, database_path)
    for config_id in repository.list_ids():
        typer.echo(config_id)


@config_cli.command("import")
def import_configuration(
    config_id: str = typer.Argument(..., help="Configuration ID to store."),
    source_path: Path = typer.Argument(..., help="Configuration bundle JSON file to import."),
    storage: ConfigurationStorageKind = typer.Option("file", "--storage", help="Storage backend to write to."),
    configuration_dir: Path | None = typer.Option(None, "--configuration-dir", help="JSON configuration directory."),
    database_path: Path | None = typer.Option(None, "--database-path", help="SQLite database path."),
) -> None:
    """Import a configuration bundle from JSON into storage."""
    repository = open_configuration_repository(storage, configuration_dir, database_path)
    repository.upsert(config_id, load_configuration_file(source_path))
    typer.echo(f"Imported {config_id}")


@config_cli.command("export")
def export_configuration(
    config_id: str = typer.Argument(..., help="Configuration ID to export."),
    destination_path: Path = typer.Argument(..., help="Destination JSON file."),
    storage: ConfigurationStorageKind = typer.Option("file", "--storage", help="Storage backend to read from."),
    configuration_dir: Path | None = typer.Option(None, "--configuration-dir", help="JSON configuration directory."),
    database_path: Path | None = typer.Option(None, "--database-path", help="SQLite database path."),
) -> None:
    """Export a stored configuration bundle to JSON."""
    repository = open_configuration_repository(storage, configuration_dir, database_path)
    try:
        bundle = repository.get(config_id)
    except ConfigurationNotFoundError as exc:
        typer.echo(f"Configuration not found: {config_id}", err=True)
        raise typer.Exit(code=1) from exc
    save_configuration_file(bundle, destination_path)
    typer.echo(f"Exported {config_id}")


def main() -> None:
    cli()


if __name__ == "__main__":
    main()
