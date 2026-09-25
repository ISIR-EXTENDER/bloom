from pathlib import Path
from threading import Thread

import typer
import uvicorn

from apps.bloom_api.main import (
    create_app,
    create_camera_frame_gateway,
    create_camera_stream_gateway,
    create_teleop_command_gateway,
)
from apps.bloom_api.settings import get_settings
from libs.config import (
    ApplicationConfig,
    ConfigurationBundle,
    ConfigurationMetadata,
    ConfigurationNotFoundError,
    ConfigurationRepository,
    ConfigurationStorageKind,
    create_configuration_repository,
    load_configuration_file,
    load_legacy_application_file,
    load_legacy_application_with_screens_file,
    load_legacy_screen_file,
    save_configuration_file,
)
from libs.config.seed import (
    DEFAULT_SEED_DIR,
    adopt_file_configurations,
    configuration_share_status,
    seed_configurations,
    strip_seed_fingerprint,
)
from libs.config.seed import publish_configuration as publish_configuration_to_seed
from libs.ros_adapters import RclpyRosServiceGateway, RclpyRosTopicCatalogGateway
from libs.ros_adapters.parameters import RclpyRosParameterGateway
from libs.ros_adapters.rclpy_publishers import RclpyRosPublisherGateway
from libs.ros_adapters.rclpy_topic_streams import RclpyRuntimeTopicSubscriptionGateway
from libs.ros_adapters.robot_model import RclpyRobotModelGateway

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
        typer.echo(
            "ROS 2 Python packages are not available. Source a ROS environment before running this command.", err=True
        )
        raise typer.Exit(code=1) from exc

    rclpy.init()
    node = Node(node_name)
    executor = rclpy.executors.SingleThreadedExecutor()
    executor.add_node(node)
    spin_thread = Thread(target=executor.spin, daemon=True)
    spin_thread.start()
    try:
        parameter_gateway = RclpyRosParameterGateway(node)
        app = create_app(
            ros_publisher_gateway=RclpyRosPublisherGateway(node),
            ros_parameter_gateway=parameter_gateway,
            robot_model_gateway=RclpyRobotModelGateway(parameter_gateway, get_settings().ros_robot_description_node),
            ros_service_gateway=RclpyRosServiceGateway(node),
            ros_topic_catalog_gateway=RclpyRosTopicCatalogGateway(node),
            runtime_topic_subscription_gateway=RclpyRuntimeTopicSubscriptionGateway(node),
            teleop_command_gateway=create_teleop_command_gateway(get_settings(), node),
        )
        app.state.camera_frame_gateway = create_camera_frame_gateway(node)
        app.state.camera_stream_gateway = create_camera_stream_gateway(node)
        uvicorn.run(app, host=host, port=port, reload=False)
    finally:
        executor.shutdown()
        spin_thread.join(timeout=2.0)
        node.destroy_node()
        rclpy.shutdown()


def open_configuration_repository(
    storage: ConfigurationStorageKind | None,
    configuration_dir: Path | None,
    database_path: Path | None,
) -> ConfigurationRepository:
    """Open the store the API would use, unless told otherwise.

    These commands used to default to file storage no matter how the server was
    configured, so running one against a SQLite-backed server read a different
    store than the running app and reported stale content without saying so.
    """
    settings = get_settings()
    kind = storage or settings.configuration_storage
    file_store_dir = configuration_dir or settings.configuration_dir
    repository = create_configuration_repository(
        kind,
        configuration_dir=file_store_dir,
        database_path=database_path or settings.configuration_database_path,
    )
    if kind == "sqlite":
        # As at API startup: a first CLI write would otherwise make the store non-empty and hide the file store.
        adopt_file_configurations(repository, configuration_dir=file_store_dir)
    return repository


@config_cli.command("list")
def list_configurations(
    storage: ConfigurationStorageKind | None = typer.Option(None, "--storage", help="Storage backend to inspect."),
    configuration_dir: Path | None = typer.Option(None, "--configuration-dir", help="JSON configuration directory."),
    database_path: Path | None = typer.Option(None, "--database-path", help="SQLite database path."),
) -> None:
    """List stored configuration IDs."""
    repository = open_configuration_repository(storage, configuration_dir, database_path)
    for config_id in repository.list_ids():
        typer.echo(config_id)


@config_cli.command("seed")
def seed_shared_applications(
    force: list[str] = typer.Option(
        [],
        "--force",
        help="Reset these application IDs to the committed version, discarding local edits.",
    ),
    storage: ConfigurationStorageKind | None = typer.Option(None, "--storage", help="Storage backend to write to."),
    configuration_dir: Path | None = typer.Option(None, "--configuration-dir", help="JSON configuration directory."),
    database_path: Path | None = typer.Option(None, "--database-path", help="SQLite database path."),
    seed_dir: Path = typer.Option(DEFAULT_SEED_DIR, "--seed-dir", help="Directory of shipped bundles."),
) -> None:
    """Import the shared applications this store is missing.

    An edited ID is left untouched, because it holds this machine's own screen
    layouts and edits; use --force to reset one deliberately. A copy nobody has
    edited is updated to the shipped version.
    """
    repository = open_configuration_repository(storage, configuration_dir, database_path)
    outcome = seed_configurations(repository, seed_dir=seed_dir, force_ids=frozenset(force))

    for config_id in outcome.imported:
        typer.echo(f"Imported {config_id}")
    for config_id in outcome.upgraded:
        typer.echo(f"Updated {config_id} to the shipped version")
    for config_id in outcome.skipped:
        typer.echo(f"Kept local {config_id}")
    if not outcome.changed:
        typer.echo("Nothing to import.")


