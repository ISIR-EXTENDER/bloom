from pathlib import Path

import typer
import uvicorn

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import get_settings
from libs.ros_adapters.rclpy_publishers import RclpyRosPublisherGateway
from libs.ros_adapters.rclpy_teleop import RclpyTeleopCommandGateway
from libs.config import (
    ApplicationConfig,
    ConfigurationNotFoundError,
    ConfigurationRepository,
    ConfigurationStorageKind,
    ConfigurationBundle,
    ConfigurationMetadata,
    create_configuration_repository,
    load_configuration_file,
    load_legacy_application_file,
    load_legacy_application_with_screens_file,
    load_legacy_screen_file,
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


@api_cli.command("run-ros")
def run_ros_api(
    host: str = typer.Option("127.0.0.1", "--host", help="Host interface to bind."),
    port: int = typer.Option(8000, "--port", min=1, max=65535, help="Port to bind."),
    node_name: str = typer.Option("bloom_api", "--node-name", help="ROS node name used by the API publisher gateway."),
) -> None:
    """Run the Bloom API with a ROS topic publisher gateway."""
    try:
        import rclpy
        from rclpy.node import Node
    except ModuleNotFoundError as exc:
        typer.echo("ROS 2 Python packages are not available. Source a ROS environment before running this command.", err=True)
        raise typer.Exit(code=1) from exc

    rclpy.init()
    node = Node(node_name)
    try:
        app = create_app(
            ros_publisher_gateway=RclpyRosPublisherGateway(node),
            teleop_command_gateway=RclpyTeleopCommandGateway(node),
        )
        uvicorn.run(app, host=host, port=port, reload=False)
    finally:
        node.destroy_node()
        rclpy.shutdown()


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


@config_cli.command("import-legacy-screen")
def import_legacy_screen(
    config_id: str = typer.Argument(..., help="Configuration ID to store."),
    source_path: Path = typer.Argument(..., help="Legacy screen JSON file to import."),
    application_id: str = typer.Option("legacy-application", "--application-id", help="Application ID to wrap the screen."),
    application_name: str = typer.Option("Legacy Application", "--application-name", help="Application name to wrap the screen."),
    storage: ConfigurationStorageKind = typer.Option("file", "--storage", help="Storage backend to write to."),
    configuration_dir: Path | None = typer.Option(None, "--configuration-dir", help="JSON configuration directory."),
    database_path: Path | None = typer.Option(None, "--database-path", help="SQLite database path."),
) -> None:
    """Import a legacy extender_ui screen JSON file into storage."""
    repository = open_configuration_repository(storage, configuration_dir, database_path)
    screen = load_legacy_screen_file(source_path)
    bundle = ConfigurationBundle(
        metadata=ConfigurationMetadata(source=f"legacy-screen:{source_path.name}"),
        applications=(
            ApplicationConfig(
                id=application_id,
                name=application_name,
                screens=(screen,),
            ),
        ),
    )
    repository.upsert(config_id, bundle)
    typer.echo(f"Imported legacy screen {screen.id} as {config_id}")


@config_cli.command("import-legacy-application")
def import_legacy_application(
    config_id: str = typer.Argument(..., help="Configuration ID to store."),
    source_path: Path = typer.Argument(..., help="Legacy application JSON file to import."),
    storage: ConfigurationStorageKind = typer.Option("file", "--storage", help="Storage backend to write to."),
    configuration_dir: Path | None = typer.Option(None, "--configuration-dir", help="JSON configuration directory."),
    database_path: Path | None = typer.Option(None, "--database-path", help="SQLite database path."),
) -> None:
    """Import a legacy extender_ui application JSON file into storage."""
    repository = open_configuration_repository(storage, configuration_dir, database_path)
    application = load_legacy_application_file(source_path)
    bundle = ConfigurationBundle(
        metadata=ConfigurationMetadata(source=f"legacy-application:{source_path.name}"),
        applications=(application,),
    )
    repository.upsert(config_id, bundle)
    typer.echo(f"Imported legacy application {application.id} as {config_id}")


@config_cli.command("import-legacy-application-screens")
def import_legacy_application_screens(
    config_id: str = typer.Argument(..., help="Configuration ID to store."),
    application_path: Path = typer.Argument(..., help="Legacy application JSON file to import."),
    screen_paths: list[Path] = typer.Argument(..., help="Legacy screen JSON files to attach to the application."),
    storage: ConfigurationStorageKind = typer.Option("file", "--storage", help="Storage backend to write to."),
    configuration_dir: Path | None = typer.Option(None, "--configuration-dir", help="JSON configuration directory."),
    database_path: Path | None = typer.Option(None, "--database-path", help="SQLite database path."),
) -> None:
    """Import a legacy extender_ui application and replace matching screen placeholders with real screens."""
    repository = open_configuration_repository(storage, configuration_dir, database_path)
    application = load_legacy_application_with_screens_file(application_path, tuple(screen_paths))
    bundle = ConfigurationBundle(
        metadata=ConfigurationMetadata(source=f"legacy-application-screens:{application_path.name}"),
        applications=(application,),
    )
    repository.upsert(config_id, bundle)
    typer.echo(f"Imported legacy application {application.id} with {len(application.screens)} screens as {config_id}")


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
