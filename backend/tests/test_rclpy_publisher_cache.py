from types import SimpleNamespace

from libs.ros_adapters import rclpy_publishers
from libs.ros_adapters.rclpy_publishers import RclpyRosPublisherGateway


class FakeNode:
    def __init__(self) -> None:
        self.created: list[str] = []
        self.destroyed: list[str] = []

    def create_publisher(self, _message_cls, topic: str, _qos) -> SimpleNamespace:
        self.created.append(topic)
        return SimpleNamespace(topic=topic)

    def destroy_publisher(self, publisher: SimpleNamespace) -> None:
        self.destroyed.append(publisher.topic)


def test_the_publisher_cache_stays_bounded_and_drops_the_least_used(monkeypatch) -> None:
    # Every name under /ui/ is allowed, so an owner looping new names made a DDS publisher each, forever.
    monkeypatch.setattr(rclpy_publishers, "MAX_CACHED_PUBLISHERS", 2)
    node = FakeNode()
    gateway = RclpyRosPublisherGateway(node)

    for topic in ("/ui/a", "/ui/b", "/ui/a", "/ui/c"):
        with gateway._publishers_lock:
            gateway._ensure_publisher(topic, "std_msgs/msg/Bool", object)

    assert node.created == ["/ui/a", "/ui/b", "/ui/c"]
    assert node.destroyed == ["/ui/b"]


def test_the_topics_stop_publishes_on_are_never_evicted(monkeypatch) -> None:
    # A recreated publisher can lose its first message before discovery: STOP's cancel must not be that message.
    monkeypatch.setattr(rclpy_publishers, "MAX_CACHED_PUBLISHERS", 1)
    node = FakeNode()
    gateway = RclpyRosPublisherGateway(node)

    for topic in ("/mode_request", "/ui/a", "/ui/b"):
        with gateway._publishers_lock:
            gateway._ensure_publisher(topic, "std_msgs/msg/String", object)

    assert "/mode_request" not in node.destroyed
    assert node.destroyed == ["/ui/a"]
