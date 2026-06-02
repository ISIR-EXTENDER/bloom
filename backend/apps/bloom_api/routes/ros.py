from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator

from libs.ros_adapters import RosPublishReceipt, RosPublishRequest, RosPublisherGateway

router = APIRouter(prefix="/ros", tags=["ros"])


class RosTopicPublishRequest(BaseModel):
    topic: str = Field(min_length=1)
    message_type: str = Field(min_length=1)
    payload: dict[str, Any] = Field(default_factory=dict)

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


def get_ros_publisher_gateway(request: Request) -> RosPublisherGateway:
    return request.app.state.ros_publisher_gateway


@router.post("/topics/publish", response_model=RosTopicPublishResponse)
def publish_ros_topic(request: Request, publish_request: RosTopicPublishRequest) -> RosTopicPublishResponse:
    gateway = get_ros_publisher_gateway(request)
    try:
        receipt = gateway.publish(
            RosPublishRequest(
                topic=publish_request.topic,
                message_type=publish_request.message_type,
                payload=publish_request.payload,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return _to_response(receipt)


def _to_response(receipt: RosPublishReceipt) -> RosTopicPublishResponse:
    return RosTopicPublishResponse(
        topic=receipt.topic,
        message_type=receipt.message_type,
        status=receipt.status,
        detail=receipt.detail,
    )
