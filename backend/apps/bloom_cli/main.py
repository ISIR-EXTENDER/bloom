import typer
import uvicorn

from apps.bloom_api.settings import get_settings

cli = typer.Typer(
    name="bloom",
    help="Bloom backend developer and operations commands.",
)
api_cli = typer.Typer(help="Run and inspect the Bloom API.")
cli.add_typer(api_cli, name="api")


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


def main() -> None:
    cli()


if __name__ == "__main__":
    main()
