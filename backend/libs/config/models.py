import json
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class WidgetKind(str, Enum):
    BUTTON = "button"
    CAMERA = "camera"
    COMMAND_BUTTON = "command-button"
    EVENT_LOG = "event-log"
    GAUGE = "gauge"
    GESTURE_PAD = "gesture-pad"
    JOYSTICK = "joystick"
    LABEL = "label"
    PLOT = "plot"
    ROBOT_3D = "robot-3d"
    SLIDER = "slider"
    TOGGLE = "toggle"
    TOPIC_ECHO = "topic-echo"
    TOPIC_PLOT = "topic-plot"
    UNKNOWN = "unknown"


class CanvasPresetId(str, Enum):
    NATIVE_1024X600 = "native-1024x600"
    HD = "hd"
    TABLET = "tablet"
    FULL_HD = "full-hd"
    LOCAL_SCREEN = "local-screen"


class RuntimeCanvasMode(str, Enum):
    LEFT = "left"
    CENTER = "center"
    FIT = "fit"


class DisplayPreset(str, Enum):
    DEFAULT = "default"
    COMPACT = "compact"
    COMFORT = "comfort"
    HIGH_VISIBILITY = "high-visibility"


class MotorAccessibilityPreset(str, Enum):
    DEFAULT = "default"
    LARGE_TARGETS = "large-targets"
    REDUCED_MOTION = "reduced-motion"
    ASSISTED_TOUCH = "assisted-touch"


class BloomModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class WidgetLayout(BloomModel):
    x: int = Field(default=0, ge=0)
    y: int = Field(default=0, ge=0)
    width: int = Field(default=160, gt=0)
    height: int = Field(default=80, gt=0)


class CanvasSettings(BloomModel):
    preset_id: CanvasPresetId = CanvasPresetId.HD
    runtime_mode: RuntimeCanvasMode = RuntimeCanvasMode.FIT


class ApplicationThemePalette(BloomModel):
    primary: str = "#7f967e"
    accent: str = "#d9a441"
    background: str = "#f7f1e6"
    surface: str = "#fffdf7"


class ApplicationThemeInspiration(BloomModel):
    moodboard_image_uri: str = ""
    reference_url: str = ""


class ApplicationTheme(BloomModel):
    inspiration: ApplicationThemeInspiration = Field(default_factory=ApplicationThemeInspiration)
    preset_id: str = Field(default="bloom-default", min_length=1)
    palette: ApplicationThemePalette = Field(default_factory=ApplicationThemePalette)


class UserProfile(BloomModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    display_preset: DisplayPreset = DisplayPreset.DEFAULT
    font_scale: float = Field(default=1.0, ge=0.75, le=2.0)
    app_theme_preset_id: str = Field(default="bloom-default", min_length=1)
    preferred_control_layout_id: str = ""
    motor_accessibility_preset: MotorAccessibilityPreset = MotorAccessibilityPreset.DEFAULT


class RuntimeAdapterPolicy(BloomModel):
    allowed_message_types: tuple[str, ...] = Field(default_factory=tuple)
    allowed_publish_topics: tuple[str, ...] = Field(default_factory=tuple)
    allowed_recording_topics: tuple[str, ...] = Field(default_factory=tuple)
    allowed_teleop_targets: tuple[str, ...] = Field(default_factory=tuple)


class WidgetConfig(BloomModel):
    id: str = Field(min_length=1)
    kind: WidgetKind = WidgetKind.UNKNOWN
    title: str = Field(min_length=1)
    layout: WidgetLayout = Field(default_factory=WidgetLayout)
    settings: dict[str, Any] = Field(default_factory=dict)

    @field_validator("settings")
    @classmethod
    def settings_must_be_json_object(cls, value: dict[str, Any]) -> dict[str, Any]:
        try:
            json.dumps(value)
        except TypeError as exc:
            raise ValueError("settings must be JSON serializable") from exc
        return dict(value)


class ScreenConfig(BloomModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    canvas: CanvasSettings = Field(default_factory=CanvasSettings)
    widgets: tuple[WidgetConfig, ...] = Field(default_factory=tuple)

    @model_validator(mode="after")
    def widget_ids_must_be_unique(self) -> "ScreenConfig":
        widget_ids = [widget.id for widget in self.widgets]
        duplicate_ids = sorted({widget_id for widget_id in widget_ids if widget_ids.count(widget_id) > 1})
        if duplicate_ids:
            raise ValueError(f"duplicate widget ids: {', '.join(duplicate_ids)}")
        return self


class ApplicationConfig(BloomModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str = ""
    runtime_policy: RuntimeAdapterPolicy = Field(default_factory=RuntimeAdapterPolicy)
    theme: ApplicationTheme = Field(default_factory=ApplicationTheme)
    profiles: tuple[UserProfile, ...] = Field(default_factory=tuple)
    screens: tuple[ScreenConfig, ...] = Field(default_factory=tuple)

    @model_validator(mode="after")
    def screen_ids_must_be_unique(self) -> "ApplicationConfig":
        screen_ids = [screen.id for screen in self.screens]
        duplicate_ids = sorted({screen_id for screen_id in screen_ids if screen_ids.count(screen_id) > 1})
        if duplicate_ids:
            raise ValueError(f"duplicate screen ids: {', '.join(duplicate_ids)}")
        return self

    @model_validator(mode="after")
    def profile_ids_must_be_unique(self) -> "ApplicationConfig":
        profile_ids = [profile.id for profile in self.profiles]
        duplicate_ids = sorted({profile_id for profile_id in profile_ids if profile_ids.count(profile_id) > 1})
        if duplicate_ids:
            raise ValueError(f"duplicate profile ids: {', '.join(duplicate_ids)}")
        return self


class ConfigurationMetadata(BloomModel):
    schema_version: int = Field(default=1, ge=1)
    exported_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source: str = "bloom"


class ConfigurationBundle(BloomModel):
    metadata: ConfigurationMetadata = Field(default_factory=ConfigurationMetadata)
    applications: tuple[ApplicationConfig, ...] = Field(default_factory=tuple)

    @model_validator(mode="after")
    def application_ids_must_be_unique(self) -> "ConfigurationBundle":
        application_ids = [application.id for application in self.applications]
        duplicate_ids = sorted(
            {application_id for application_id in application_ids if application_ids.count(application_id) > 1}
        )
        if duplicate_ids:
            raise ValueError(f"duplicate application ids: {', '.join(duplicate_ids)}")
        return self
