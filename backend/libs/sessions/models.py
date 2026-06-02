from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, field_validator


class RuntimeModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class RuntimePingMessage(RuntimeModel):
    type: Literal["ping"]


class RuntimeSubscribeTopicMessage(RuntimeModel):
    type: Literal["subscribe_topic"]
    topic: str = Field(min_length=1)
    message_type: str = ""
    field_path: str = ""

    @field_validator("topic")
    @classmethod
    def topic_must_be_absolute(cls, value: str) -> str:
        normalized_topic = value.strip()
        if not normalized_topic.startswith("/"):
            raise ValueError("topic must start with '/'")
        if any(character.isspace() for character in normalized_topic):
            raise ValueError("topic must not contain whitespace")
        return normalized_topic


class RuntimeTeleopCommandMessage(RuntimeModel):
    type: Literal["teleop_cmd"]
    mode: int = Field(default=0, ge=0)
    axes: dict[str, float] = Field(default_factory=dict)
    seq: int = Field(default=0, ge=0)


RuntimeClientMessage = Annotated[
    RuntimePingMessage | RuntimeSubscribeTopicMessage | RuntimeTeleopCommandMessage,
    Field(discriminator="type"),
]

runtime_client_message_adapter = TypeAdapter(RuntimeClientMessage)


class RuntimeServerMessage(RuntimeModel):
    type: Literal["session_connected", "pong", "subscription_ack", "teleop_ack", "runtime_error"]
    active_sessions: int | None = None
    detail: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)
    session_id: str


def parse_runtime_client_message(payload: dict[str, Any]) -> RuntimeClientMessage:
    return runtime_client_message_adapter.validate_python(payload)
