"""The runtime STOP latch: outranks every command path while engaged.

Engaging publishes a zero twist plus a ``behaviour/passthrough`` mode request,
the manager's own joint-target cancel. Not an IEC emergency stop.
"""

from __future__ import annotations

import threading
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TypeVar

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
        on_asserted: Callable[[str], None] | None = None,
        teleop_targets: Sequence[str] | Callable[[], Sequence[str]] | None = None,
    ) -> None:
        self._teleop_gateway = teleop_gateway
        self._ros_publisher_gateway = ros_publisher_gateway
        self._audit_log = audit_log
        self._teleop_target = teleop_target
        # Every target the deployment accepts is zeroed: a session may have been driving any of them.
        # A callable is read at each STOP, since the manager's inputs can change while Bloom runs.
        self._teleop_targets_source = teleop_targets
        self._mode_request_topic = mode_request_topic
        # Told the zeroed target once both assertions publish, so session state can follow.
        self._on_asserted = on_asserted
        self._lock = threading.Lock()
        self._stopped = False
        self._asserted = False
        self._simulated = False
        self._engaged_at = ""
        self._detail = "Runtime stop is not engaged."

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
            cancel_ok, cancel_detail, cancel_simulated = self._publish_joint_target_cancel()
            servo_ok, servo_detail, servo_simulated = self._publish_visual_servoing_off()
            self._asserted = zero_ok and cancel_ok and servo_ok
            self._simulated = zero_simulated or cancel_simulated or servo_simulated
            prefix = "Runtime stop engaged." if self._asserted else "Runtime stop latched, but ROS assertion failed."
            detail = f"{prefix} {zero_detail} {cancel_detail} {servo_detail}"
            self._detail = detail
            state = self._state_unlocked()

        self._record("accepted" if state.asserted else "rejected", detail)
        # The session state follows the zeros whether or not both assertions published: those targets were told.
        if self._on_asserted is not None:
            for target in targets:
                self._on_asserted(target)
        if not state.asserted:
            raise RuntimeStopAssertionError(state)
        return state

    def _teleop_targets(self) -> tuple[str, ...]:
        source = self._teleop_targets_source
        extra = source() if callable(source) else (source or ())
        # A wildcard or namespace entry is a permission, not a topic that can carry a zero.
        return tuple(
            target
            for target in dict.fromkeys([self._teleop_target, *extra])
            if target.startswith("/") and not target.endswith("/") and "*" not in target
        )

    def resume(self) -> RuntimeStopState:
        """Clear the latch; publishes nothing."""
        with self._lock:
            self._stopped = False
            self._asserted = False
            self._simulated = False
            self._engaged_at = ""
            self._detail = "Runtime stop is not engaged."
            state = self._state_unlocked()

        self._record("accepted", "Runtime stop resumed by operator hold.")
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

    def _publish_joint_target_cancel(self) -> tuple[bool, str, bool]:
        request = RosPublishRequest(
            topic=self._mode_request_topic,
            message_type="std_msgs/msg/String",
            payload={"data": CANCEL_MODE_REQUEST},
        )
        try:
            receipt = self._ros_publisher_gateway.publish(request)
        except Exception as exc:  # noqa: BLE001
            return False, f"Joint-target cancel could not be published: {exc}", False
        return (
            True,
            f"Joint-target cancel ({CANCEL_MODE_REQUEST}) {receipt.status} on {receipt.topic}.",
            receipt.status == "simulated",
        )

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
    "RuntimeStopState",
    "RuntimeStoppedError",
]
