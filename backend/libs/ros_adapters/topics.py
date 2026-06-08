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


class RclpyRosTopicCatalogGateway:
    """Discover live ROS topics through an existing rclpy node."""

    def __init__(self, node: object) -> None:
        self._node = node

    def list_topics(self) -> tuple[RosTopicInfo, ...]:
        topics: list[RosTopicInfo] = []
        for topic_name, message_types in self._get_topic_names_and_types():
            if not message_types:
                topics.append(RosTopicInfo(name=topic_name, message_type=""))
                continue

            topics.extend(RosTopicInfo(name=topic_name, message_type=message_type) for message_type in message_types)

        return tuple(sorted(topics, key=lambda topic: (topic.name, topic.message_type)))

    def _get_topic_names_and_types(self) -> tuple[tuple[str, tuple[str, ...]], ...]:
        get_topics = getattr(self._node, "get_topic_names_and_types")
        return tuple((topic_name, tuple(message_types)) for topic_name, message_types in get_topics())
