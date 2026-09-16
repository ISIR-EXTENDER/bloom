from __future__ import annotations

from libs.ros_adapters.safety import RuntimeCommandPolicy, RuntimeCommandPolicyError
from libs.sessions.audit import RuntimeAuditLog, RuntimeAuditRecord, RuntimeAuditStatus
from libs.sessions.models import RuntimeServerMessage, RuntimeTeleopCommandMessage
from libs.sessions.rate_limit import RuntimeCommandRateLimiter, RuntimeRateLimitError
from libs.sessions.stop import RuntimeStopController, RuntimeStoppedError
from libs.sessions.teleop import NoopTeleopCommandGateway, TeleopCommand, TeleopCommandGateway, TeleopVector3


def build_teleop_ack(
    session_id: str,
    message: RuntimeTeleopCommandMessage,
    teleop_gateway: TeleopCommandGateway | None = None,
    audit_log: RuntimeAuditLog | None = None,
    command_policy: RuntimeCommandPolicy | None = None,
    rate_limiter: RuntimeCommandRateLimiter | None = None,
    stop_controller: RuntimeStopController | None = None,
    allowed_frame_ids: tuple[str, ...] | None = None,
) -> RuntimeServerMessage:
    # The stop latch outranks everything, including release zeros.
    stop_reason = stop_controller.rejection_reason() if stop_controller is not None else None
    if stop_reason is not None:
        return build_runtime_stopped_ack(session_id, message.target, stop_reason, audit_log)

    # cartesian_manager skips a command in a frame it does not know, silently;
    # Bloom refuses it loudly instead.
    if message.frame_id and allowed_frame_ids is not None and message.frame_id not in allowed_frame_ids:
        detail = (
            f"Frame '{message.frame_id}' is not a command frame the manager knows"
            f" ({', '.join(allowed_frame_ids) or 'none configured'})."
        )
        record_teleop_audit(
            audit_log,
            detail=detail,
            session_id=session_id,
            status="rejected",
            target=message.target,
        )
        return RuntimeServerMessage(
            type="runtime_error",
            detail="Teleop command was rejected: unknown command frame.",
            payload={"code": "unknown_frame", "message": detail, "target": message.target},
            session_id=session_id,
        )

    gateway = teleop_gateway or NoopTeleopCommandGateway()
    policy = command_policy or RuntimeCommandPolicy(
        allowed_message_types=("*",),
        allowed_publish_topics=("*",),
        allowed_teleop_targets=("/joystick_cartesian_command", "/teleop_cmd"),
    )

    try:
        policy.ensure_teleop_allowed(message.target)
    except RuntimeCommandPolicyError as exc:
        record_teleop_audit(
            audit_log,
            detail=str(exc),
            session_id=session_id,
            status="rejected",
            target=message.target,
        )
        return RuntimeServerMessage(
            type="runtime_error",
            detail="Teleop command was rejected by runtime policy.",
            payload={"message": str(exc), "target": message.target},
            session_id=session_id,
        )

    if rate_limiter is not None and not is_zero_teleop_message(message):
        try:
            rate_limiter.ensure_allowed(f"websocket_teleop:{message.target}")
        except RuntimeRateLimitError as exc:
            record_teleop_audit(
                audit_log,
                detail=str(exc),
                session_id=session_id,
                status="rejected",
                target=message.target,
            )
            return RuntimeServerMessage(
                type="runtime_error",
                detail="Teleop command was rejected by runtime rate limit.",
                payload={"message": str(exc), "target": message.target},
                session_id=session_id,
            )

    command = to_teleop_command(message)
    try:
        if stop_controller is None:
            receipt = gateway.publish(command)
        else:
            receipt = stop_controller.execute_if_running(lambda: gateway.publish(command))
    except RuntimeStoppedError as exc:
        return build_runtime_stopped_ack(session_id, message.target, str(exc), audit_log)
    except RuntimeError as exc:
        record_teleop_audit(
            audit_log,
            detail=str(exc),
            session_id=session_id,
            status="rejected",
            target=message.target,
        )
        return RuntimeServerMessage(
            type="runtime_error",
            detail="Teleop command could not be published.",
            payload={"message": str(exc), "target": message.target},
            session_id=session_id,
        )

    record_teleop_audit(
        audit_log,
        detail=receipt.detail,
        session_id=session_id,
        status="accepted",
        target=receipt.target,
    )
    return RuntimeServerMessage(
        type="teleop_ack",
        detail=receipt.detail,
        payload={
            "angular": message.angular.model_dump(),
            "linear": message.linear.model_dump(),
            "mode": message.mode,
            "seq": message.seq,
            "status": receipt.status,
            "target": receipt.target,
        },
        session_id=session_id,
    )


def build_runtime_stopped_ack(
    session_id: str,
    target: str,
    detail: str,
    audit_log: RuntimeAuditLog | None,
) -> RuntimeServerMessage:
    record_teleop_audit(
        audit_log,
        detail=detail,
        session_id=session_id,
        status="rejected",
        target=target,
    )
    return RuntimeServerMessage(
        type="runtime_error",
        detail="Teleop command was rejected: runtime stop is engaged.",
        payload={"code": "runtime_stopped", "message": detail, "target": target},
        session_id=session_id,
    )


def to_teleop_command(message: RuntimeTeleopCommandMessage) -> TeleopCommand:
    return TeleopCommand(
        angular=TeleopVector3(**message.angular.model_dump()),
        frame_id=message.frame_id,
        linear=TeleopVector3(**message.linear.model_dump()),
        mode=message.mode,
        seq=message.seq,
        target=message.target,
    )


def is_zero_teleop_message(message: RuntimeTeleopCommandMessage) -> bool:
    return all(
        component == 0
        for component in (
            message.angular.x,
            message.angular.y,
            message.angular.z,
            message.linear.x,
            message.linear.y,
            message.linear.z,
        )
    )


def record_teleop_audit(
    audit_log: RuntimeAuditLog | None,
    *,
    detail: str,
    session_id: str,
    status: RuntimeAuditStatus,
    target: str,
) -> None:
    if audit_log is None:
        return

    audit_log.record(
        RuntimeAuditRecord(
            channel="websocket_teleop",
            detail=detail,
            session_id=session_id,
            status=status,
            target=target,
        )
    )
