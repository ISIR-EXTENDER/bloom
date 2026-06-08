from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class RosTopicInfo:
    name: str
    message_type: str


@dataclass(frozen=True)
class RosTopicStatus:
    name: str
    message_type: str
    publisher_count: int
    subscription_count: int


class RosTopicCatalogGateway(Protocol):
    def list_topics(self) -> tuple[RosTopicInfo, ...]:
        raise NotImplementedError

    def list_topic_status(self) -> tuple[RosTopicStatus, ...]:
        raise NotImplementedError


class NoopRosTopicCatalogGateway:
    """Safe default for environments where ROS topic discovery is not attached."""

    def list_topics(self) -> tuple[RosTopicInfo, ...]:
        return ()

    def list_topic_status(self) -> tuple[RosTopicStatus, ...]:
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

    def list_topic_status(self) -> tuple[RosTopicStatus, ...]:
        return tuple(
            RosTopicStatus(
                name=topic.name,
                message_type=topic.message_type,
                publisher_count=self._count_publishers(topic.name),
                subscription_count=self._count_subscriptions(topic.name),
            )
            for topic in self.list_topics()
        )

    def _get_topic_names_and_types(self) -> tuple[tuple[str, tuple[str, ...]], ...]:
        get_topics = getattr(self._node, "get_topic_names_and_types")
        return tuple((topic_name, tuple(message_types)) for topic_name, message_types in get_topics())

    def _count_publishers(self, topic_name: str) -> int:
        get_publishers = getattr(self._node, "get_publishers_info_by_topic", None)
        if get_publishers is None:
            return 0
        return len(get_publishers(topic_name))

    def _count_subscriptions(self, topic_name: str) -> int:
        get_subscriptions = getattr(self._node, "get_subscriptions_info_by_topic", None)
        if get_subscriptions is None:
            return 0
        return len(get_subscriptions(topic_name))
