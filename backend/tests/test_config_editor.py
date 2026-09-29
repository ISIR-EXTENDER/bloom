"""Screen edits land in the one application named, replace in place, and never empty an application."""

from __future__ import annotations

import pytest

from libs.config import ApplicationConfig, ConfigurationBundle, ConfigurationMetadata, ScreenConfig
from libs.config.editor import (
    ApplicationNotFoundError,
    ConfigurationEditError,
    ScreenNotFoundError,
    delete_screen,
    upsert_screen,
)


def screen(screen_id: str, title: str | None = None) -> ScreenConfig:
    return ScreenConfig(id=screen_id, title=title or screen_id.title())


def application(app_id: str, *screens: ScreenConfig) -> ApplicationConfig:
    return ApplicationConfig(id=app_id, name=app_id.title(), screens=screens)


def bundle(*applications: ApplicationConfig) -> ConfigurationBundle:
    return ConfigurationBundle(metadata=ConfigurationMetadata(source="editor-test"), applications=applications)


def screen_ids(configuration: ConfigurationBundle, app_id: str) -> list[str]:
    [app] = [candidate for candidate in configuration.applications if candidate.id == app_id]
    return [item.id for item in app.screens]


def test_saving_an_existing_screen_replaces_it_in_place() -> None:
    original = bundle(application("sandbox", screen("control"), screen("teleop")), application("other", screen("x")))

    edited = upsert_screen(original, "sandbox", screen("control", "Control v2"))

    assert screen_ids(edited, "sandbox") == ["control", "teleop"]
    assert edited.applications[0].screens[0].title == "Control v2"
    assert edited.applications[1] == original.applications[1]


def test_saving_a_new_screen_appends_it() -> None:
    original = bundle(application("sandbox", screen("control")))

    edited = upsert_screen(original, "sandbox", screen("teleop"))

    assert screen_ids(edited, "sandbox") == ["control", "teleop"]


def test_saving_a_screen_into_an_unknown_application_is_refused() -> None:
    with pytest.raises(ApplicationNotFoundError, match='Application "ghost" was not found'):
        upsert_screen(bundle(application("sandbox", screen("control"))), "ghost", screen("control"))


def test_deleting_a_screen_leaves_every_other_application_alone() -> None:
    original = bundle(
        application("sandbox", screen("control"), screen("teleop")), application("other", screen("control"))
    )

    edited = delete_screen(original, "sandbox", "control")

    assert screen_ids(edited, "sandbox") == ["teleop"]
    assert edited.applications[1] == original.applications[1]


def test_an_application_keeps_its_last_screen() -> None:
    with pytest.raises(ConfigurationEditError, match="must keep at least one screen"):
        delete_screen(bundle(application("sandbox", screen("control"))), "sandbox", "control")


def test_deleting_from_an_unknown_application_is_refused() -> None:
    with pytest.raises(ApplicationNotFoundError, match='Application "ghost" was not found'):
        delete_screen(bundle(application("sandbox", screen("a"), screen("b"))), "ghost", "a")


def test_deleting_an_unknown_screen_is_refused_without_changing_anything() -> None:
    original = bundle(application("sandbox", screen("a"), screen("b")))

    with pytest.raises(ScreenNotFoundError, match='Screen "zzz" was not found in application "sandbox"'):
        delete_screen(original, "sandbox", "zzz")

    assert screen_ids(original, "sandbox") == ["a", "b"]
