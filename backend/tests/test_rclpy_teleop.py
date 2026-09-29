import sys
from types import ModuleType

import pytest

from libs.ros_adapters.rclpy_teleop import RclpyTeleopCommandGateway
from libs.sessions import TeleopCommand, TeleopVector3


class RecordingPublisher:
    def __init__(self) -> None:
        self.messages: list[object] = []

    def publish(self, message: object) -> None:
        self.messages.append(message)


class RecordingNode:
    def __init__(self) -> None:
        self.publishers: dict[str, RecordingPublisher] = {}

    def create_publisher(self, message_cls: type, topic: str, qos_profile: int) -> RecordingPublisher:
        publisher = RecordingPublisher()
        self.publishers[topic] = publisher
        return publisher


class FakeVector3:
    x = 0.0
    y = 0.0
    z = 0.0


class FakeTwist:
    def __init__(self) -> None:
        self.angular = FakeVector3()
        self.linear = FakeVector3()


class FakeRosTeleopCommand:
    def __init__(self) -> None:
        self.mode = 0
        self.twist = None


def test_rclpy_teleop_gateway_publishes_extender_teleop_messages(monkeypatch) -> None:
    install_fake_ros_messages(monkeypatch)
    node = RecordingNode()
    gateway = RclpyTeleopCommandGateway(node)

    receipt = gateway.publish(
        TeleopCommand(
            angular=TeleopVector3(x=0.0, y=0.0, z=0.3),
            linear=TeleopVector3(x=0.1, y=-0.2, z=0.0),
            mode=3,
            seq=42,
            target="/teleop_cmd",
        )
    )

    published_message = node.publishers["/teleop_cmd"].messages[0]
    assert receipt.status == "accepted"
    assert published_message.mode == 3
    assert published_message.twist.linear.x == 0.1
    assert published_message.twist.linear.y == -0.2
    assert published_message.twist.angular.z == 0.3


def install_fake_ros_messages(monkeypatch) -> None:
    extender_msgs = ModuleType("extender_msgs")
    extender_msgs_msg = ModuleType("extender_msgs.msg")
    geometry_msgs = ModuleType("geometry_msgs")
    geometry_msgs_msg = ModuleType("geometry_msgs.msg")
    rclpy = ModuleType("rclpy")

    extender_msgs_msg.TeleopCommand = FakeRosTeleopCommand
    geometry_msgs_msg.Twist = FakeTwist
    rclpy.spin_once = lambda node, timeout_sec=0: None
    extender_msgs.msg = extender_msgs_msg
    geometry_msgs.msg = geometry_msgs_msg

    monkeypatch.setitem(sys.modules, "extender_msgs", extender_msgs)
    monkeypatch.setitem(sys.modules, "extender_msgs.msg", extender_msgs_msg)
    monkeypatch.setitem(sys.modules, "geometry_msgs", geometry_msgs)
    monkeypatch.setitem(sys.modules, "geometry_msgs.msg", geometry_msgs_msg)
    monkeypatch.setitem(sys.modules, "rclpy", rclpy)


class CountingNode(RecordingNode):
    def __init__(self) -> None:
        super().__init__()
        self.created: list[str] = []

    def create_publisher(self, message_cls: type, topic: str, qos_profile: int) -> RecordingPublisher:
        self.created.append(topic)
        return super().create_publisher(message_cls, topic, qos_profile)


def teleop(target: str = "/teleop_cmd") -> TeleopCommand:
    return TeleopCommand(
        angular=TeleopVector3(x=0.0, y=0.0, z=0.0),
        linear=TeleopVector3(x=0.1, y=0.0, z=0.0),
        mode=0,
        seq=1,
        target=target,
    )


def test_a_gateway_that_does_not_flush_never_spins_and_reuses_its_publisher(monkeypatch) -> None:
    install_fake_ros_messages(monkeypatch)

    def refuse_spin(node, timeout_sec=0):
        raise AssertionError("a non-flushing gateway must not spin the node")

    sys.modules["rclpy"].spin_once = refuse_spin  # type: ignore[attr-defined]
    node = CountingNode()
    gateway = RclpyTeleopCommandGateway(node, flush_after_publish=False)

    gateway.publish(teleop())
    gateway.publish(teleop())

    assert node.created == ["/teleop_cmd"]
    assert len(node.publishers["/teleop_cmd"].messages) == 2


def test_without_the_message_packages_publishing_names_the_missing_one(monkeypatch) -> None:
    install_fake_ros_messages(monkeypatch)
    node = RecordingNode()

    monkeypatch.setitem(sys.modules, "extender_msgs.msg", None)
    with pytest.raises(RuntimeError, match="extender_msgs is required to publish teleop commands"):
        RclpyTeleopCommandGateway(node).publish(teleop())

    install_fake_ros_messages(monkeypatch)
    monkeypatch.setitem(sys.modules, "geometry_msgs.msg", None)
    with pytest.raises(RuntimeError, match="geometry_msgs is required to publish teleop commands"):
        RclpyTeleopCommandGateway(node).publish(teleop())

    assert node.publishers["/teleop_cmd"].messages == []
