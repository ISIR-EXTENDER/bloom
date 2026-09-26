"""The runtime STOP latch: outranks every command path while engaged.

Engaging publishes a zero twist plus a ``behaviour/passthrough`` mode request,
the manager's own joint-target cancel, and a ``geometric/both`` shaping reset.
Not an IEC emergency stop.
"""

from __future__ import annotations

import json
import os
import threading
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, TypeVar

from libs.ros_adapters.mode_request import DEFAULT_GEOMETRIC_MODE
from libs.ros_adapters.names import ros_name_error
from libs.ros_adapters.publishers import RosPublisherGateway, RosPublishRequest
from libs.sessions.audit import RuntimeAuditLog, RuntimeAuditRecord, RuntimeAuditStatus
from libs.sessions.teleop import TeleopCommand, TeleopCommandGateway, TeleopVector3

CANCEL_MODE_REQUEST = "behaviour/passthrough"
#: input_interfaces' visual servoing node: its velocity output stays live while this is true.
VISUAL_SERVOING_ON_TOPIC = "/ui/visual_servoing/on"
DEFAULT_MODE_REQUEST_TOPIC = "/mode_request"
DEFAULT_TELEOP_TARGET = "/joystick_cartesian_command"
# sandbox_controller, on the legacy teleop_command backend.
LEGACY_TELEOP_TARGET = "/teleop_cmd"

T = TypeVar("T")


@dataclass(frozen=True)
class RuntimeStopState:
    stopped: bool
    asserted: bool
    engaged_at: str
    detail: str
    # True when an assertion was only simulated, so `asserted` does not mean the robot was told.
    simulated: bool = False


class RuntimeStoppedError(RuntimeError):
    """Raised when a robot command loses the race with the STOP latch."""


class RuntimeStopLatchMismatchError(RuntimeError):
    """Raised when a resume answers a STOP other than the one latched now."""


class RuntimeStopAssertionError(RuntimeError):
    """Raised after the latch engages but its ROS assertions do not both publish."""

    def __init__(self, state: RuntimeStopState) -> None:
        super().__init__(state.detail)
        self.state = state


