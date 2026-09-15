"""The runtime STOP latch: outranks every command path while engaged.

Engaging publishes a zero twist plus a ``behaviour/passthrough`` mode request,
the manager's own joint-target cancel. Not an IEC emergency stop.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import datetime, timezone

from libs.ros_adapters.publishers import RosPublishRequest, RosPublisherGateway
from libs.sessions.audit import RuntimeAuditLog, RuntimeAuditRecord, RuntimeAuditStatus
from libs.sessions.teleop import TeleopCommand, TeleopCommandGateway, TeleopVector3

CANCEL_MODE_REQUEST = "behaviour/passthrough"
DEFAULT_MODE_REQUEST_TOPIC = "/mode_request"
DEFAULT_TELEOP_TARGET = "/joystick_cartesian_command"


@dataclass(frozen=True)
class RuntimeStopState:
    stopped: bool
    engaged_at: str
    detail: str


class RuntimeStopController:
    """Latches the runtime stopped and asserts it toward the robot."""

    def __init__(
        self,
        teleop_gateway: TeleopCommandGateway,
        ros_publisher_gateway: RosPublisherGateway,
        audit_log: RuntimeAuditLog | None = None,
        teleop_target: str = DEFAULT_TELEOP_TARGET,
        mode_request_topic: str = DEFAULT_MODE_REQUEST_TOPIC,
    ) -> None:
        self._teleop_gateway = teleop_gateway
        self._ros_publisher_gateway = ros_publisher_gateway
        self._audit_log = audit_log
        self._teleop_target = teleop_target
        self._mode_request_topic = mode_request_topic
        self._lock = threading.Lock()
        self._stopped = False
        self._engaged_at = ""
        self._detail = "Runtime stop is not engaged."

    @property
    def state(self) -> RuntimeStopState:
        with self._lock:
            return RuntimeStopState(stopped=self._stopped, engaged_at=self._engaged_at, detail=self._detail)

    def rejection_reason(self) -> str | None:
        """Why a robot command must be refused right now, or None."""
        with self._lock:
            if not self._stopped:
                return None
            return "Runtime stop is engaged. Hold the stop control to resume before commanding the robot."

    def engage(self) -> RuntimeStopState:
        """Latch first, unconditionally; a repeated engage re-asserts."""
        with self._lock:
            self._stopped = True
            self._engaged_at = datetime.now(timezone.utc).isoformat()

        # Straight through the gateways: not blockable by policy or rate limit.
        zero_detail = self._publish_zero_twist()
        cancel_detail = self._publish_joint_target_cancel()
        detail = f"Runtime stop engaged. {zero_detail} {cancel_detail}"

        with self._lock:
            self._detail = detail
            state = RuntimeStopState(stopped=self._stopped, engaged_at=self._engaged_at, detail=self._detail)

        self._record("accepted", detail)
        return state

    def resume(self) -> RuntimeStopState:
        """Clear the latch; publishes nothing."""
        with self._lock:
            self._stopped = False
            self._engaged_at = ""
            self._detail = "Runtime stop is not engaged."
            state = RuntimeStopState(stopped=self._stopped, engaged_at=self._engaged_at, detail=self._detail)

        self._record("accepted", "Runtime stop resumed by operator hold.")
        return state

    def _publish_zero_twist(self) -> str:
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
            return f"Zero velocity could not be published: {exc}"
        return f"Zero velocity {receipt.status} on {receipt.target}."

    def _publish_joint_target_cancel(self) -> str:
        request = RosPublishRequest(
            topic=self._mode_request_topic,
            message_type="std_msgs/msg/String",
            payload={"data": CANCEL_MODE_REQUEST},
        )
        try:
            receipt = self._ros_publisher_gateway.publish(request)
        except RuntimeError as exc:
            return f"Joint-target cancel could not be published: {exc}"
        return f"Joint-target cancel ({CANCEL_MODE_REQUEST}) {receipt.status} on {receipt.topic}."

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
    "RuntimeStopController",
    "RuntimeStopState",
]
