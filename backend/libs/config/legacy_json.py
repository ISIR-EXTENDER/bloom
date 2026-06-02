import json
from pathlib import Path
from typing import Any

from libs.config.models import (
    ApplicationConfig,
    CanvasSettings,
    RuntimeCanvasMode,
    ScreenConfig,
    WidgetConfig,
    WidgetKind,
    WidgetLayout,
)


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
    return ScreenConfig(id=screen_id, title=title, canvas=_legacy_canvas_to_settings(payload.get("canvas")), widgets=widgets)


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
    layout = _legacy_rect_to_layout(payload.get("rect"))
    settings = {key: value for key, value in payload.items() if key not in {"id", "title", "label", "kind", "rect"}}
    return WidgetConfig(id=widget_id, title=title, kind=kind, layout=layout, settings=settings)


def _legacy_rect_to_layout(value: Any) -> WidgetLayout:
    if not isinstance(value, dict):
        return WidgetLayout()
    return WidgetLayout(
        x=int(value.get("x", 0)),
        y=int(value.get("y", 0)),
        width=int(value.get("w", value.get("width", 160))),
        height=int(value.get("h", value.get("height", 80))),
    )


def _legacy_canvas_to_settings(value: Any) -> CanvasSettings:
    if not isinstance(value, dict):
        return CanvasSettings()
    return CanvasSettings(
        preset_id=str(value.get("presetId", value.get("preset_id", "hd"))),
        runtime_mode=RuntimeCanvasMode(str(value.get("runtimeMode", value.get("runtime_mode", "fit")))),
    )


def _map_widget_kind(kind: str) -> WidgetKind:
    mapping = {
        "button": WidgetKind.COMMAND_BUTTON,
        "camera": WidgetKind.CAMERA,
        "curves": WidgetKind.PLOT,
        "drink": WidgetKind.COMMAND_BUTTON,
        "gripper-control": WidgetKind.TOGGLE,
        "joystick": WidgetKind.JOYSTICK,
        "magnet-control": WidgetKind.TOGGLE,
        "max-velocity": WidgetKind.SLIDER,
        "mode-button": WidgetKind.COMMAND_BUTTON,
        "navigation-button": WidgetKind.BUTTON,
        "plot": WidgetKind.PLOT,
        "rosbag-control": WidgetKind.COMMAND_BUTTON,
        "ros-message-toggle": WidgetKind.TOGGLE,
        "save-pose-button": WidgetKind.COMMAND_BUTTON,
        "slider": WidgetKind.SLIDER,
        "stream-display": WidgetKind.CAMERA,
        "text": WidgetKind.LABEL,
        "textarea": WidgetKind.LABEL,
        "toggle": WidgetKind.TOGGLE,
        "toggle-publisher": WidgetKind.TOGGLE,
    }
    return mapping.get(kind, WidgetKind.UNKNOWN)


def _legacy_application_description(payload: dict[str, Any]) -> str:
    home_screen_id = payload.get("homeScreenId")
    if not home_screen_id:
        return ""
    return f"Legacy home screen: {home_screen_id}"
