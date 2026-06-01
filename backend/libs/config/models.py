import json
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class WidgetKind(str, Enum):
    BUTTON = "button"
    CAMERA = "camera"
    COMMAND_BUTTON = "command-button"
    GAUGE = "gauge"
    JOYSTICK = "joystick"
    LABEL = "label"
    PLOT = "plot"
    SLIDER = "slider"
    TOGGLE = "toggle"
    UNKNOWN = "unknown"


class BloomModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class WidgetConfig(BloomModel):
    id: str = Field(min_length=1)
    kind: WidgetKind = WidgetKind.UNKNOWN
    title: str = Field(min_length=1)
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
    screens: tuple[ScreenConfig, ...] = Field(default_factory=tuple)

    @model_validator(mode="after")
    def screen_ids_must_be_unique(self) -> "ApplicationConfig":
        screen_ids = [screen.id for screen in self.screens]
        duplicate_ids = sorted({screen_id for screen_id in screen_ids if screen_ids.count(screen_id) > 1})
        if duplicate_ids:
            raise ValueError(f"duplicate screen ids: {', '.join(duplicate_ids)}")
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
