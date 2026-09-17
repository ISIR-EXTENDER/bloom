"""What this backend can actually do right now.

Bloom runs with or without ROS. `create_app` installs a Noop for every ROS seam
when nothing real is passed in, which is what makes `bloom api run` work on a
laptop with no robot stack. That is deliberate and it works well.

What was missing is anyone saying so. The builder offered every widget whatever
the backend could do, and a widget that needs a subscription simply sat waiting
forever. A researcher had no way to tell "this is still connecting" from "this
can never work here".

The capabilities below are the seams a widget can depend on, reported as they
are actually wired. They are independent -- `run-ros` happens to wire all of
them together, but a deployment could wire a subset, so each is reported on its
own rather than collapsed into one "ROS: yes/no".
"""

from dataclasses import dataclass

from libs.ros_adapters.publishers import NoopRosPublisherGateway
from libs.ros_adapters.services import NoopRosServiceGateway
from libs.sessions.recording import NoopRuntimeRecordingGateway
from libs.sessions.teleop import NoopTeleopCommandGateway
from libs.sessions.topics import NoopRuntimeTopicSubscriptionGateway


@dataclass(frozen=True)
class RuntimeCapability:
    """One seam a widget can depend on."""

    id: str
    available: bool
    detail: str


def _capability(
    id: str, gateway: object, noop_type: type, available_detail: str, missing_detail: str
) -> RuntimeCapability:
    available = not isinstance(gateway, noop_type)
    return RuntimeCapability(
        id=id,
        available=available,
        detail=available_detail if available else missing_detail,
    )


def describe_runtime_capabilities(state: object) -> list[RuntimeCapability]:
    """Report each seam from the gateway actually installed on the app."""

    return [
        _capability(
            "command-dispatcher",
            getattr(state, "ros_publisher_gateway", None),
            NoopRosPublisherGateway,
            "Commands are published to ROS.",
            "No ROS publisher is connected, so commands are accepted and audited but go nowhere.",
        ),
        _capability(
            "service-dispatcher",
            getattr(state, "ros_service_gateway", None),
            NoopRosServiceGateway,
            "ROS services can be called.",
            "No ROS service gateway is connected, so service calls are simulated.",
        ),
        _capability(
            "data-source",
            getattr(state, "runtime_topic_subscription_gateway", None),
            NoopRuntimeTopicSubscriptionGateway,
            "Topic subscriptions deliver live samples.",
            "No ROS subscriber is connected, so widgets that read a topic will never receive anything.",
        ),
        _capability(
            "teleop-adapter",
            getattr(state, "teleop_command_gateway", None),
            NoopTeleopCommandGateway,
            "Teleop commands reach the manager.",
            "No teleop gateway is connected, so joystick and axis widgets move nothing.",
        ),
        _capability(
            "recording",
            getattr(state, "runtime_recording_gateway", None),
            NoopRuntimeRecordingGateway,
            "Runtime recording is available.",
            "No recording gateway is connected, so capture requests are simulated.",
        ),
    ]
