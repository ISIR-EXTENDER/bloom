from apps.bloom_api.settings import Settings, get_settings


def test_default_settings_are_local() -> None:
    settings = Settings()

    assert settings.api_prefix == "/api/v1"
    assert settings.configuration_dir.name == "configurations"
    assert settings.environment == "local"
    assert settings.service_name == "bloom-api"


def test_default_runtime_allowlists_cover_petanque_publish_topics() -> None:
    settings = Settings()

    assert {
        "/cmd/gripper",
        "/cmd/joystick_rxry",
        "/cmd/joystick_rz",
        "/cmd/joystick_xy",
        "/cmd/joystick_z",
        "/cmd/max_velocity",
        "/cmd/petanque/round",
        "/petanque/measure/request_image",
        "/petanque/teleop/enabled",
        "/petanque/throw/alpha",
        "/petanque/throw/gesture",
        "/petanque_state_machine/change_state",
        "/teleop_cmd",
        "/ui/load_pose",
        "/ui/navigation",
        "/ui/ros_toggle",
        "/ui/save_pose",
        "/visual_servoing/enabled",
    }.issubset(settings.allowed_ros_publish_topics)
    assert "geometry_msgs/msg/Vector3" in settings.allowed_ros_message_types
    assert "std_msgs/msg/Float64MultiArray" in settings.allowed_ros_message_types
    assert "std_msgs/msg/UInt8MultiArray" in settings.allowed_ros_message_types


def test_get_settings_is_cached() -> None:
    get_settings.cache_clear()

    first = get_settings()
    second = get_settings()

    assert first is second


def test_recording_settings_can_be_loaded_from_environment(monkeypatch) -> None:
    monkeypatch.setenv("BLOOM_ALLOWED_RECORDING_TOPICS", "/teleop_cmd,/joint_states")
    monkeypatch.setenv("BLOOM_ALLOWED_RECORDING_OUTPUT_FOLDERS", "data/recordings,data/user-tests")
    monkeypatch.setenv("BLOOM_RUNTIME_RECORDING_BASE_DIRECTORY", "/tmp/bloom-recordings")
    monkeypatch.setenv("BLOOM_RUNTIME_RECORDING_EXECUTABLE", "ros2")
    monkeypatch.setenv("BLOOM_RUNTIME_RECORDING_GATEWAY", "rosbag")

    settings = Settings.from_environment()

    assert settings.allowed_recording_topics == ("/teleop_cmd", "/joint_states")
    assert settings.allowed_recording_output_folders == ("data/recordings", "data/user-tests")
    assert str(settings.runtime_recording_base_directory) == "/tmp/bloom-recordings"
    assert settings.runtime_recording_executable == "ros2"
    assert settings.runtime_recording_gateway == "rosbag"


def test_runtime_ros_policy_settings_can_be_loaded_from_environment(monkeypatch) -> None:
    monkeypatch.setenv("BLOOM_ALLOWED_ROS_MESSAGE_TYPES", "std_msgs/msg/String,std_msgs/msg/Bool")
    monkeypatch.setenv("BLOOM_ALLOWED_ROS_PUBLISH_TOPICS", "/safe/topic,/other/safe_topic")
    monkeypatch.setenv("BLOOM_ALLOWED_TELEOP_TARGETS", "/teleop_cmd,/custom_teleop")
    monkeypatch.setenv("BLOOM_RUNTIME_COMMAND_RATE_LIMIT_PER_SECOND", "25")

    settings = Settings.from_environment()

    assert settings.allowed_ros_message_types == ("std_msgs/msg/String", "std_msgs/msg/Bool")
    assert settings.allowed_ros_publish_topics == ("/safe/topic", "/other/safe_topic")
    assert settings.allowed_teleop_targets == ("/teleop_cmd", "/custom_teleop")
    assert settings.runtime_command_rate_limit_per_second == 25
