import pytest
from pydantic import ValidationError

from apps.bloom_api.settings import Settings, get_settings


def test_command_frames_exclude_a_robot_the_deployment_did_not_name() -> None:
    # One backend serves one arm. Offering both robots' end-effector frames let
    # an operator pick Tool on Explorer and get a frame the manager discards.
    settings = Settings(environment="test")

    assert settings.allowed_command_frame_ids == ("base_link", "hybrid_frame")


def test_naming_the_end_effector_frame_offers_it() -> None:
    settings = Settings(environment="test", ros_ee_frame_id="ft_frame")

    assert settings.allowed_command_frame_ids == ("base_link", "hybrid_frame", "ft_frame")


def test_an_explicit_allowlist_already_holding_the_frame_is_left_alone() -> None:
    settings = Settings(
        environment="test",
        allowed_command_frame_ids=("base_link", "effector_frame"),
        ros_ee_frame_id="effector_frame",
    )

    assert settings.allowed_command_frame_ids == ("base_link", "effector_frame")


def test_default_settings_are_local() -> None:
    settings = Settings()

    assert settings.api_prefix == "/api/v1"
    assert settings.configuration_dir.name == "configurations"
    assert settings.environment == "local"
    assert settings.runtime_control_required is True
    assert settings.runtime_command_rate_limit_per_second == 60
    assert settings.service_name == "bloom-api"


def test_default_runtime_allowlists_cover_extender_publish_topics() -> None:
    settings = Settings()

    # The defaults carry exactly the current-architecture surface; the previous
    # architecture's /cmd, /teleop_config and /ui topics left with the rebases.
    assert {
        "/explorer_user_interfaces/rqt_armcontrol/max_angular_speed",
        "/explorer_user_interfaces/rqt_armcontrol/max_linear_speed",
        "/gripper_controller/commands",
        "/mode_request",
        "/petanque_state_machine/change_state",
        "/ui/visual_servoing/on",
        "/ui/visual_servoing/save",
        # The namespace entry for builder-authored UI bridges (see below).
        "/ui/",
    } == set(settings.allowed_ros_publish_topics)
    assert not any(topic.startswith("/cmd/") for topic in settings.allowed_ros_publish_topics)
    assert "/teleop_cmd" not in settings.allowed_teleop_targets


def test_the_ui_namespace_is_open_to_builder_authored_topics() -> None:
    # Team request: an app authored in the builder may bridge its own UI topic
    # (for example /ui/ros_toggle) without a backend edit. The /ui/ entry
    # grants the namespace; robot-facing topics stay individually allowlisted.
    from libs.ros_adapters.safety import RuntimeCommandPolicy, RuntimeCommandPolicyError

    settings = Settings()
    policy = RuntimeCommandPolicy(
        allowed_message_types=settings.allowed_ros_message_types,
        allowed_publish_topics=settings.allowed_ros_publish_topics,
        allowed_teleop_targets=settings.allowed_teleop_targets,
    )

    policy.ensure_publish_allowed("/ui/ros_toggle", "std_msgs/msg/Int32MultiArray", {"data": [13, 1]})
    policy.ensure_publish_allowed("/ui/my_new_bridge", "std_msgs/msg/Bool", {"data": True})

    import pytest

    with pytest.raises(RuntimeCommandPolicyError):
        policy.ensure_publish_allowed("/cmd/gripper", "std_msgs/msg/Bool", {"data": True})


def test_default_runtime_recording_allowlist_covers_seeded_runtime_apps() -> None:
    settings = Settings()

    assert {
        "/joint_states",
        "/petanque/measure/result_vectors",
        "/petanque_state_machine/change_state",
        "/qontrol_explorer/effort_overload",
        "/rosout",
        "/tag_detections",
        "/visual_servoing_cartesian_command",
        "/visual_servoing/error_TAGtoTAGd",
        "/visual_servoing/velocity_command",
    }.issubset(settings.allowed_recording_topics)
    # The previous architecture's feedback topics record nothing any more.
    assert "/teleop_cmd" not in settings.allowed_recording_topics
    assert "/sandbox_controller/velocity_command" not in settings.allowed_recording_topics


def test_get_settings_is_cached() -> None:
    get_settings.cache_clear()

    first = get_settings()
    second = get_settings()

    assert first is second


def test_test_settings_disable_runtime_ownership_only_when_unspecified() -> None:
    assert Settings(environment="test").runtime_control_required is False
    assert Settings(environment="test", runtime_control_required=True).runtime_control_required is True


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


def test_command_frame_settings_are_normalized_and_deduplicated() -> None:
    settings = Settings(
        ros_command_frame_id=" base_link ",
        allowed_command_frame_ids=(" base_link ", "ft_frame", "ft_frame"),
    )

    assert settings.ros_command_frame_id == "base_link"
    assert settings.allowed_command_frame_ids == ("base_link", "ft_frame")


def test_cartesian_manager_default_frame_must_be_allowed() -> None:
    with pytest.raises(ValidationError, match="ros_command_frame_id must be present"):
        Settings(ros_command_frame_id="operator_frame", allowed_command_frame_ids=("base_link",))


def test_command_frame_settings_reject_whitespace_inside_names() -> None:
    with pytest.raises(ValidationError, match="must not contain whitespace"):
        Settings(ros_command_frame_id="operator frame")
