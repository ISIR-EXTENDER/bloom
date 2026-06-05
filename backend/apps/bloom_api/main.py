from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from apps.bloom_api.routes import api_router
from apps.bloom_api.security import install_http_rate_limit, install_security_headers
from apps.bloom_api.settings import Settings, get_settings
from libs.config import ConfigurationRepository, create_configuration_repository
from libs.ros_adapters import (
    NoopRosPublisherGateway,
    NoopRosTopicCatalogGateway,
    RosPublisherGateway,
    RosTopicCatalogGateway,
)
from libs.ros_adapters.safety import RuntimeCommandPolicy
from libs.sessions import RuntimeSessionManager
from libs.sessions import (
    InMemoryRuntimeAuditLog,
    NoopRuntimeRecordingGateway,
    NoopRuntimeTopicSubscriptionGateway,
    RosbagRuntimeRecordingGateway,
    NoopTeleopCommandGateway,
    RuntimeCommandRateLimiter,
    RuntimeAuditLog,
    RuntimeRecordingGateway,
    RuntimeTopicSubscriptionGateway,
    TeleopCommandGateway,
)


def create_app(
    settings: Settings | None = None,
    configuration_repository: ConfigurationRepository | None = None,
    ros_publisher_gateway: RosPublisherGateway | None = None,
    ros_topic_catalog_gateway: RosTopicCatalogGateway | None = None,
    runtime_topic_subscription_gateway: RuntimeTopicSubscriptionGateway | None = None,
    runtime_audit_log: RuntimeAuditLog | None = None,
    runtime_command_policy: RuntimeCommandPolicy | None = None,
    runtime_command_rate_limiter: RuntimeCommandRateLimiter | None = None,
    runtime_recording_gateway: RuntimeRecordingGateway | None = None,
    teleop_command_gateway: TeleopCommandGateway | None = None,
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
    app.state.runtime_topic_subscription_gateway = (
        runtime_topic_subscription_gateway or NoopRuntimeTopicSubscriptionGateway()
    )
    app.state.runtime_audit_log = runtime_audit_log or InMemoryRuntimeAuditLog()
    app.state.runtime_command_policy = runtime_command_policy or RuntimeCommandPolicy(
        allowed_message_types=app_settings.allowed_ros_message_types,
        allowed_publish_topics=app_settings.allowed_ros_publish_topics,
        allowed_recording_topics=app_settings.allowed_recording_topics,
        allowed_teleop_targets=app_settings.allowed_teleop_targets,
    )
    app.state.runtime_command_rate_limiter = runtime_command_rate_limiter or RuntimeCommandRateLimiter(
        max_commands_per_second=app_settings.runtime_command_rate_limit_per_second
    )
    app.state.runtime_recording_gateway = runtime_recording_gateway or create_runtime_recording_gateway(app_settings)
    app.state.teleop_command_gateway = teleop_command_gateway or NoopTeleopCommandGateway()
    app.state.runtime_session_manager = RuntimeSessionManager()
    app.state.http_rate_limit_buckets = {}
    install_cors(app, app_settings)
    install_http_rate_limit(app)
    install_security_headers(app)
    app.include_router(api_router, prefix=app_settings.api_prefix)

    return app


def install_cors(app: FastAPI, settings: Settings) -> None:
    if not settings.cors_allowed_origins:
        return

    app.add_middleware(
        CORSMiddleware,
        allow_credentials=False,
        allow_headers=["Content-Type", "X-Bloom-API-Key"],
        allow_methods=["DELETE", "GET", "OPTIONS", "POST", "PUT"],
        allow_origins=list(settings.cors_allowed_origins),
    )


def create_app_configuration_repository(settings: Settings) -> ConfigurationRepository:
    return create_configuration_repository(
        settings.configuration_storage,
        configuration_dir=settings.configuration_dir,
        database_path=settings.configuration_database_path,
    )


def create_runtime_recording_gateway(settings: Settings) -> RuntimeRecordingGateway:
    if settings.runtime_recording_gateway == "rosbag":
        return RosbagRuntimeRecordingGateway(
            base_directory=settings.runtime_recording_base_directory,
            executable=settings.runtime_recording_executable,
        )

    return NoopRuntimeRecordingGateway()


app = create_app()
