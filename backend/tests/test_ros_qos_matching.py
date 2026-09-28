"""Bloom subscribes with the QoS a topic's publishers offer, as ``ros2 topic echo`` does."""

import os
import time
from types import SimpleNamespace

import pytest

from libs.ros_adapters.qos import (
    BEST_EFFORT,
    RELIABLE,
    TRANSIENT_LOCAL,
    VOLATILE,
    AdaptiveSubscription,
    QosChoice,
)
from libs.ros_adapters.rclpy_topic_streams import RclpyRuntimeTopicSubscriptionGateway
from libs.sessions.topics import RuntimeTopicSubscription


def publisher(reliability: str, durability: str) -> SimpleNamespace:
    # rclpy reports enum members; only their names matter.
    return SimpleNamespace(
        qos_profile=SimpleNamespace(
            reliability=SimpleNamespace(name=reliability), durability=SimpleNamespace(name=durability)
        )
    )


class GraphNode:
    def __init__(self, publishers=()) -> None:
        self.publishers = list(publishers)
        self.created: list[QosChoice] = []
        self.destroyed: list[int] = []
        self.timers: list = []
        self.destroyed_timers = 0

    def get_publishers_info_by_topic(self, topic):
        return list(self.publishers)

    def create_subscription(self, message_cls, topic, callback, qos):
        self.created.append(qos)
        return len(self.created)

    def destroy_subscription(self, subscription) -> None:
        self.destroyed.append(subscription)

    def create_timer(self, period, callback):
        self.timers.append(callback)
        return callback

    def destroy_timer(self, timer) -> None:
        self.timers.remove(timer)
        self.destroyed_timers += 1

    def tick(self) -> None:
        for callback in list(self.timers):
            callback()


def subscribe(node: GraphNode) -> AdaptiveSubscription:
    return AdaptiveSubscription(node, object, "/status", lambda message: None, 10, qos_factory=lambda choice: choice)


def test_a_best_effort_publisher_gets_a_best_effort_subscription() -> None:
    node = GraphNode([publisher("BEST_EFFORT", "VOLATILE")])
    subscribe(node)
    assert node.created == [QosChoice(BEST_EFFORT, VOLATILE, 10)]
    assert node.timers == []


def test_a_latched_publisher_gets_a_transient_local_subscription() -> None:
    node = GraphNode([publisher("RELIABLE", "TRANSIENT_LOCAL")])
    subscribe(node)
    assert node.created == [QosChoice(RELIABLE, TRANSIENT_LOCAL, 10)]


def test_disagreeing_publishers_fall_back_to_best_effort_volatile() -> None:
    node = GraphNode([publisher("RELIABLE", "TRANSIENT_LOCAL"), publisher("BEST_EFFORT", "VOLATILE")])
    subscribe(node)
    assert node.created == [QosChoice(BEST_EFFORT, VOLATILE, 10)]


def test_a_publisher_that_appears_later_triggers_one_resubscription() -> None:
    node = GraphNode()
    subscription = subscribe(node)
    assert node.created == [QosChoice(BEST_EFFORT, VOLATILE, 10)]

    node.tick()
    assert len(node.created) == 1

    node.publishers.append(publisher("RELIABLE", "TRANSIENT_LOCAL"))
    node.tick()
    node.tick()
    assert node.created == [QosChoice(BEST_EFFORT, VOLATILE, 10), QosChoice(RELIABLE, TRANSIENT_LOCAL, 10)]
    assert node.destroyed == [1]
    assert node.timers == []

    subscription.close()
    subscription.close()
    assert node.destroyed == [1, 2]


def test_a_late_publisher_already_matched_stops_polling_without_resubscribing() -> None:
    node = GraphNode()
    subscribe(node)
    node.publishers.append(publisher("BEST_EFFORT", "VOLATILE"))
    node.tick()
    assert len(node.created) == 1
    assert node.timers == []


def test_closing_before_a_publisher_appears_stops_the_poll() -> None:
    node = GraphNode()
    subscribe(node).close()
    assert node.timers == []
    assert node.destroyed == [1]


