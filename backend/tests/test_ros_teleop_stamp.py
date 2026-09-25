from libs.ros_adapters.rclpy_cartesian_manager import RclpyCartesianManagerGateway
from libs.sessions import TeleopCommand, TeleopVector3


class FakeStamp:
    def __init__(self) -> None:
        self.sec = 0
        self.nanosec = 0


class FakeHeader:
    def __init__(self) -> None:
        self.stamp = FakeStamp()
        self.frame_id = ""


class FakeVector:
    def __init__(self) -> None:
        self.x = 0.0
        self.y = 0.0
        self.z = 0.0


class FakeTwist:
    def __init__(self) -> None:
        self.linear = FakeVector()
        self.angular = FakeVector()


class FakeTwistStamped:
    def __init__(self) -> None:
        self.header = FakeHeader()
        self.twist = FakeTwist()


def build_message(monkeypatch, frame_id: str = "", linear_x: float = 0.1, angular_z: float = 0.0) -> FakeTwistStamped:
    gateway = RclpyCartesianManagerGateway.__new__(RclpyCartesianManagerGateway)
    gateway._command_frame_id = "base_link"
    monkeypatch.setattr(
        RclpyCartesianManagerGateway,
        "_get_twist_stamped_message_class",
        staticmethod(lambda: FakeTwistStamped),
    )
    command = TeleopCommand(
        angular=TeleopVector3(z=angular_z),
        frame_id=frame_id,
        linear=TeleopVector3(x=linear_x),
        mode=0,
        seq=1,
        target="/tablet_cartesian_command",
    )
    return gateway._to_ros_message(command)


def test_outgoing_commands_carry_no_timestamp(monkeypatch) -> None:
    """The manager's fail-to-zero depends on this staying zero.

    cartesian_manager reads a zero stamp as "use my own clock" and otherwise
    tests `now - stamp <= timeout` against a 0.2s joystick timeout. Stamping
    with Bloom's clock makes that difference negative the moment this process
    runs ahead of the robot's, so a command never expires and the arm keeps the
    last velocity after the link dies. Staleness belongs to the node that owns
    the timeout, so we hand it an unstamped command.
    """
    message = build_message(monkeypatch)

    assert message.header.stamp.sec == 0
    assert message.header.stamp.nanosec == 0


def test_outgoing_commands_still_carry_the_frame(monkeypatch) -> None:
    """The manager needs a known rotation frame on every command."""
    message = build_message(monkeypatch)

    assert message.header.frame_id == "base_link"
    assert message.twist.linear.x == 0.1


def test_a_command_frame_overrides_the_configured_default(monkeypatch) -> None:
    """frame_id selects the manager's rotation frame per command."""
    message = build_message(monkeypatch, frame_id="ft_frame")

    assert message.header.frame_id == "ft_frame"


def test_axes_are_clamped_to_unit_scale(monkeypatch) -> None:
    """joystick_mapper bounds each axis to [-1, 1]; Bloom matches it. An
    oversized axis would not go faster, it would drown the other summed
    sources."""
    message = build_message(monkeypatch, linear_x=5.0, angular_z=-3.0)

    assert message.twist.linear.x == 1.0
    assert message.twist.angular.z == -1.0
