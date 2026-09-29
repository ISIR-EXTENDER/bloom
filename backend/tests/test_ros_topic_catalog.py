"""Topic discovery through an rclpy node: every advertised type, sorted, with publisher and subscriber counts."""

from __future__ import annotations

from libs.ros_adapters.topics import (
    NoopRosTopicCatalogGateway,
    RclpyRosTopicCatalogGateway,
    RosTopicInfo,
    RosTopicStatus,
)


class GraphNode:
    def __init__(self, topics: list[tuple[str, list[str]]]) -> None:
        self.topics = topics

    def get_topic_names_and_types(self) -> list[tuple[str, list[str]]]:
        return list(self.topics)

    def get_publishers_info_by_topic(self, topic: str) -> list[object]:
        return [object()] * {"/joint_states": 2, "/ee_pose": 1}.get(topic, 0)

    def get_subscriptions_info_by_topic(self, topic: str) -> list[object]:
        return [object()] * {"/joint_states": 1}.get(topic, 0)


class BareNode:
    """An older node API without the per-topic endpoint queries."""

    def get_topic_names_and_types(self) -> list[tuple[str, list[str]]]:
        return [("/ee_pose", ["geometry_msgs/msg/PoseStamped"])]


def test_topics_are_listed_once_per_type_sorted_by_name_then_type() -> None:
    node = GraphNode(
        [
            ("/joint_states", ["sensor_msgs/msg/JointState"]),
            ("/ee_pose", ["geometry_msgs/msg/PoseStamped", "geometry_msgs/msg/Pose"]),
        ]
    )

    assert RclpyRosTopicCatalogGateway(node).list_topics() == (
        RosTopicInfo("/ee_pose", "geometry_msgs/msg/Pose"),
        RosTopicInfo("/ee_pose", "geometry_msgs/msg/PoseStamped"),
        RosTopicInfo("/joint_states", "sensor_msgs/msg/JointState"),
    )


def test_a_topic_advertised_without_a_type_is_still_listed() -> None:
    node = GraphNode([("/mystery", [])])

    assert RclpyRosTopicCatalogGateway(node).list_topics() == (RosTopicInfo("/mystery", ""),)


def test_status_counts_the_publishers_and_subscribers_of_each_topic() -> None:
    node = GraphNode([("/joint_states", ["sensor_msgs/msg/JointState"]), ("/ee_pose", ["geometry_msgs/msg/Pose"])])

    assert RclpyRosTopicCatalogGateway(node).list_topic_status() == (
        RosTopicStatus("/ee_pose", "geometry_msgs/msg/Pose", publisher_count=1, subscription_count=0),
        RosTopicStatus("/joint_states", "sensor_msgs/msg/JointState", publisher_count=2, subscription_count=1),
    )


def test_a_node_without_endpoint_queries_reports_zero_counts() -> None:
    [status] = RclpyRosTopicCatalogGateway(BareNode()).list_topic_status()

    assert (status.name, status.publisher_count, status.subscription_count) == ("/ee_pose", 0, 0)


def test_without_ros_the_catalog_is_empty() -> None:
    gateway = NoopRosTopicCatalogGateway()

    assert gateway.list_topics() == ()
    assert gateway.list_topic_status() == ()
