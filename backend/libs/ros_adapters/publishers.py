from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Protocol

RosPublishStatus = Literal["published", "simulated"]


@dataclass(frozen=True)
class RosPublishRequest:
    topic: str
    message_type: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class RosPublishReceipt:
    topic: str
    message_type: str
    status: RosPublishStatus
    detail: str


class RosPublisherGateway(Protocol):
    def publish(self, request: RosPublishRequest) -> RosPublishReceipt:
        ...


class NoopRosPublisherGateway:
    """Safe default for environments where ROS is not attached to Bloom."""

    def publish(self, request: RosPublishRequest) -> RosPublishReceipt:
        return RosPublishReceipt(
            topic=request.topic,
            message_type=request.message_type,
            status="simulated",
            detail="ROS publisher gateway is not configured.",
        )
