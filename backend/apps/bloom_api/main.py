from fastapi import FastAPI

from apps.bloom_api.routes import api_router
from apps.bloom_api.settings import Settings, get_settings
from libs.config import InMemoryConfigurationRepository


def create_app(
    settings: Settings | None = None,
    configuration_repository: InMemoryConfigurationRepository | None = None,
) -> FastAPI:
    app_settings = settings or get_settings()
    app = FastAPI(
        title=app_settings.app_name,
        version=app_settings.app_version,
        description=app_settings.app_description,
    )

    app.state.settings = app_settings
    app.state.configuration_repository = configuration_repository or InMemoryConfigurationRepository()
    app.include_router(api_router, prefix=app_settings.api_prefix)

    return app


app = create_app()
