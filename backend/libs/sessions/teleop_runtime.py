from __future__ import annotations

from libs.ros_adapters.safety import RuntimeCommandPolicy, RuntimeCommandPolicyError
from libs.sessions.audit import RuntimeAuditLog, RuntimeAuditRecord, RuntimeAuditStatus
from libs.sessions.models import RuntimeServerMessage, RuntimeTeleopCommandMessage
from libs.sessions.teleop import NoopTeleopCommandGateway, TeleopCommand, TeleopCommandGateway, TeleopVector3


def build_teleop_ack(
    session_id: str,
    message: RuntimeTeleopCommandMessage,
    teleop_gateway: TeleopCommandGateway | None = None,
    audit_log: RuntimeAuditLog | None = None,
    command_policy: RuntimeCommandPolicy | None = None,
) -> RuntimeServerMessage:
    gateway = teleop_gateway or NoopTeleopCommandGateway()
    policy = command_policy or RuntimeCommandPolicy(
        allowed_message_types=("*",),
        allowed_publish_topics=("*",),
        allowed_teleop_targets=("/teleop_cmd",),
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

    try:
        receipt = gateway.publish(to_teleop_command(message))
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


def to_teleop_command(message: RuntimeTeleopCommandMessage) -> TeleopCommand:
    return TeleopCommand(
        angular=TeleopVector3(**message.angular.model_dump()),
        linear=TeleopVector3(**message.linear.model_dump()),
        mode=message.mode,
        seq=message.seq,
        target=message.target,
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
