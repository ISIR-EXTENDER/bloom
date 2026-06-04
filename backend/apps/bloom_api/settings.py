from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field


class Settings(BaseModel):
    app_name: str = "Bloom API"
    app_version: str = "0.1.0"
    app_description: str = "Configurable web interface backend for robot supervision and control."
    api_prefix: str = "/api/v1"
    service_name: str = "bloom-api"
    environment: Literal["local", "test", "staging", "production"] = Field(default="local")
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
    allowed_recording_output_folders: tuple[str, ...] = ("data/recordings",)


@lru_cache
def get_settings() -> Settings:
    return Settings()
