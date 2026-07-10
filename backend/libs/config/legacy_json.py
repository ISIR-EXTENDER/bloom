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


def load_legacy_application_with_screens_file(
    application_path: str | Path,
    screen_paths: tuple[str | Path, ...],
) -> ApplicationConfig:
    application_payload = json.loads(Path(application_path).read_text(encoding="utf-8"))
    screen_payloads = tuple(json.loads(Path(screen_path).read_text(encoding="utf-8")) for screen_path in screen_paths)
    return legacy_application_with_screens_to_config(application_payload, screen_payloads)


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


def legacy_application_with_screens_to_config(
    application_payload: dict[str, Any],
    screen_payloads: tuple[dict[str, Any], ...],
) -> ApplicationConfig:
    application = legacy_application_to_config(application_payload)
    converted_screens = tuple(legacy_screen_to_config(screen_payload) for screen_payload in screen_payloads)
    ordered_screens = _order_screens_for_legacy_application(application.screens, converted_screens)
    return application.model_copy(update={"screens": ordered_screens})


def _legacy_widget_to_config(payload: dict[str, Any]) -> WidgetConfig:
    widget_id = str(payload["id"])
    title = str(payload.get("title") or payload.get("label") or widget_id)
    legacy_kind = str(payload.get("kind", WidgetKind.UNKNOWN.value))
    kind = _map_widget_kind(legacy_kind)
    layout = _legacy_rect_to_layout(payload.get("rect"))
    settings = {key: value for key, value in payload.items() if key not in {"id", "title", "label", "kind", "rect"}}
    settings = _with_legacy_widget_settings(legacy_kind, title, settings)
    settings = _with_legacy_runtime_binding(kind, settings)
    return WidgetConfig(id=widget_id, title=title, kind=kind, layout=layout, settings=settings)


def _order_screens_for_legacy_application(
    placeholder_screens: tuple[ScreenConfig, ...],
    converted_screens: tuple[ScreenConfig, ...],
) -> tuple[ScreenConfig, ...]:
    converted_by_candidate_id = {
        candidate_id: screen for screen in converted_screens for candidate_id in _legacy_screen_id_candidates(screen.id)
    }
    ordered_screens = tuple(converted_by_candidate_id.get(screen.id, screen) for screen in placeholder_screens)
    ordered_screen_ids = {screen.id for screen in ordered_screens}
    remaining_screens = tuple(screen for screen in converted_screens if screen.id not in ordered_screen_ids)
    return ordered_screens + remaining_screens


def _legacy_screen_id_candidates(screen_id: str) -> tuple[str, ...]:
    candidates = [screen_id]
    if screen_id.startswith("default_"):
        candidates.append(screen_id.removeprefix("default_"))
    else:
        candidates.append(f"default_{screen_id}")
    return tuple(dict.fromkeys(candidates))


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


def _with_legacy_runtime_binding(kind: WidgetKind, settings: dict[str, Any]) -> dict[str, Any]:
    if kind != WidgetKind.JOYSTICK or "runtime_binding" in settings:
        return settings

    binding = str(settings.get("binding", "")).strip().lower()
    topic = str(settings.get("topic", "")).strip().lower()

    if binding == "joy" or topic.endswith("/joystick_xy"):
        return {
            **settings,
            "mode_id": "both",
            "publish_rate_hz": 20,
            "zero_on_release": True,
            "runtime_binding": _teleop_runtime_binding(mode=3),
        }

    if binding == "rot" or topic.endswith("/joystick_rxry"):
        return {
            **settings,
            "mode_id": "rotation",
            "publish_rate_hz": 20,
            "zero_on_release": True,
            "runtime_binding": _teleop_runtime_binding(mode=1),
        }

    return settings


def _with_legacy_widget_settings(legacy_kind: str, title: str, settings: dict[str, Any]) -> dict[str, Any]:
    if legacy_kind == "momentary-ros-message":
        return {
            **settings,
            "button_label": title,
            "command": "momentary_ros_message",
            "legacyKind": legacy_kind,
            "momentary": True,
            "payload": settings.get("pressedPayload", "{data: true}"),
            "releasedPayload": settings.get("releasedPayload", "{data: false}"),
        }

    if legacy_kind == "topic-monitor":
        first_topic = _first_topic_monitor_entry(settings.get("topics"))
        return {
            **settings,
            "fieldPath": "",
            "legacyKind": legacy_kind,
            "maxMessages": 20,
            "messageType": str(first_topic.get("messageType", "")),
            "prettyPrint": True,
            "show_details": bool(settings.get("showDetails", False)),
            "topic": str(first_topic.get("topic") or settings.get("topic") or ""),
        }

    return {**settings, "legacyKind": legacy_kind}


def _first_topic_monitor_entry(value: Any) -> dict[str, Any]:
    if not isinstance(value, list):
        return {}
    for item in value:
        if isinstance(item, dict):
            return item
    return {}


def _teleop_runtime_binding(mode: int) -> dict[str, Any]:
    return {
        "adapter": "teleop",
        "value_mapping": {
            "mode": mode,
            "target_topic": "/teleop_cmd",
        },
    }


def _map_widget_kind(kind: str) -> WidgetKind:
    mapping = {
        "button": WidgetKind.COMMAND_BUTTON,
        "camera": WidgetKind.CAMERA,
        "curves": WidgetKind.PLOT,
        "drink": WidgetKind.COMMAND_BUTTON,
        "gripper-control": WidgetKind.TOGGLE,
        "throw-draw": WidgetKind.GESTURE_PAD,
        "joystick": WidgetKind.JOYSTICK,
        "load-pose-button": WidgetKind.COMMAND_BUTTON,
        "magnet-control": WidgetKind.TOGGLE,
        "max-velocity": WidgetKind.SLIDER,
        "momentary-ros-message": WidgetKind.COMMAND_BUTTON,
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
        "topic-monitor": WidgetKind.TOPIC_ECHO,
    }
    return mapping.get(kind, WidgetKind.UNKNOWN)


def _legacy_application_description(payload: dict[str, Any]) -> str:
    home_screen_id = payload.get("homeScreenId")
    if not home_screen_id:
        return ""
    return f"Legacy home screen: {home_screen_id}"