class RuntimeStopController:
    """Latches the runtime stopped and asserts it toward the robot."""

    def __init__(
        self,
        teleop_gateway: TeleopCommandGateway,
        ros_publisher_gateway: RosPublisherGateway,
        audit_log: RuntimeAuditLog | None = None,
        teleop_target: str = DEFAULT_TELEOP_TARGET,
        mode_request_topic: str = DEFAULT_MODE_REQUEST_TOPIC,
        on_asserted: Callable[..., None] | None = None,
        teleop_targets: Sequence[str] | Callable[[], Sequence[str]] | None = None,
        joint_target_topics: Callable[[], Iterable[str]] | None = None,
        shaping_topics: Callable[[], Iterable[str]] | None = None,
        state_path: Path | None = None,
    ) -> None:
        self._teleop_gateway = teleop_gateway
        self._ros_publisher_gateway = ros_publisher_gateway
        self._audit_log = audit_log
        self._teleop_target = teleop_target
        # Every target the deployment accepts is zeroed: a session may have been driving any of them.
        # A callable is read at each STOP, since the manager's inputs can change while Bloom runs.
        self._teleop_targets_source = teleop_targets
        self._mode_request_topic = mode_request_topic
        # Mode-request topics sessions sent a joint target on; STOP cancels on each, not only the default.
        self._joint_target_topics_source = joint_target_topics
        # The manager keeps its shaper apart from its behaviour, so a Snake outlives the cancel unless reset too.
        self._shaping_topics_source = shaping_topics
        self._state_path = state_path
        # Told the zeroed target once both assertions publish, so session state can follow.
        self._on_asserted = on_asserted
        self._lock = threading.Lock()
        self._stopped = False
        self._asserted = False
        self._simulated = False
        self._engaged_at = ""
        self._detail = "Runtime stop is not engaged."
        self._restore_latch()

    @property
    def state(self) -> RuntimeStopState:
        with self._lock:
            return self._state_unlocked()

    def rejection_reason(self) -> str | None:
        """Why a robot command must be refused right now, or None."""
        with self._lock:
            if not self._stopped:
                return None
            return self._rejection_reason_unlocked()

    def execute_if_running(self, operation: Callable[[], T]) -> T:
        """Serialize the final robot operation with STOP assertion.

        A command already inside this gate completes before STOP publishes its
        zero/cancel pair. Once STOP owns the gate, later commands are rejected.
        """
        with self._lock:
            if self._stopped:
                raise RuntimeStoppedError(self._rejection_reason_unlocked())
            return operation()

    def execute_blocking_if_running(self, operation: Callable[[], T]) -> T:
        """Refuse a slow operation while STOP is latched, but run it outside the gate.

        A ROS service call can block for seconds. Inside the gate, STOP would
        wait for it. A service call is not a motion command, so finishing just
        after STOP engages is safe; STOP being delayed by it is not.
        """
        with self._lock:
            if self._stopped:
                raise RuntimeStoppedError(self._rejection_reason_unlocked())
        return operation()

    def engage(self) -> RuntimeStopState:
        """Latch first, unconditionally; a repeated engage re-asserts."""
        with self._lock:
            self._stopped = True
            self._asserted = False
            self._engaged_at = datetime.now(timezone.utc).isoformat()

            # Straight through the gateways: not blockable by policy or rate
            # limit. Keeping the gate held makes this the last robot operation.
            # Read once: a refresh between the zeros and the session bookkeeping would mark an unzeroed topic zeroed.
            targets = self._teleop_targets()
            zero_ok, zero_detail, zero_simulated = self._publish_zero_twists(targets)
            cancelled, cancel_ok, cancel_detail, cancel_simulated = self._publish_joint_target_cancels()
            reset, reset_ok, reset_detail, reset_simulated = self._publish_shaping_resets()
            servo_ok, servo_detail, servo_simulated = self._publish_visual_servoing_off()
            self._asserted = zero_ok and cancel_ok and reset_ok and servo_ok
            self._simulated = zero_simulated or cancel_simulated or reset_simulated or servo_simulated
            prefix = "Runtime stop engaged." if self._asserted else "Runtime stop latched, but ROS assertion failed."
            detail = f"{prefix} {zero_detail} {cancel_detail} {reset_detail} {servo_detail}"
            self._detail = detail
            save_error = self._save_latch()
            state = self._state_unlocked()

        self._record("accepted" if state.asserted else "rejected", detail + save_error)
        # Session state forgets only what was actually told: a failed cancel is still owed when its sender leaves.
        if self._on_asserted is not None:
            for target in targets:
                self._on_asserted(target, cancelled_topics=cancelled, reset_shaping_topics=reset, servo_off=servo_ok)
        if not state.asserted:
            raise RuntimeStopAssertionError(state)
        return state

    def _teleop_targets(self) -> tuple[str, ...]:
        source = self._teleop_targets_source
        extra = source() if callable(source) else (source or ())
        # A wildcard or namespace entry is a permission, not a topic that can carry a zero.
        return tuple(
            target for target in dict.fromkeys([self._teleop_target, *extra]) if ros_name_error(target) is None
        )

    def resume(self, engaged_at: str | None = None) -> RuntimeStopState:
        """Clear the latch; publishes nothing. With `engaged_at`, only the STOP it names."""
        with self._lock:
            if engaged_at is not None and self._stopped and engaged_at != self._engaged_at:
                raise RuntimeStopLatchMismatchError(
                    "A newer STOP was engaged after this resume was requested. Review it and hold resume again."
                )
            self._stopped = False
            self._asserted = False
            self._simulated = False
            self._engaged_at = ""
            self._detail = "Runtime stop is not engaged."
            save_error = self._save_latch()
            state = self._state_unlocked()

        self._record("accepted", "Runtime stop resumed by operator hold." + save_error)
        return state

    def _publish_zero_twists(self, targets: tuple[str, ...]) -> tuple[bool, str, bool]:
        """Every accepted target, because the latch cannot know which one a session was driving."""
        published: list[str] = []
        failures: list[str] = []
        simulated = False
        for target in targets:
            command = TeleopCommand(
                angular=TeleopVector3(),
                linear=TeleopVector3(),
                mode=0,
                seq=0,
                target=target,
            )
            try:
                receipt = self._teleop_gateway.publish(command)
            # Any gateway error, not only RuntimeError: rclpy raises its own, and the cancel below must still run.
            except Exception as exc:  # noqa: BLE001
                failures.append(f"{target} ({exc})")
                continue
            simulated = simulated or receipt.status == "simulated"
            published.append(f"{receipt.status} on {receipt.target}")
        if failures:
            return False, f"Zero velocity could not be published: {', '.join(failures)}.", simulated
        return True, f"Zero velocity {'; '.join(published)}.", simulated

    def cancel_joint_target(self, mode_request_topic: str | None = None) -> str:
        """The STOP's own cancel, alone: for a session that leaves a joint target running. Raises on failure."""
        return self.publish_mode_reset(mode_request_topic or self._mode_request_topic, CANCEL_MODE_REQUEST)

    def publish_mode_reset(self, mode_request_topic: str, mode: str) -> str:
        """A mode request that undoes what a departed session left set. Raises on failure."""
        ok, detail, _simulated = self._publish_mode_request(mode_request_topic, mode)
        if not ok:
            raise RuntimeError(detail)
        return detail

    def turn_off_visual_servoing(self) -> str:
        """The STOP's servo-off, alone: for a session that leaves servoing on. Raises on failure."""
        ok, detail, _simulated = self._publish_visual_servoing_off()
        if not ok:
            raise RuntimeError(detail)
        return detail

    def _publish_joint_target_cancels(self) -> tuple[tuple[str, ...], bool, str, bool]:
        tracked = self._joint_target_topics_source() if self._joint_target_topics_source is not None else ()
        cancelled: list[str] = []
        details: list[str] = []
        simulated = False
        for topic in dict.fromkeys([self._mode_request_topic, *tracked]):
            ok, detail, topic_simulated = self._publish_mode_request(topic, CANCEL_MODE_REQUEST, "Joint-target cancel")
            if ok:
                cancelled.append(topic)
            simulated = simulated or topic_simulated
            details.append(detail)
        return tuple(cancelled), len(cancelled) == len(details), " ".join(details), simulated

    def _publish_shaping_resets(self) -> tuple[tuple[str, ...], bool, str, bool]:
        tracked = self._shaping_topics_source() if self._shaping_topics_source is not None else ()
        reset: list[str] = []
        details: list[str] = []
        simulated = False
        for topic in dict.fromkeys([self._mode_request_topic, *tracked]):
            ok, detail, topic_simulated = self._publish_mode_request(topic, DEFAULT_GEOMETRIC_MODE, "Shaping reset")
            if ok:
                reset.append(topic)
            simulated = simulated or topic_simulated
            details.append(detail)
        return tuple(reset), len(reset) == len(details), " ".join(details), simulated

    def _restore_latch(self) -> None:
        """A restart keeps a latched STOP latched; a file that cannot be read starts latched too."""
        if self._state_path is None or not self._state_path.exists():
            return
        try:
            saved: Any = json.loads(self._state_path.read_text(encoding="utf-8"))
            stopped = saved["stopped"]
            if not isinstance(stopped, bool):
                raise ValueError("stopped is not a boolean")
        except (OSError, ValueError, KeyError, TypeError) as exc:
            self._stopped = True
            self._engaged_at = datetime.now(timezone.utc).isoformat()
            self._detail = f"Runtime stop state could not be read ({exc}); starting latched."
            return
        if stopped:
            self._stopped = True
            self._engaged_at = str(saved.get("engaged_at") or datetime.now(timezone.utc).isoformat())
            self._detail = f"Runtime stop restored after a backend restart. {saved.get('reason', '')}".strip()

    def _save_latch(self) -> str:
        """Called with the lock held. Returns why the latch could not be saved, or an empty string."""
        if self._state_path is None:
            return ""
        saved = {"stopped": self._stopped, "engaged_at": self._engaged_at, "reason": self._detail}
        temporary = self._state_path.with_name(f".{self._state_path.name}.tmp")
        try:
            self._state_path.parent.mkdir(parents=True, exist_ok=True)
            temporary.write_text(json.dumps(saved), encoding="utf-8")
            os.replace(temporary, self._state_path)
        except OSError as exc:
            return f" Latch state could not be saved: {exc}."
        return ""

    def _publish_mode_request(self, topic: str, mode: str, label: str = "Mode request") -> tuple[bool, str, bool]:
        request = RosPublishRequest(topic=topic, message_type="std_msgs/msg/String", payload={"data": mode})
        try:
            receipt = self._ros_publisher_gateway.publish(request)
        except Exception as exc:  # noqa: BLE001
            return False, f"{label} could not be published: {exc}", False
        return True, f"{label} ({mode}) {receipt.status} on {receipt.topic}.", receipt.status == "simulated"

    def _publish_visual_servoing_off(self) -> tuple[bool, str, bool]:
        """The servoing node keeps commanding while its switch is on; STOP turns the switch off."""
        request = RosPublishRequest(
            topic=VISUAL_SERVOING_ON_TOPIC,
            message_type="std_msgs/msg/Bool",
            payload={"data": False},
        )
        try:
            receipt = self._ros_publisher_gateway.publish(request)
        except Exception as exc:  # noqa: BLE001
            return False, f"Visual servoing off could not be published: {exc}", False
        return True, f"Visual servoing off {receipt.status} on {receipt.topic}.", receipt.status == "simulated"

    def _rejection_reason_unlocked(self) -> str:
        return "Runtime stop is engaged. Hold the stop control to resume before commanding the robot."

    def _state_unlocked(self) -> RuntimeStopState:
        return RuntimeStopState(
            stopped=self._stopped,
            asserted=self._asserted,
            engaged_at=self._engaged_at,
            detail=self._detail,
            simulated=self._simulated,
        )

    def _record(self, status: RuntimeAuditStatus, detail: str) -> None:
        if self._audit_log is None:
            return
        self._audit_log.record(
            RuntimeAuditRecord(
                channel="runtime_stop",
                detail=detail,
                status=status,
                target=self._teleop_target,
                topic=self._mode_request_topic,
            )
        )


__all__ = [
    "CANCEL_MODE_REQUEST",
    "RuntimeStopAssertionError",
    "RuntimeStopController",
    "RuntimeStopLatchMismatchError",
    "RuntimeStopState",
    "RuntimeStoppedError",
]
