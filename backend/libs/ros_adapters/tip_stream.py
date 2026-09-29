"""The measured tip on the runtime socket, for Bloom Debug's Command vs motion panel.

A subscription to /tf with field_path "tip_pose" streams one transform, the manager's base frame to qontrol's
tip_frame, looked up through the TF reader each time a joint state arrives, instead of the whole /tf tree.
"""

from __future__ import annotations

from collections.abc import Callable

from libs.sessions.positions import CartesianPose
from libs.sessions.topics import (
    RuntimeTopicSample,
    RuntimeTopicSampleCallback,
    RuntimeTopicSubscription,
    RuntimeTopicSubscriptionGateway,
    RuntimeTopicSubscriptionHandle,
)

TIP_POSE_FIELD_PATH = "tip_pose"
TIP_TOPIC = "/tf"
TIP_MESSAGE_TYPE = "tf2_msgs/msg/TFMessage"
JOINT_STATE_MESSAGE_TYPE = "sensor_msgs/msg/JointState"

#: The measured tip and the frame it is, or None while TF, the base frame or the tip frame is not known.
TipLookup = Callable[[], tuple[CartesianPose, str] | None]


class TipPoseDerivingGateway:
    """Subscriptions to /tf with field_path "tip_pose" stream the measured tip; everything else passes through."""

    def __init__(
        self,
        inner: RuntimeTopicSubscriptionGateway,
        lookup: TipLookup,
        joint_state_topic: str = "/joint_states",
    ) -> None:
        self._inner = inner
        self._lookup = lookup
        self._joint_state_topic = joint_state_topic

    def subscribe(
        self,
        subscription: RuntimeTopicSubscription,
        on_sample: RuntimeTopicSampleCallback,
    ) -> RuntimeTopicSubscriptionHandle:
        if subscription.field_path != TIP_POSE_FIELD_PATH:
            return self._inner.subscribe(subscription, on_sample)
        if subscription.topic != TIP_TOPIC:
            raise ValueError(f"the measured tip streams on {TIP_TOPIC} only")

        def on_joint_state(sample: RuntimeTopicSample) -> None:
            found = self._lookup()
            if found is None:
                return
            on_sample(
                RuntimeTopicSample(
                    message_type=TIP_MESSAGE_TYPE,
                    received_at=sample.received_at,
                    stream=TIP_POSE_FIELD_PATH,
                    topic=TIP_TOPIC,
                    value=tip_sample_value(*found),
                )
            )

        # The tip moves only when the joints do: robot_state_publisher turns each joint state into the transforms.
        return self._inner.subscribe(
            RuntimeTopicSubscription(topic=self._joint_state_topic, message_type=JOINT_STATE_MESSAGE_TYPE),
            on_joint_state,
        )


def tip_sample_value(pose: CartesianPose, tip_frame: str) -> dict[str, object]:
    x, y, z = pose.position
    qx, qy, qz, qw = pose.orientation
    return {
        "child_frame_id": tip_frame,
        "frame_id": pose.frame_id,
        "orientation": {"w": qw, "x": qx, "y": qy, "z": qz},
        "position": {"x": x, "y": y, "z": z},
    }


__all__ = [
    "TIP_MESSAGE_TYPE",
    "TIP_POSE_FIELD_PATH",
    "TIP_TOPIC",
    "TipLookup",
    "TipPoseDerivingGateway",
    "tip_sample_value",
]
