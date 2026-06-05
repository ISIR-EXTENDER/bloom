from apps.bloom_api.settings import Settings, get_settings


def test_default_settings_are_local() -> None:
    settings = Settings()

    assert settings.api_prefix == "/api/v1"
    assert settings.configuration_dir.name == "configurations"
    assert settings.environment == "local"
    assert settings.service_name == "bloom-api"


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
