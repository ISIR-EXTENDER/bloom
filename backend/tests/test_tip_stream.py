"""The measured tip reaches Bloom Debug's Command vs motion panel on /tf, one transform per joint state."""

from __future__ import annotations

import pytest

from apps.bloom_api.main import create_app, measured_tip
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters.tip_stream import TIP_POSE_FIELD_PATH, TipPoseDerivingGateway, tip_sample_value
from libs.sessions import RuntimeTopicSample, RuntimeTopicSampleCallback, RuntimeTopicSubscription
from libs.sessions.positions import CartesianPose

TIP = CartesianPose("base_link", (0.6, 0.27, 0.245), (0.0, 0.0, 0.0, 1.0))


class JointStateGateway:
    """Delivers one joint state to whatever subscribes, and remembers what was asked."""

    def __init__(self) -> None:
        self.subscriptions: list[RuntimeTopicSubscription] = []

    def subscribe(self, subscription: RuntimeTopicSubscription, on_sample: RuntimeTopicSampleCallback):
        self.subscriptions.append(subscription)
        on_sample(
            RuntimeTopicSample(
                message_type=subscription.message_type,
                received_at="2026-09-29T10:00:00+00:00",
                topic=subscription.topic,
                value={"name": ["joint_1"], "position": [0.1]},
            )
        )

        class Handle:
            def close(self) -> None:
                return None

        return Handle()


def subscribe(gateway, topic: str = "/tf", field_path: str = TIP_POSE_FIELD_PATH) -> list[RuntimeTopicSample]:
    samples: list[RuntimeTopicSample] = []
    gateway.subscribe(
        RuntimeTopicSubscription(topic=topic, message_type="tf2_msgs/msg/TFMessage", field_path=field_path),
        samples.append,
    )
    return samples


def test_the_tip_field_path_streams_one_transform_per_joint_state() -> None:
    inner = JointStateGateway()
    gateway = TipPoseDerivingGateway(inner, lambda: (TIP, "ft_frame"))

    [sample] = subscribe(gateway)

    assert inner.subscriptions == [
        RuntimeTopicSubscription(topic="/joint_states", message_type="sensor_msgs/msg/JointState")
    ]
    assert sample.topic == "/tf"
    assert sample.stream == TIP_POSE_FIELD_PATH
    assert sample.received_at == "2026-09-29T10:00:00+00:00"
    assert sample.value == {
        "child_frame_id": "ft_frame",
        "frame_id": "base_link",
        "orientation": {"w": 1.0, "x": 0.0, "y": 0.0, "z": 0.0},
        "position": {"x": 0.6, "y": 0.27, "z": 0.245},
    }


def test_nothing_streams_while_the_tip_is_unknown() -> None:
    assert subscribe(TipPoseDerivingGateway(JointStateGateway(), lambda: None)) == []


def test_other_subscriptions_pass_through_and_the_tip_is_only_on_tf() -> None:
    inner = JointStateGateway()
    gateway = TipPoseDerivingGateway(inner, lambda: (TIP, "ft_frame"))

    [raw] = subscribe(gateway, topic="/joint_states", field_path="")
    assert raw.value == {"name": ["joint_1"], "position": [0.1]}
    with pytest.raises(ValueError, match="/tf"):
        subscribe(gateway, topic="/tf_static")


class TipSource:
    def __init__(self, pose: CartesianPose | None) -> None:
        self.pose = pose
        self.asked: list[tuple[str, str]] = []

    def lookup(self, base_frame: str, tip_frame: str) -> CartesianPose | None:
        self.asked.append((base_frame, tip_frame))
        return self.pose


def test_the_app_looks_the_tip_up_from_the_manager_base_frame_to_qontrols_tip_frame() -> None:
    app = create_app(Settings(environment="test"), InMemoryConfigurationRepository())
    source = TipSource(TIP)
    app.state.tip_pose_source = source
    assert measured_tip(app) is None

    tracker = app.state.command_state_tracker
    tracker.record_parameter("/cartesian_manager", "frames.base_frame", "base_link")
    tracker.record_parameter("/qontrol_explorer", "tip_frame", "ft_frame")

    assert measured_tip(app) == (TIP, "ft_frame")
    assert source.asked == [("base_link", "ft_frame")]
    assert tip_sample_value(TIP, "ft_frame")["frame_id"] == "base_link"


def test_without_a_tf_reader_there_is_no_measured_tip() -> None:
    app = create_app(Settings(environment="test"), InMemoryConfigurationRepository())
    tracker = app.state.command_state_tracker
    tracker.record_parameter("/cartesian_manager", "frames.base_frame", "base_link")
    tracker.record_parameter("/qontrol_explorer", "tip_frame", "ft_frame")

    assert measured_tip(app) is None


def test_a_live_app_wraps_its_subscriptions_with_the_tip_stream() -> None:
    inner = JointStateGateway()
    app = create_app(
        Settings(environment="test"), InMemoryConfigurationRepository(), runtime_topic_subscription_gateway=inner
    )
    app.state.tip_pose_source = TipSource(TIP)
    tracker = app.state.command_state_tracker
    tracker.record_parameter("/cartesian_manager", "frames.base_frame", "base_link")
    tracker.record_parameter("/qontrol_explorer", "tip_frame", "ft_frame")

    [sample] = subscribe(app.state.runtime_topic_subscription_gateway)

    assert sample.value["child_frame_id"] == "ft_frame"
