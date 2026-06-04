from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from libs.ros_adapters.publishers import RosPublishReceipt, RosPublishRequest, RosPublisherGateway
from libs.ros_adapters.safety import RuntimeCommandPolicy, RuntimeCommandPolicyError, RuntimePayloadShapeError
from libs.sessions.audit import RuntimeAuditLog, RuntimeAuditRecord, summarize_payload


@dataclass(frozen=True)
class SafeRosPublishError(Exception):
    detail: str
    status_code: int


def publish_with_runtime_policy(
    gateway: RosPublisherGateway,
    policy: RuntimeCommandPolicy,
    audit_log: RuntimeAuditLog,
    publish_request: RosPublishRequest,
) -> RosPublishReceipt:
    try:
        policy.ensure_publish_allowed(
            publish_request.topic,
            publish_request.message_type,
            publish_request.payload,
        )
    except RuntimeCommandPolicyError as exc:
        record_publish_audit(audit_log, publish_request, str(exc), "rejected")
        raise SafeRosPublishError(detail=str(exc), status_code=403) from exc
    except RuntimePayloadShapeError as exc:
        record_publish_audit(audit_log, publish_request, str(exc), "rejected")
        raise SafeRosPublishError(detail=str(exc), status_code=422) from exc

    try:
        receipt = gateway.publish(publish_request)
    except ValueError as exc:
        record_publish_audit(audit_log, publish_request, str(exc), "rejected")
        raise SafeRosPublishError(detail=str(exc), status_code=422) from exc
    except RuntimeError as exc:
        record_publish_audit(audit_log, publish_request, str(exc), "rejected")
        raise SafeRosPublishError(detail=str(exc), status_code=503) from exc

    record_publish_audit(audit_log, publish_request, receipt.detail, "accepted")
    return receipt


def record_publish_audit(
    audit_log: RuntimeAuditLog,
    publish_request: RosPublishRequest,
    detail: str,
    status: Literal["accepted", "rejected"],
) -> None:
    audit_log.record(
        RuntimeAuditRecord(
            channel="http_ros_publish",
            detail=detail,
            message_type=publish_request.message_type,
            payload_summary=summarize_payload(publish_request.payload),
            status=status,
            topic=publish_request.topic,
        )
    )
