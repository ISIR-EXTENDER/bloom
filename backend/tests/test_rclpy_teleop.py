import sys
from types import ModuleType

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
