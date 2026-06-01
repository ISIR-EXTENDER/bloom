import json
from pathlib import Path
from typing import Any

from libs.config.models import ApplicationConfig, ScreenConfig, WidgetConfig, WidgetKind


def load_legacy_screen_json(content: str) -> ScreenConfig:
    payload = json.loads(content)
    return legacy_screen_to_config(payload)


def load_legacy_screen_file(path: str | Path) -> ScreenConfig:
    screen_path = Path(path)
    return load_legacy_screen_json(screen_path.read_text(encoding="utf-8"))


def load_legacy_application_json(content: str) -> ApplicationConfig:
    payload = json.loads(content)
    return legacy_application_to_config(payload)


def load_legacy_application_file(path: str | Path) -> ApplicationConfig:
    application_path = Path(path)
    return load_legacy_application_json(application_path.read_text(encoding="utf-8"))


def legacy_screen_to_config(payload: dict[str, Any]) -> ScreenConfig:
    screen_id = str(payload.get("id") or payload["name"])
    title = str(payload.get("title") or payload.get("label") or payload["name"])
    widgets = tuple(_legacy_widget_to_config(widget) for widget in payload.get("widgets", []))
    return ScreenConfig(id=screen_id, title=title, widgets=widgets)


def legacy_application_to_config(payload: dict[str, Any]) -> ApplicationConfig:
    application_id = str(payload["id"])
    name = str(payload.get("name") or application_id)
    screen_ids = tuple(str(screen_id) for screen_id in payload.get("screenIds", []))
    screens = tuple(ScreenConfig(id=screen_id, title=screen_id) for screen_id in screen_ids)
    return ApplicationConfig(
        id=application_id,
        name=name,
        description=_legacy_application_description(payload),
        screens=screens,
    )


def _legacy_widget_to_config(payload: dict[str, Any]) -> WidgetConfig:
    widget_id = str(payload["id"])
    title = str(payload.get("title") or payload.get("label") or widget_id)
    kind = _map_widget_kind(str(payload.get("kind", WidgetKind.UNKNOWN.value)))
    settings = {key: value for key, value in payload.items() if key not in {"id", "title", "label", "kind"}}
    return WidgetConfig(id=widget_id, title=title, kind=kind, settings=settings)


def _map_widget_kind(kind: str) -> WidgetKind:
    mapping = {
        "button": WidgetKind.BUTTON,
        "camera": WidgetKind.CAMERA,
        "joystick": WidgetKind.JOYSTICK,
        "plot": WidgetKind.PLOT,
        "ros-message-toggle": WidgetKind.COMMAND_BUTTON,
        "slider": WidgetKind.SLIDER,
        "text": WidgetKind.LABEL,
        "toggle": WidgetKind.TOGGLE,
    }
    return mapping.get(kind, WidgetKind.UNKNOWN)


def _legacy_application_description(payload: dict[str, Any]) -> str:
    home_screen_id = payload.get("homeScreenId")
    if not home_screen_id:
        return ""
    return f"Legacy home screen: {home_screen_id}"

