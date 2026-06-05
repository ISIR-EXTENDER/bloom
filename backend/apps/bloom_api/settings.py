import os
from functools import lru_cache
from pathlib import Path
from typing import Literal, TypeVar

from pydantic import BaseModel, Field, model_validator

T = TypeVar("T", bound=str)


class Settings(BaseModel):
    app_name: str = "Bloom API"
    app_version: str = "0.1.0"
    app_description: str = "Configurable web interface backend for robot supervision and control."
    api_prefix: str = "/api/v1"
    service_name: str = "bloom-api"
    environment: Literal["local", "test", "staging", "production"] = Field(default="local")
    auth_enabled: bool = False
    admin_api_key: str = ""
    operator_api_key: str = ""
    cors_allowed_origins: tuple[str, ...] = (
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    )
    http_rate_limit_per_minute: int = Field(default=600, ge=0)
    configuration_storage: Literal["file", "sqlite"] = Field(default="file")
    configuration_dir: Path = Field(default=Path("data/configurations"))
    configuration_database_path: Path = Field(default=Path("data/bloom.db"))
    theme_asset_dir: Path = Field(default=Path("data/theme-assets"))
    allowed_ros_message_types: tuple[str, ...] = (
        "extender_msgs/msg/TeleopCommand",
        "geometry_msgs/msg/Twist",
        "geometry_msgs/msg/TwistStamped",
        "sensor_msgs/msg/JointState",
        "std_msgs/msg/Bool",
        "std_msgs/msg/Float64",
        "std_msgs/msg/Int32",
        "std_msgs/msg/Int32MultiArray",
        "std_msgs/msg/String",
    )
    allowed_ros_publish_topics: tuple[str, ...] = (
        "/cmd/gripper",
        "/cmd/joystick_rxry",
        "/cmd/joystick_rz",
        "/cmd/joystick_xy",
        "/cmd/joystick_z",
        "/cmd/max_velocity",
        "/cmd/petanque/round",
        "/petanque_state_machine/change_state",
        "/teleop_cmd",
        "/ui/load_pose",
        "/ui/navigation",
        "/ui/ros_toggle",
    )
    allowed_teleop_targets: tuple[str, ...] = ("/teleop_cmd",)
    runtime_command_rate_limit_per_second: int = Field(default=60, ge=0)
    allowed_recording_topics: tuple[str, ...] = (
        "/joint_states",
        "/sandbox_controller/velocity_command",
        "/teleop_cmd",
    )
    allowed_recording_output_folders: tuple[str, ...] = ("data/recordings",)
    runtime_recording_gateway: Literal["noop", "rosbag"] = Field(default="noop")
    runtime_recording_base_directory: Path = Field(default=Path("."))
    runtime_recording_executable: str = "ros2"

    @model_validator(mode="after")
    def production_requires_authentication(self) -> "Settings":
        if self.environment == "production" and (not self.auth_enabled or not self.admin_api_key):
            raise ValueError("production Bloom API requires auth_enabled=true and an admin_api_key")
        return self

    @classmethod
    def from_environment(cls) -> "Settings":
        return cls(
            admin_api_key=os.getenv("BLOOM_ADMIN_API_KEY", ""),
            api_prefix=os.getenv("BLOOM_API_PREFIX", cls.model_fields["api_prefix"].default),
            app_description=os.getenv("BLOOM_APP_DESCRIPTION", cls.model_fields["app_description"].default),
            app_name=os.getenv("BLOOM_APP_NAME", cls.model_fields["app_name"].default),
            app_version=os.getenv("BLOOM_APP_VERSION", cls.model_fields["app_version"].default),
            auth_enabled=_read_bool_env("BLOOM_AUTH_ENABLED", default=False),
            configuration_database_path=Path(
                os.getenv(
                    "BLOOM_CONFIGURATION_DATABASE_PATH",
                    str(cls.model_fields["configuration_database_path"].default),
                )
            ),
            configuration_dir=Path(
                os.getenv("BLOOM_CONFIGURATION_DIR", str(cls.model_fields["configuration_dir"].default))
            ),
            configuration_storage=_read_literal_env(
                "BLOOM_CONFIGURATION_STORAGE",
                ("file", "sqlite"),
                cls.model_fields["configuration_storage"].default,
            ),
            cors_allowed_origins=_read_tuple_env(
                "BLOOM_CORS_ALLOWED_ORIGINS",
                cls.model_fields["cors_allowed_origins"].default,
            ),
            environment=_read_literal_env(
                "BLOOM_ENVIRONMENT",
                ("local", "test", "staging", "production"),
                cls.model_fields["environment"].default,
            ),
            http_rate_limit_per_minute=_read_int_env(
                "BLOOM_HTTP_RATE_LIMIT_PER_MINUTE",
                cls.model_fields["http_rate_limit_per_minute"].default,
            ),
            operator_api_key=os.getenv("BLOOM_OPERATOR_API_KEY", ""),
            allowed_recording_topics=_read_tuple_env(
                "BLOOM_ALLOWED_RECORDING_TOPICS",
                cls.model_fields["allowed_recording_topics"].default,
            ),
            allowed_recording_output_folders=_read_tuple_env(
                "BLOOM_ALLOWED_RECORDING_OUTPUT_FOLDERS",
                cls.model_fields["allowed_recording_output_folders"].default,
            ),
            runtime_recording_base_directory=Path(
                os.getenv(
                    "BLOOM_RUNTIME_RECORDING_BASE_DIRECTORY",
                    str(cls.model_fields["runtime_recording_base_directory"].default),
                )
            ),
            runtime_recording_executable=os.getenv(
                "BLOOM_RUNTIME_RECORDING_EXECUTABLE",
                cls.model_fields["runtime_recording_executable"].default,
            ),
            runtime_recording_gateway=_read_literal_env(
                "BLOOM_RUNTIME_RECORDING_GATEWAY",
                ("noop", "rosbag"),
                cls.model_fields["runtime_recording_gateway"].default,
            ),
            service_name=os.getenv("BLOOM_SERVICE_NAME", cls.model_fields["service_name"].default),
            theme_asset_dir=Path(os.getenv("BLOOM_THEME_ASSET_DIR", str(cls.model_fields["theme_asset_dir"].default))),
        )


@lru_cache
def get_settings() -> Settings:
    return Settings.from_environment()


def _read_bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _read_int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    return int(value)


def _read_tuple_env(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    value = os.getenv(name)
    if value is None:
        return default
    return tuple(item.strip() for item in value.split(",") if item.strip())


def _read_literal_env(name: str, allowed_values: tuple[T, ...], default: T) -> T:
    value = os.getenv(name)
    if value is None:
        return default
    if value not in allowed_values:
        allowed_values_text = ", ".join(allowed_values)
        raise ValueError(f"{name} must be one of: {allowed_values_text}")
    return value
