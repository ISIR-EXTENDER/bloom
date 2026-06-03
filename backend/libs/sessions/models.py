from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, field_validator, model_validator


class RuntimeModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class RuntimePingMessage(RuntimeModel):
    type: Literal["ping"]


class RuntimeSubscribeTopicMessage(RuntimeModel):
    type: Literal["subscribe_topic"]
    topic: str = Field(min_length=1)
    message_type: str = ""
    field_path: str = ""
    widget_id: str = ""

    @field_validator("topic")
    @classmethod
    def topic_must_be_absolute(cls, value: str) -> str:
        normalized_topic = value.strip()
        if not normalized_topic.startswith("/"):
            raise ValueError("topic must start with '/'")
        if any(character.isspace() for character in normalized_topic):
            raise ValueError("topic must not contain whitespace")
        return normalized_topic

    @field_validator("widget_id")
    @classmethod
    def normalize_widget_id(cls, value: str) -> str:
        return value.strip()


class RuntimeVector3Message(RuntimeModel):
    x: float = Field(default=0.0, ge=-20.0, le=20.0)
    y: float = Field(default=0.0, ge=-20.0, le=20.0)
    z: float = Field(default=0.0, ge=-20.0, le=20.0)


class RuntimeTeleopCommandMessage(RuntimeModel):
    type: Literal["teleop_cmd"]
    mode: int = Field(default=0, ge=0, le=4)
    axes: dict[str, float] = Field(default_factory=dict)
    angular: RuntimeVector3Message = Field(default_factory=RuntimeVector3Message)
    linear: RuntimeVector3Message = Field(default_factory=RuntimeVector3Message)
    seq: int = Field(default=0, ge=0)
    target: str = Field(default="/teleop_cmd", min_length=1)

    @model_validator(mode="before")
    @classmethod
    def apply_legacy_axes_alias(cls, payload: Any) -> Any:
        if not isinstance(payload, dict):
            return payload

        axes = payload.get("axes")
        if axes and "linear" not in payload:
            return {**payload, "linear": axes}
        return payload

    @field_validator("target")
    @classmethod
    def target_must_be_absolute(cls, value: str) -> str:
        normalized_target = value.strip()
        if not normalized_target.startswith("/"):
            raise ValueError("target must start with '/'")
        if any(character.isspace() for character in normalized_target):
            raise ValueError("target must not contain whitespace")
        return normalized_target


RuntimeClientMessage = Annotated[
    RuntimePingMessage | RuntimeSubscribeTopicMessage | RuntimeTeleopCommandMessage,
    Field(discriminator="type"),
]

runtime_client_message_adapter = TypeAdapter(RuntimeClientMessage)


class RuntimeServerMessage(RuntimeModel):
    type: Literal["session_connected", "pong", "subscription_ack", "teleop_ack", "topic_sample", "runtime_error"]
    active_sessions: int | None = None
    detail: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)
    session_id: str


def parse_runtime_client_message(payload: dict[str, Any]) -> RuntimeClientMessage:
    return runtime_client_message_adapter.validate_python(payload)
