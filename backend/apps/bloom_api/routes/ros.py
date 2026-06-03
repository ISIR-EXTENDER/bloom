from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator, model_validator

from libs.ros_adapters import (
    RosPublishReceipt,
    RosPublishRequest,
    RosPublisherGateway,
    RosTopicCatalogGateway,
    RosTopicInfo,
)
from libs.ros_adapters.payloads import parse_ros_payload_text

router = APIRouter(prefix="/ros", tags=["ros"])


class RosTopicPublishRequest(BaseModel):
    topic: str = Field(min_length=1)
    message_type: str = Field(min_length=1)
    payload: dict[str, Any] | None = None
    payload_text: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def _validate_single_payload_source(self) -> "RosTopicPublishRequest":
        if self.payload is not None and self.payload_text is not None:
            raise ValueError("Use either payload or payload_text, not both")
        return self

    def to_payload(self) -> dict[str, Any]:
        if self.payload is not None:
            return self.payload
        if self.payload_text is not None:
            return _parse_payload_text(self.payload_text)
        return {}

    @field_validator("topic")
    @classmethod
    def _validate_topic(cls, topic: str) -> str:
        normalized_topic = topic.strip()
        if not normalized_topic.startswith("/"):
            raise ValueError("ROS topic must start with '/'")
        if any(character.isspace() for character in normalized_topic):
            raise ValueError("ROS topic must not contain whitespace")
        return normalized_topic

    @field_validator("message_type")
    @classmethod
    def _validate_message_type(cls, message_type: str) -> str:
        normalized_message_type = message_type.strip()
        if "/" not in normalized_message_type:
            raise ValueError("ROS message type must use package/msg/Type notation")
        if any(character.isspace() for character in normalized_message_type):
            raise ValueError("ROS message type must not contain whitespace")
        return normalized_message_type


class RosTopicPublishResponse(BaseModel):
    topic: str
    message_type: str
    status: str
    detail: str


class RosTopicInfoResponse(BaseModel):
    name: str
    message_type: str


class RosTopicListResponse(BaseModel):
    topics: tuple[RosTopicInfoResponse, ...]


def get_ros_publisher_gateway(request: Request) -> RosPublisherGateway:
    return request.app.state.ros_publisher_gateway


def get_ros_topic_catalog_gateway(request: Request) -> RosTopicCatalogGateway:
    return request.app.state.ros_topic_catalog_gateway


@router.get("/topics", response_model=RosTopicListResponse)
def list_ros_topics(request: Request) -> RosTopicListResponse:
    gateway = get_ros_topic_catalog_gateway(request)
    topics = tuple(_to_topic_response(topic) for topic in gateway.list_topics())
    return RosTopicListResponse(topics=topics)


@router.post("/topics/publish", response_model=RosTopicPublishResponse)
def publish_ros_topic(request: Request, publish_request: RosTopicPublishRequest) -> RosTopicPublishResponse:
    gateway = get_ros_publisher_gateway(request)
    try:
        receipt = gateway.publish(
            RosPublishRequest(
                topic=publish_request.topic,
                message_type=publish_request.message_type,
                payload=publish_request.to_payload(),
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return _to_response(receipt)


def _to_topic_response(topic: RosTopicInfo) -> RosTopicInfoResponse:
    return RosTopicInfoResponse(name=topic.name, message_type=topic.message_type)


def _to_response(receipt: RosPublishReceipt) -> RosTopicPublishResponse:
    return RosTopicPublishResponse(
        topic=receipt.topic,
        message_type=receipt.message_type,
        status=receipt.status,
        detail=receipt.detail,
    )


def _parse_payload_text(payload_text: str) -> dict[str, Any]:
    try:
        return parse_ros_payload_text(payload_text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
