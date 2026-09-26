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

    gateway._ensure_publisher("/ui/a", "std_msgs/msg/Bool", object)
    gateway._ensure_publisher("/ui/b", "std_msgs/msg/Bool", object)
    gateway._ensure_publisher("/ui/a", "std_msgs/msg/Bool", object)
    gateway._ensure_publisher("/ui/c", "std_msgs/msg/Bool", object)

    assert node.created == ["/ui/a", "/ui/b", "/ui/c"]
    assert node.destroyed == ["/ui/b"]
