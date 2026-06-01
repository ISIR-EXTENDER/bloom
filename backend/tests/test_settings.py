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
