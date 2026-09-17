"""The runtime STOP latch: outranks every command path while engaged.

Engaging publishes a zero twist plus a ``behaviour/passthrough`` mode request,
the manager's own joint-target cancel. Not an IEC emergency stop.
"""

from __future__ import annotations

import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TypeVar

from libs.ros_adapters.publishers import RosPublisherGateway, RosPublishRequest
from libs.sessions.audit import RuntimeAuditLog, RuntimeAuditRecord, RuntimeAuditStatus
from libs.sessions.teleop import TeleopCommand, TeleopCommandGateway, TeleopVector3

CANCEL_MODE_REQUEST = "behaviour/passthrough"
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
    ) -> None:
        self._teleop_gateway = teleop_gateway
        self._ros_publisher_gateway = ros_publisher_gateway
        self._audit_log = audit_log
        self._teleop_target = teleop_target
        self._mode_request_topic = mode_request_topic
        # Told the zeroed target once both assertions publish, so session state can follow.
        self._on_asserted = on_asserted
        self._lock = threading.Lock()
        self._stopped = False
        self._asserted = False
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
            zero_ok, zero_detail = self._publish_zero_twist()
            cancel_ok, cancel_detail = self._publish_joint_target_cancel()
            self._asserted = zero_ok and cancel_ok
            prefix = "Runtime stop engaged." if self._asserted else "Runtime stop latched, but ROS assertion failed."
            detail = f"{prefix} {zero_detail} {cancel_detail}"
            self._detail = detail
            state = self._state_unlocked()

        self._record("accepted" if state.asserted else "rejected", detail)
        if not state.asserted:
            raise RuntimeStopAssertionError(state)
        if self._on_asserted is not None:
            self._on_asserted(self._teleop_target)
        return state

    def resume(self) -> RuntimeStopState:
        """Clear the latch; publishes nothing."""
        with self._lock:
            self._stopped = False
            self._asserted = False
            self._engaged_at = ""
            self._detail = "Runtime stop is not engaged."
            state = self._state_unlocked()

        self._record("accepted", "Runtime stop resumed by operator hold.")
        return state

    def _publish_zero_twist(self) -> tuple[bool, str]:
        command = TeleopCommand(
            angular=TeleopVector3(),
            linear=TeleopVector3(),
            mode=0,
            seq=0,
            target=self._teleop_target,
        )
        try:
            receipt = self._teleop_gateway.publish(command)
        except RuntimeError as exc:
            return False, f"Zero velocity could not be published: {exc}"
        return True, f"Zero velocity {receipt.status} on {receipt.target}."

    def _publish_joint_target_cancel(self) -> tuple[bool, str]:
        request = RosPublishRequest(
            topic=self._mode_request_topic,
            message_type="std_msgs/msg/String",
            payload={"data": CANCEL_MODE_REQUEST},
        )
        try:
            receipt = self._ros_publisher_gateway.publish(request)
        except RuntimeError as exc:
            return False, f"Joint-target cancel could not be published: {exc}"
        return True, f"Joint-target cancel ({CANCEL_MODE_REQUEST}) {receipt.status} on {receipt.topic}."

    def _rejection_reason_unlocked(self) -> str:
        return "Runtime stop is engaged. Hold the stop control to resume before commanding the robot."

    def _state_unlocked(self) -> RuntimeStopState:
        return RuntimeStopState(
            stopped=self._stopped,
            asserted=self._asserted,
            engaged_at=self._engaged_at,
            detail=self._detail,
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