def test_the_widget_handle_survives_the_resubscription() -> None:
    node = GraphNode()
    gateway = RclpyRuntimeTopicSubscriptionGateway(node, qos_factory=lambda choice: choice)
    gateway._get_message_class = lambda message_type: object  # type: ignore[method-assign]
    handle = gateway.subscribe(
        RuntimeTopicSubscription(topic="/status", message_type="std_msgs/msg/String"), lambda sample: None
    )
    node.publishers.append(publisher("RELIABLE", "VOLATILE"))
    node.tick()
    handle.close()
    assert node.destroyed == [1, 2]


@pytest.fixture
def ros_node():
    rclpy = pytest.importorskip("rclpy")
    pytest.importorskip("std_msgs.msg")
    from rclpy.executors import SingleThreadedExecutor

    previous_domain = os.environ.get("ROS_DOMAIN_ID")
    os.environ["ROS_DOMAIN_ID"] = "91"
    context = rclpy.Context()
    rclpy.init(context=context)
    try:
        node = rclpy.create_node("bloom_qos_test", context=context)
        executor = SingleThreadedExecutor(context=context)
        executor.add_node(node)
        yield node, executor
    finally:
        rclpy.shutdown(context=context)
        if previous_domain is None:
            os.environ.pop("ROS_DOMAIN_ID", None)
        else:
            os.environ["ROS_DOMAIN_ID"] = previous_domain


def spin_until(executor, received: list, publish=lambda: None, timeout_s: float = 5.0) -> None:
    deadline = time.monotonic() + timeout_s
    while not received and time.monotonic() < deadline:
        publish()
        executor.spin_once(timeout_sec=0.05)


def stream(node, topic: str, received: list):
    gateway = RclpyRuntimeTopicSubscriptionGateway(node)
    return gateway.subscribe(RuntimeTopicSubscription(topic=topic, message_type="std_msgs/msg/String"), received.append)


def test_a_best_effort_publisher_reaches_bloom_over_real_ros(ros_node) -> None:
    from rclpy.qos import QoSProfile, QoSReliabilityPolicy
    from std_msgs.msg import String

    node, executor = ros_node
    ros_publisher = node.create_publisher(
        String, "/bloom_qos_best_effort", QoSProfile(depth=10, reliability=QoSReliabilityPolicy.BEST_EFFORT)
    )
    received: list = []
    handle = stream(node, "/bloom_qos_best_effort", received)
    spin_until(executor, received, lambda: ros_publisher.publish(String(data="hello")))
    handle.close()
    assert received and received[0].value == {"data": "hello"}


def test_a_latched_sample_published_before_bloom_subscribed_still_arrives(ros_node) -> None:
    from rclpy.qos import QoSDurabilityPolicy, QoSProfile
    from std_msgs.msg import String

    node, executor = ros_node
    ros_publisher = node.create_publisher(
        String, "/bloom_qos_latched", QoSProfile(depth=1, durability=QoSDurabilityPolicy.TRANSIENT_LOCAL)
    )
    ros_publisher.publish(String(data="ready"))
    received: list = []
    handle = stream(node, "/bloom_qos_latched", received)
    spin_until(executor, received)
    handle.close()
    assert received and received[0].value == {"data": "ready"}


def test_a_latched_publisher_that_starts_after_bloom_is_picked_up(ros_node) -> None:
    from rclpy.qos import QoSDurabilityPolicy, QoSProfile
    from std_msgs.msg import String

    node, executor = ros_node
    received: list = []
    handle = stream(node, "/bloom_qos_late", received)
    ros_publisher = node.create_publisher(
        String, "/bloom_qos_late", QoSProfile(depth=1, durability=QoSDurabilityPolicy.TRANSIENT_LOCAL)
    )
    ros_publisher.publish(String(data="late"))

    deadline = time.monotonic() + 5.0
    while handle._subscription.qos.durability != TRANSIENT_LOCAL and time.monotonic() < deadline:
        executor.spin_once(timeout_sec=0.05)
    assert handle._subscription.qos == QosChoice(RELIABLE, TRANSIENT_LOCAL, 10)

    received.clear()
    spin_until(executor, received)
    handle.close()
    assert received and received[0].value == {"data": "late"}
