from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, field_validator, model_validator

from libs.manager_contract import TABLET_COMMAND_TOPIC


class RuntimeModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class RuntimePingMessage(RuntimeModel):
    type: Literal["ping"]


class RuntimeClaimControlMessage(RuntimeModel):
    type: Literal["claim_control"]


class RuntimeReleaseControlMessage(RuntimeModel):
    type: Literal["release_control"]


class RuntimeAppContextMessage(RuntimeModel):
    """Names the application this socket is running, so its policy applies here too."""

    type: Literal["app_context"]
    config_id: str = Field(min_length=1, max_length=128)
    app_id: str = Field(min_length=1, max_length=128)


class RuntimeTopicMessage(RuntimeModel):
    """A widget naming a topic: the topic is absolute and the widget id trimmed."""

    topic: str = Field(min_length=1)
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


class RuntimeSubscribeTopicMessage(RuntimeTopicMessage):
    type: Literal["subscribe_topic"]
    message_type: str = ""
    field_path: str = ""


class RuntimeUnsubscribeTopicMessage(RuntimeTopicMessage):
    """Drops the subscription the same widget_id and topic opened."""

    type: Literal["unsubscribe_topic"]


class RuntimeVector3Message(RuntimeModel):
    x: float = Field(default=0.0, ge=-20.0, le=20.0)
    y: float = Field(default=0.0, ge=-20.0, le=20.0)
    z: float = Field(default=0.0, ge=-20.0, le=20.0)


class RuntimeTeleopCommandMessage(RuntimeModel):
    type: Literal["teleop_cmd"]
    # Rotation frame selector for cartesian_manager; empty uses the default.
    frame_id: str = ""
    mode: int = Field(default=0, ge=0, le=4)
    axes: dict[str, float] = Field(default_factory=dict)
    angular: RuntimeVector3Message = Field(default_factory=RuntimeVector3Message)
    linear: RuntimeVector3Message = Field(default_factory=RuntimeVector3Message)
    seq: int = Field(default=0, ge=0)
    target: str = Field(default=TABLET_COMMAND_TOPIC, min_length=1)

    @model_validator(mode="before")
    @classmethod
    def apply_legacy_axes_alias(cls, payload: Any) -> Any:
        if not isinstance(payload, dict):
            return payload

        axes = payload.get("axes")
        if axes and "linear" not in payload:
            return {**payload, "linear": axes}
        return payload

    @field_validator("frame_id")
    @classmethod
    def frame_id_must_be_plain(cls, value: str) -> str:
        normalized_frame_id = value.strip()
        if any(character.isspace() for character in normalized_frame_id):
            raise ValueError("frame_id must not contain whitespace")
        return normalized_frame_id

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
    RuntimeAppContextMessage
    | RuntimeClaimControlMessage
    | RuntimePingMessage
    | RuntimeReleaseControlMessage
    | RuntimeSubscribeTopicMessage
    | RuntimeTeleopCommandMessage
    | RuntimeUnsubscribeTopicMessage,
    Field(discriminator="type"),
]

runtime_client_message_adapter = TypeAdapter(RuntimeClientMessage)


class RuntimeServerMessage(RuntimeModel):
    type: Literal[
        "app_context_ack",
        "control_state",
        "session_connected",
        "pong",
        "subscription_ack",
        "teleop_ack",
        "topic_sample",
        "runtime_error",
        "unsubscription_ack",
    ]
    active_sessions: int | None = None
    detail: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)
    session_id: str


def parse_runtime_client_message(payload: dict[str, Any]) -> RuntimeClientMessage:
    return runtime_client_message_adapter.validate_python(payload)
