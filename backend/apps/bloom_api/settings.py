import os
from functools import lru_cache
from pathlib import Path
from typing import Literal, TypeVar

from pydantic import BaseModel, Field, field_validator, model_validator

from libs.config.seed import DEFAULT_SEED_DIR
from libs.manager_contract import MANAGER_NODE, TABLET_COMMAND_TOPIC

T = TypeVar("T", bound=str)
MIN_PRODUCTION_API_KEY_LENGTH = 32


class Settings(BaseModel):
    app_name: str = "Bloom API"
    app_version: str = "0.3.0"
    app_description: str = "Configurable web interface backend for robot supervision and control."
    api_prefix: str = "/api/v1"
    service_name: str = "bloom-api"
    environment: Literal["local", "test", "staging", "production"] = Field(default="local")
    auth_enabled: bool = False
    admin_api_key: str = ""
    operator_api_key: str = ""
    #: Read-only key for a supervisor mirror. It can watch a session and never
    #: command the arm, so a second screen needs no credential that could.
    observer_api_key: str = ""
    # Robot-facing deployments allow one connected runtime to command at once.
    runtime_control_required: bool = True
    cors_allowed_origins: tuple[str, ...] = (
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    )
    http_rate_limit_per_minute: int = Field(default=600, ge=0)
    configuration_storage: Literal["file", "sqlite"] = Field(default="sqlite")
    configuration_dir: Path = Field(default=Path("data/configurations"))
    configuration_database_path: Path = Field(default=Path("data/bloom.db"))
    theme_asset_dir: Path = Field(default=Path("data/theme-assets"))
    # Import the bundles in backend/seed/applications that this store is
    # missing. Off for tests that assert on an empty store.
    seed_shared_applications: bool = Field(default=True)
    #: Where the shared applications live; the Builder's "Share" writes here for someone to commit.
    seed_dir: Path = Field(default=DEFAULT_SEED_DIR)
    allowed_ros_message_types: tuple[str, ...] = (
        "geometry_msgs/msg/TwistStamped",
        "sensor_msgs/msg/CompressedImage",
        "sensor_msgs/msg/JointState",
        "std_msgs/msg/Bool",
        # tools/hub takes [pin, state, ...] as floats on /hub/digital_output.
        "std_msgs/msg/Float32MultiArray",
        "std_msgs/msg/Float64",
        "std_msgs/msg/Float64MultiArray",
        "std_msgs/msg/Int32",
        "std_msgs/msg/Int32MultiArray",
        "std_msgs/msg/String",
        "std_msgs/msg/UInt8MultiArray",
    )
    allowed_ros_publish_topics: tuple[str, ...] = (
        # qontrol runtime speed limits, from cartesian_manager's explorer bringup.
        "/explorer_user_interfaces/rqt_armcontrol/max_angular_speed",
        "/explorer_user_interfaces/rqt_armcontrol/max_linear_speed",
        "/gripper_controller/commands",
        # tools/hub's Arduino bridge: data [pin, state, pin, state, ...].
        "/hub/digital_output",
        # cartesian_manager behaviours and shapers (geometric/*, behaviour/*).
        "/mode_request",
        # apps-petanque's yasmin state machine.
        "/petanque_state_machine/change_state",
        # input_interfaces visual servoing node.
        "/ui/visual_servoing/on",
        "/ui/visual_servoing/save",
        # The whole /ui/ namespace: apps authored in the builder may bridge
        # their own UI topics (e.g. /ui/ros_toggle) without a backend edit.
        "/ui/",
    )
    # Which arm this deployment drives, shown on the operator screen. One
    # backend instance serves one robot.
    robot_name: str = ""
    ros_command_backend: Literal["cartesian_manager", "teleop_command"] = Field(default="cartesian_manager")
    # Default stamp; must be one of the manager's command frames.
    ros_command_frame_id: str = "base_link"
    # This deployment's end-effector frame, as cartesian_manager names it in
    # frames.ee_frame: effector_frame on both arms since cartesian_manager d9a1fa5.
    # Empty means nobody has said, and Bloom then offers no tool frame at all.
    ros_ee_frame_id: str = ""
    # The node whose robot_description parameter the 3D robot view draws.
    ros_robot_description_node: str = "/robot_state_publisher"
    # The frames cartesian_manager accepts as rotation references. base_link and
    # hybrid_frame exist in every manager config; the end-effector frame differs
    # per robot, and advertising both robots' names let an operator pick a frame
    # the manager silently discards. Set BLOOM_ROS_EE_FRAME_ID (or the whole
    # list with BLOOM_ALLOWED_COMMAND_FRAME_IDS) to offer the tool frame.
    allowed_command_frame_ids: tuple[str, ...] = ("base_link", "hybrid_frame")
    # Topics a joystick may drive beyond the manager's own inputs. The manager's declared default stays here so
    # driving works before its parameters are first read.
    allowed_teleop_targets: tuple[str, ...] = (TABLET_COMMAND_TOPIC,)
    # The node whose declared inputs a joystick may drive: `inputs.sources`, each on `topics.<source>_command`.
    teleop_input_node: str = MANAGER_NODE
    teleop_target_refresh_sec: float = Field(default=5.0, gt=0)
    # Live tuning through the nodes' own parameter services, as "<node>:<parameter>".
    # cartesian_manager rereads these every tick; joint targets, inputs and frames
    # stay startup-only (PR #11) and are deliberately absent.
    allowed_ros_parameters: tuple[str, ...] = (
        # Which sources the manager sums; a live gate on the joystick and the visual servoing node.
        "/cartesian_manager:inputs.joystick.enabled",
        "/cartesian_manager:inputs.visual_servoing.enabled",
        "/cartesian_manager:shapers.snake.gain",
        "/cartesian_manager:shapers.jaco.min_radius",
        "/cartesian_manager:shapers.jaco.max_angular_velocity",
        "/cartesian_manager:rate_limiter.max_linear_acceleration",
        "/cartesian_manager:rate_limiter.max_angular_acceleration",
        # apps-petanque's throw trajectory, the tuning the Petanque app lost when it left the old backend.
        "/petanque_throw:alpha",
        "/petanque_throw:total_duration",
        "/petanque_throw:angle_between_start_and_finish",
    )
    # Trigger-style services the runtime may call. The fault reset is the
    # Kinova gen3's recovery path.
    allowed_ros_service_calls: tuple[str, ...] = ("/fault_controller/reset_fault",)
    allowed_ros_service_types: tuple[str, ...] = (
        "example_interfaces/srv/Trigger",
        "std_srvs/srv/Trigger",
    )
    # The browser coalesces the complete twist to at most 30 Hz. Keep a 2x
    # margin for timing jitter while retaining a hard server-side ceiling.
    runtime_command_rate_limit_per_second: int = Field(default=60, ge=0)
    # Per topic, per socket: the newest sample each interval. Zero forwards every sample.
    runtime_topic_max_rate_hz: int = Field(default=30, ge=0)
    allowed_recording_topics: tuple[str, ...] = (
        "/cartesian_command",
        # qontrol's Jacobian, for the manipulability view in Bloom Debug.
        "/ee_jac",
        "/ee_pose",
        "/ee_velocity",
        "/joint_states",
        "/joint_target_command",
        "/joystick_cartesian_command",
        "/mode_request",
        TABLET_COMMAND_TOPIC,
        # The measure bridge's ball/target vectors, JSON in a String.
        "/petanque/measure/result_vectors",
        "/petanque_state_machine/change_state",
        # The joint command the QP controller writes. Against /joint_states it is tracking error,
        # and it is the only visible sign of a QP that stopped solving: the controller has no else
        # branch on a failed solve and publishes no fault.
        "/qontrol_controller/commands",
        # qontrol's estimated tip-force overload flag (force norm >= force_threshold).
        "/qontrol_explorer/effort_overload",
        "/rosout",
        "/tag_detections",
        "/visual_servoing_cartesian_command",
        "/visual_servoing/error_TAGtoTAGd",
        "/visual_servoing/velocity_command",
    )
    allowed_recording_output_folders: tuple[str, ...] = ("data/recordings",)
    runtime_recording_gateway: Literal["noop", "rosbag"] = Field(default="noop")
    runtime_recording_base_directory: Path = Field(default=Path("."))
    runtime_recording_executable: str = "ros2"

    @field_validator("ros_command_frame_id")
    @classmethod
    def command_frame_id_is_plain(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("ros_command_frame_id must not be empty")
        if any(character.isspace() for character in normalized):
            raise ValueError("ros_command_frame_id must not contain whitespace")
        return normalized

    @field_validator("allowed_command_frame_ids")
    @classmethod
    def command_frame_ids_are_plain(cls, values: tuple[str, ...]) -> tuple[str, ...]:
        normalized: list[str] = []
        for value in values:
            frame_id = value.strip()
            if not frame_id or any(character.isspace() for character in frame_id):
                raise ValueError("allowed_command_frame_ids must contain non-empty frame names without whitespace")
            if frame_id not in normalized:
                normalized.append(frame_id)
        return tuple(normalized)

    @model_validator(mode="after")
    def ee_frame_joins_the_allowlist(self) -> "Settings":
        """The named end-effector frame is offered; an unnamed one never is."""
        ee_frame_id = self.ros_ee_frame_id.strip()
        if ee_frame_id and ee_frame_id not in self.allowed_command_frame_ids:
            object.__setattr__(
                self,
                "allowed_command_frame_ids",
                (*self.allowed_command_frame_ids, ee_frame_id),
            )
        return self

    @model_validator(mode="after")
    def cartesian_manager_default_frame_is_allowed(self) -> "Settings":
        if (
            self.ros_command_backend == "cartesian_manager"
            and self.ros_command_frame_id not in self.allowed_command_frame_ids
        ):
            raise ValueError("ros_command_frame_id must be present in allowed_command_frame_ids")
        return self

    @model_validator(mode="after")
    def production_requires_authentication(self) -> "Settings":
        if self.environment == "test" and "runtime_control_required" not in self.model_fields_set:
            self.runtime_control_required = False
        if self.environment == "production" and (not self.auth_enabled or not self.admin_api_key):
            raise ValueError("production Bloom API requires auth_enabled=true and an admin_api_key")
        if self.environment == "production" and not self.runtime_control_required:
            raise ValueError("production Bloom API requires runtime_control_required=true")
        if self.environment == "production":
            self._require_production_perimeter()
        return self

    def _require_production_perimeter(self) -> None:
        # A shared key resolves to the stronger role, so an observer key equal to the operator key can drive.
        keys = [key for key in (self.admin_api_key, self.operator_api_key, self.observer_api_key) if key]
        if any(len(key) < MIN_PRODUCTION_API_KEY_LENGTH for key in keys):
            raise ValueError(f"production Bloom API keys must be at least {MIN_PRODUCTION_API_KEY_LENGTH} characters")
        if len(set(keys)) != len(keys):
            raise ValueError("production Bloom API keys must differ between roles")
        if "*" in self.cors_allowed_origins:
            raise ValueError("production Bloom API requires explicit cors_allowed_origins, not *")

    @classmethod
    def from_environment(cls) -> "Settings":
        return cls(
            admin_api_key=os.getenv("BLOOM_ADMIN_API_KEY", ""),
            api_prefix=os.getenv("BLOOM_API_PREFIX", cls.model_fields["api_prefix"].default),
            app_description=os.getenv("BLOOM_APP_DESCRIPTION", cls.model_fields["app_description"].default),
            app_name=os.getenv("BLOOM_APP_NAME", cls.model_fields["app_name"].default),
            app_version=os.getenv("BLOOM_APP_VERSION", cls.model_fields["app_version"].default),
            auth_enabled=_read_bool_env("BLOOM_AUTH_ENABLED", default=False),
            seed_shared_applications=_read_bool_env("BLOOM_SEED_SHARED_APPLICATIONS", default=True),
            seed_dir=Path(os.getenv("BLOOM_SEED_DIR", str(DEFAULT_SEED_DIR))),
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
            observer_api_key=os.getenv("BLOOM_OBSERVER_API_KEY", ""),
            operator_api_key=os.getenv("BLOOM_OPERATOR_API_KEY", ""),
            runtime_control_required=_read_bool_env("BLOOM_RUNTIME_CONTROL_REQUIRED", default=True),
            allowed_ros_message_types=_read_tuple_env(
                "BLOOM_ALLOWED_ROS_MESSAGE_TYPES",
                cls.model_fields["allowed_ros_message_types"].default,
            ),
            allowed_ros_publish_topics=_read_tuple_env(
                "BLOOM_ALLOWED_ROS_PUBLISH_TOPICS",
                cls.model_fields["allowed_ros_publish_topics"].default,
            ),
            allowed_teleop_targets=_read_tuple_env(
                "BLOOM_ALLOWED_TELEOP_TARGETS",
                cls.model_fields["allowed_teleop_targets"].default,
            ),
            teleop_input_node=os.getenv("BLOOM_TELEOP_INPUT_NODE", MANAGER_NODE),
            allowed_ros_parameters=_read_tuple_env(
                "BLOOM_ALLOWED_ROS_PARAMETERS",
                cls.model_fields["allowed_ros_parameters"].default,
            ),
            ros_ee_frame_id=os.getenv(
                "BLOOM_ROS_EE_FRAME_ID",
                cls.model_fields["ros_ee_frame_id"].default,
            ),
            ros_robot_description_node=os.getenv(
                "BLOOM_ROS_ROBOT_DESCRIPTION_NODE",
                cls.model_fields["ros_robot_description_node"].default,
            ),
            allowed_command_frame_ids=_read_tuple_env(
                "BLOOM_ALLOWED_COMMAND_FRAME_IDS",
                cls.model_fields["allowed_command_frame_ids"].default,
            ),
            allowed_ros_service_calls=_read_tuple_env(
                "BLOOM_ALLOWED_ROS_SERVICE_CALLS",
                cls.model_fields["allowed_ros_service_calls"].default,
            ),
            allowed_ros_service_types=_read_tuple_env(
                "BLOOM_ALLOWED_ROS_SERVICE_TYPES",
                cls.model_fields["allowed_ros_service_types"].default,
            ),
            robot_name=os.getenv("BLOOM_ROBOT_NAME", ""),
            # Documented in the README but never read until now.
            ros_command_backend=_read_literal_env(
                "BLOOM_ROS_COMMAND_BACKEND",
                ("cartesian_manager", "teleop_command"),
                cls.model_fields["ros_command_backend"].default,
            ),
            ros_command_frame_id=os.getenv(
                "BLOOM_ROS_COMMAND_FRAME_ID",
                cls.model_fields["ros_command_frame_id"].default,
            ),
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
            runtime_command_rate_limit_per_second=_read_int_env(
                "BLOOM_RUNTIME_COMMAND_RATE_LIMIT_PER_SECOND",
                cls.model_fields["runtime_command_rate_limit_per_second"].default,
            ),
            runtime_topic_max_rate_hz=_read_int_env(
                "BLOOM_RUNTIME_TOPIC_MAX_RATE_HZ",
                cls.model_fields["runtime_topic_max_rate_hz"].default,
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
