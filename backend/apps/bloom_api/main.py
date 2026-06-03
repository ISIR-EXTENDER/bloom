from fastapi import FastAPI

from apps.bloom_api.routes import api_router
from apps.bloom_api.security import install_security_headers
from apps.bloom_api.settings import Settings, get_settings
from libs.config import ConfigurationRepository, create_configuration_repository
from libs.ros_adapters import (
    NoopRosPublisherGateway,
    NoopRosTopicCatalogGateway,
    RosPublisherGateway,
    RosTopicCatalogGateway,
)
from libs.sessions import RuntimeSessionManager


def create_app(
    settings: Settings | None = None,
    configuration_repository: ConfigurationRepository | None = None,
    ros_publisher_gateway: RosPublisherGateway | None = None,
    ros_topic_catalog_gateway: RosTopicCatalogGateway | None = None,
) -> FastAPI:
    app_settings = settings or get_settings()
    app = FastAPI(
        title=app_settings.app_name,
        version=app_settings.app_version,
        description=app_settings.app_description,
    )

    app.state.settings = app_settings
    app.state.configuration_repository = configuration_repository or create_app_configuration_repository(app_settings)
    app.state.ros_publisher_gateway = ros_publisher_gateway or NoopRosPublisherGateway()
    app.state.ros_topic_catalog_gateway = ros_topic_catalog_gateway or NoopRosTopicCatalogGateway()
    app.state.runtime_session_manager = RuntimeSessionManager()
    install_security_headers(app)
    app.include_router(api_router, prefix=app_settings.api_prefix)

    return app


def create_app_configuration_repository(settings: Settings) -> ConfigurationRepository:
    return create_configuration_repository(
        settings.configuration_storage,
        configuration_dir=settings.configuration_dir,
        database_path=settings.configuration_database_path,
    )


app = create_app()
