from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class RosTopicInfo:
    name: str
    message_type: str


class RosTopicCatalogGateway(Protocol):
    def list_topics(self) -> tuple[RosTopicInfo, ...]:
        raise NotImplementedError


class NoopRosTopicCatalogGateway:
    """Safe default for environments where ROS topic discovery is not attached."""

    def list_topics(self) -> tuple[RosTopicInfo, ...]:
        return ()