@config_cli.command("status")
def configuration_status(
    storage: ConfigurationStorageKind | None = typer.Option(None, "--storage", help="Storage backend to inspect."),
    configuration_dir: Path | None = typer.Option(None, "--configuration-dir", help="JSON configuration directory."),
    database_path: Path | None = typer.Option(None, "--database-path", help="SQLite database path."),
    seed_dir: Path = typer.Option(DEFAULT_SEED_DIR, "--seed-dir", help="Directory of shipped bundles."),
) -> None:
    """Show which applications differ from the version committed to the repo."""
    repository = open_configuration_repository(storage, configuration_dir, database_path)
    hints = {
        "deleted": " (run: bloom config seed --force {id} to restore it)",
        "missing": " (run: bloom config seed)",
        "local": " (run: bloom config publish {id} to share it)",
        "outdated": " (run: bloom config seed to take the shipped version)",
        "edited": " (run: bloom config publish {id} to share your changes)",
        "shared": "",
    }
    for config_id, share_status in configuration_share_status(repository, seed_dir).items():
        typer.echo(f"{share_status:<9} {config_id}{hints[share_status].format(id=config_id)}")


@config_cli.command("publish")
def publish_configuration(
    config_id: str = typer.Argument(..., help="Configuration ID to publish to the repository."),
    storage: ConfigurationStorageKind | None = typer.Option(None, "--storage", help="Storage backend to read from."),
    configuration_dir: Path | None = typer.Option(None, "--configuration-dir", help="JSON configuration directory."),
    database_path: Path | None = typer.Option(None, "--database-path", help="SQLite database path."),
    seed_dir: Path = typer.Option(DEFAULT_SEED_DIR, "--seed-dir", help="Directory of shipped bundles."),
) -> None:
    """Write a local configuration back out as a shared application.

    This is how an app built in the builder becomes one the team gets on
    clone: publish it, then commit the file it writes.
    """
    repository = open_configuration_repository(storage, configuration_dir, database_path)
    try:
        outcome = publish_configuration_to_seed(repository, config_id, seed_dir)
    except ConfigurationNotFoundError:
        known = ", ".join(repository.list_ids()) or "none"
        raise typer.BadParameter(f"No configuration {config_id!r} in this store. Available: {known}") from None

    if outcome.already_published:
        typer.echo(f"{config_id} already matches {outcome.destination}; nothing to commit.")
        return
    typer.echo(f"Published {config_id} to {outcome.destination}")
    typer.echo("Commit that file to share it with the team.")


@config_cli.command("import")
def import_configuration(
    config_id: str = typer.Argument(..., help="Configuration ID to store."),
    source_path: Path = typer.Argument(..., help="Configuration bundle JSON file to import."),
    storage: ConfigurationStorageKind | None = typer.Option(None, "--storage", help="Storage backend to write to."),
    configuration_dir: Path | None = typer.Option(None, "--configuration-dir", help="JSON configuration directory."),
    database_path: Path | None = typer.Option(None, "--database-path", help="SQLite database path."),
) -> None:
    """Import a configuration bundle from JSON into storage."""
    repository = open_configuration_repository(storage, configuration_dir, database_path)
    # An imported bundle is someone's work, even when it was exported from a seeded copy.
    repository.upsert(config_id, strip_seed_fingerprint(load_configuration_file(source_path)))
    typer.echo(f"Imported {config_id}")


@config_cli.command("import-legacy-screen")
def import_legacy_screen(
    config_id: str = typer.Argument(..., help="Configuration ID to store."),
    source_path: Path = typer.Argument(..., help="Legacy screen JSON file to import."),
    application_id: str = typer.Option(
        "legacy-application", "--application-id", help="Application ID to wrap the screen."
    ),
    application_name: str = typer.Option(
        "Legacy Application", "--application-name", help="Application name to wrap the screen."
    ),
    storage: ConfigurationStorageKind | None = typer.Option(None, "--storage", help="Storage backend to write to."),
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
    storage: ConfigurationStorageKind | None = typer.Option(None, "--storage", help="Storage backend to write to."),
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
    storage: ConfigurationStorageKind | None = typer.Option(None, "--storage", help="Storage backend to write to."),
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
    storage: ConfigurationStorageKind | None = typer.Option(None, "--storage", help="Storage backend to read from."),
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
