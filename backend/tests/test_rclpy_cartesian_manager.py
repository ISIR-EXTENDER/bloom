import sys
from types import ModuleType

from libs.ros_adapters.rclpy_cartesian_manager import RclpyCartesianManagerGateway
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
        publisher = self.publishers.get(topic)
        if publisher is None:
            publisher = RecordingPublisher()
            self.publishers[topic] = publisher
        return publisher


class FakeVector3:
    def __init__(self) -> None:
        self.x = 0.0
        self.y = 0.0
        self.z = 0.0


class FakeTwist:
    def __init__(self) -> None:
        self.angular = FakeVector3()
        self.linear = FakeVector3()


class FakeHeader:
    def __init__(self) -> None:
        self.frame_id = ""
        self.stamp = None


class FakeTwistStamped:
    def __init__(self) -> None:
        self.header = FakeHeader()
        self.twist = FakeTwist()


class FakeTime:
    def __init__(self) -> None:
        self.sec = 0
        self.nanosec = 0


def make_command(target: str = "/joystick_cartesian_command") -> TeleopCommand:
    return TeleopCommand(
        angular=TeleopVector3(x=0.0, y=0.0, z=0.3),
        linear=TeleopVector3(x=0.1, y=-0.2, z=0.0),
        mode=3,
        seq=42,
        target=target,
    )


def test_gateway_publishes_stamped_twist(monkeypatch) -> None:
    install_fake_ros_messages(monkeypatch)
    node = RecordingNode()
    gateway = RclpyCartesianManagerGateway(node)

    receipt = gateway.publish(make_command())

    published = node.publishers["/joystick_cartesian_command"].messages[0]
    assert receipt.status == "accepted"
    assert published.twist.linear.x == 0.1
    assert published.twist.linear.y == -0.2
    assert published.twist.angular.z == 0.3


def test_gateway_stamps_the_configured_frame(monkeypatch) -> None:
    # cartesian_manager drops any command whose frame is neither empty nor its
    # default_input_frame_id, and the robot silently stops. This is the single
    # most important field on the message.
    install_fake_ros_messages(monkeypatch)
    node = RecordingNode()
    gateway = RclpyCartesianManagerGateway(node, command_frame_id="base_link")

    gateway.publish(make_command())

    published = node.publishers["/joystick_cartesian_command"].messages[0]
    assert published.header.frame_id == "base_link"


def test_gateway_supports_empty_frame(monkeypatch) -> None:
    # An empty frame is treated by the manager as its default input frame.
    install_fake_ros_messages(monkeypatch)
    node = RecordingNode()
    gateway = RclpyCartesianManagerGateway(node, command_frame_id="  ")

    gateway.publish(make_command())

    assert node.publishers["/joystick_cartesian_command"].messages[0].header.frame_id == ""


def test_gateway_does_not_publish_extender_specific_messages(monkeypatch) -> None:
    # The whole point of the migration: no extender_msgs dependency on this path.
    install_fake_ros_messages(monkeypatch, include_extender_msgs=False)
    node = RecordingNode()
    gateway = RclpyCartesianManagerGateway(node)

    receipt = gateway.publish(make_command())

    assert receipt.status == "accepted"


def test_publish_reuses_one_publisher_per_topic(monkeypatch) -> None:
    install_fake_ros_messages(monkeypatch)
    node = RecordingNode()
    gateway = RclpyCartesianManagerGateway(node)

    gateway.publish(make_command())
    gateway.publish(make_command())

    assert len(node.publishers["/joystick_cartesian_command"].messages) == 2


def install_fake_ros_messages(monkeypatch, include_extender_msgs: bool = True) -> None:
    geometry_msgs = ModuleType("geometry_msgs")
    geometry_msgs_msg = ModuleType("geometry_msgs.msg")
    std_msgs = ModuleType("std_msgs")
    std_msgs_msg = ModuleType("std_msgs.msg")
    builtin_interfaces = ModuleType("builtin_interfaces")
    builtin_interfaces_msg = ModuleType("builtin_interfaces.msg")
    rclpy = ModuleType("rclpy")

    geometry_msgs_msg.TwistStamped = FakeTwistStamped
    geometry_msgs_msg.Twist = FakeTwist
    builtin_interfaces_msg.Time = FakeTime
    rclpy.spin_once = lambda node, timeout_sec=0: None
    geometry_msgs.msg = geometry_msgs_msg
    std_msgs.msg = std_msgs_msg
    builtin_interfaces.msg = builtin_interfaces_msg

    monkeypatch.setitem(sys.modules, "geometry_msgs", geometry_msgs)
    monkeypatch.setitem(sys.modules, "geometry_msgs.msg", geometry_msgs_msg)
    monkeypatch.setitem(sys.modules, "std_msgs", std_msgs)
    monkeypatch.setitem(sys.modules, "std_msgs.msg", std_msgs_msg)
    monkeypatch.setitem(sys.modules, "builtin_interfaces", builtin_interfaces)
    monkeypatch.setitem(sys.modules, "builtin_interfaces.msg", builtin_interfaces_msg)
    monkeypatch.setitem(sys.modules, "rclpy", rclpy)

    if not include_extender_msgs:
        monkeypatch.delitem(sys.modules, "extender_msgs", raising=False)
        monkeypatch.delitem(sys.modules, "extender_msgs.msg", raising=False)
