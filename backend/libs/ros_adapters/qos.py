"""Subscribe with the QoS the topic's publishers offer, as ``ros2 topic echo`` does.

The choice follows ``EchoVerb.choose_qos`` from ros2cli's ros2topic (Jazzy),
Copyright 2016-2017 Open Source Robotics Foundation, Inc., Apache-2.0.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

RELIABLE = "reliable"
BEST_EFFORT = "best_effort"
VOLATILE = "volatile"
TRANSIENT_LOCAL = "transient_local"

#: How often a subscription opened before any publisher checks whether one has appeared.
PUBLISHER_POLL_PERIOD_S = 1.0


@dataclass(frozen=True)
class QosChoice:
    reliability: str
    durability: str
    depth: int


#: What a latched topic needs for its last sample to arrive on subscribe.
LATCHED_QOS = QosChoice(RELIABLE, TRANSIENT_LOCAL, 1)


def compatible_qos(depth: int) -> QosChoice:
    """Matches every publisher, at the cost of reliability and latched samples."""
    return QosChoice(BEST_EFFORT, VOLATILE, depth)


def choose_qos(publishers: Iterable[Any], depth: int, best_effort_only: bool = False) -> QosChoice | None:
    """None when no publisher is known; otherwise the policies every publisher can serve."""
    profiles = [info.qos_profile for info in publishers]
    if not profiles:
        return None
    all_reliable = all(_policy_name(profile.reliability) == "RELIABLE" for profile in profiles)
    all_latched = all(_policy_name(profile.durability) == "TRANSIENT_LOCAL" for profile in profiles)
    return QosChoice(
        reliability=RELIABLE if all_reliable and not best_effort_only else BEST_EFFORT,
        durability=TRANSIENT_LOCAL if all_latched else VOLATILE,
        depth=depth,
    )


def build_qos_profile(choice: QosChoice) -> Any:
    try:
        from rclpy.qos import HistoryPolicy, QoSDurabilityPolicy, QoSProfile, QoSReliabilityPolicy
    except ModuleNotFoundError as exc:
        raise RuntimeError("rclpy is required to subscribe to ROS topics") from exc
    return QoSProfile(
        history=HistoryPolicy.KEEP_LAST,
        depth=choice.depth,
        reliability=QoSReliabilityPolicy.RELIABLE
        if choice.reliability == RELIABLE
        else QoSReliabilityPolicy.BEST_EFFORT,
        durability=(
            QoSDurabilityPolicy.TRANSIENT_LOCAL
            if choice.durability == TRANSIENT_LOCAL
            else QoSDurabilityPolicy.VOLATILE
        ),
    )


def _policy_name(policy: Any) -> str:
    return str(getattr(policy, "name", policy)).upper()


class AdaptiveSubscription:
    """One rclpy subscription whose QoS follows the publishers.

    Opened before any publisher exists, it uses the compatible QoS and polls the graph; the
    first time publishers show up it re-subscribes once if their QoS differs, then stops polling.
    """

    def __init__(
        self,
        node: Any,
        message_cls: type,
        topic: str,
        callback: Callable[[Any], None],
        depth: int,
        *,
        best_effort_only: bool = False,
        qos_factory: Callable[[QosChoice], Any] = build_qos_profile,
        poll_period_s: float = PUBLISHER_POLL_PERIOD_S,
    ) -> None:
        self._node = node
        self._message_cls = message_cls
        self._topic = topic
        self._callback = callback
        self._depth = depth
        self._best_effort_only = best_effort_only
        self._qos_factory = qos_factory
        self._lock = threading.Lock()
        self._closed = False
        self._timer: Any = None

        choice = self._choose()
        self._choice = choice or compatible_qos(depth)
        self._subscription = self._create(self._choice)
        if choice is None:
            try:
                self._timer = node.create_timer(poll_period_s, self._on_poll)
            except Exception:
                node.destroy_subscription(self._subscription)
                raise

    @property
    def qos(self) -> QosChoice:
        return self._choice

    def close(self) -> None:
        with self._lock:
            if self._closed:
                return
            self._closed = True
            self._cancel_timer()
            self._node.destroy_subscription(self._subscription)

    def _on_poll(self) -> None:
        with self._lock:
            if self._closed or self._timer is None:
                return
            try:
                choice = self._choose()
            except Exception:
                logger.exception("Cannot read the publishers of %s; keeping the compatible QoS.", self._topic)
                self._cancel_timer()
                return
            if choice is None:
                return
            self._cancel_timer()
            if choice == self._choice:
                return
            try:
                replacement = self._create(choice)
            except Exception:
                logger.exception("Cannot re-subscribe to %s with the publishers' QoS.", self._topic)
                return
            previous, self._subscription, self._choice = self._subscription, replacement, choice
            self._node.destroy_subscription(previous)

    def _choose(self) -> QosChoice | None:
        publishers = self._node.get_publishers_info_by_topic(self._topic)
        return choose_qos(publishers, self._depth, best_effort_only=self._best_effort_only)

    def _create(self, choice: QosChoice) -> Any:
        return self._node.create_subscription(self._message_cls, self._topic, self._callback, self._qos_factory(choice))

    def _cancel_timer(self) -> None:
        if self._timer is not None:
            self._node.destroy_timer(self._timer)
            self._timer = None


class LatchedSubscription:
    """A fixed reliable, transient-local, depth-1 subscription: the publisher's latched sample arrives on subscribe."""

    def __init__(
        self,
        node: Any,
        message_cls: type,
        topic: str,
        callback: Callable[[Any], None],
        *,
        qos_factory: Callable[[QosChoice], Any] = build_qos_profile,
    ) -> None:
        self._node = node
        self._subscription = node.create_subscription(message_cls, topic, callback, qos_factory(LATCHED_QOS))

    @property
    def qos(self) -> QosChoice:
        return LATCHED_QOS

    def close(self) -> None:
        self._node.destroy_subscription(self._subscription)
