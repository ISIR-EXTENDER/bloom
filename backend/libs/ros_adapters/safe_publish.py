from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from libs.ros_adapters.mode_request import MODE_REQUEST_TOPIC, ModeRequestError, parse_mode_request
from libs.ros_adapters.publishers import RosPublishReceipt, RosPublishRequest, RosPublisherGateway
from libs.ros_adapters.safety import RuntimeCommandPolicy, RuntimeCommandPolicyError, RuntimePayloadShapeError
from libs.sessions.audit import RuntimeAuditLog, RuntimeAuditRecord, summarize_payload
from libs.sessions.rate_limit import RuntimeCommandRateLimiter, RuntimeRateLimitError


@dataclass(frozen=True)
class SafeRosPublishError(Exception):
    detail: str
    status_code: int


def publish_with_runtime_policy(
    gateway: RosPublisherGateway,
    policy: RuntimeCommandPolicy,
    audit_log: RuntimeAuditLog,
    publish_request: RosPublishRequest,
    rate_limiter: RuntimeCommandRateLimiter | None = None,
    mode_request_topics: tuple[str, ...] = (MODE_REQUEST_TOPIC,),
) -> RosPublishReceipt:
    try:
        publish_request = normalize_mode_request_payload(publish_request, mode_request_topics)
    except ModeRequestError as exc:
        record_publish_audit(audit_log, publish_request, str(exc), "rejected")
        raise SafeRosPublishError(detail=str(exc), status_code=422) from exc

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

    if rate_limiter is not None:
        try:
            rate_limiter.ensure_allowed(f"http_ros_publish:{publish_request.topic}")
        except RuntimeRateLimitError as exc:
            record_publish_audit(audit_log, publish_request, str(exc), "rejected")
            raise SafeRosPublishError(detail=str(exc), status_code=429) from exc

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


def normalize_mode_request_payload(
    publish_request: RosPublishRequest,
    mode_request_topics: tuple[str, ...],
) -> RosPublishRequest:
    """Validate a cartesian_manager mode and publish it in canonical form.

    The manager drops a mode string it cannot parse without any feedback, so a
    typo would surface as a robot that quietly ignores the operator. Validating
    here turns it into a 422 the UI can show.

    The manager also normalizes internally, but publishing the raw string would
    put mixed-case values on ``/mode_request`` for anyone echoing the topic, and
    would differ from what ``tablet_interface`` publishes for the same intent.
    The normalized form is published instead.
    """
    if publish_request.topic not in mode_request_topics:
        return publish_request

    payload = publish_request.payload
    raw = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(raw, str):
        raise ModeRequestError("mode request payload must carry a string 'data' field")

    request = parse_mode_request(raw)
    if request.normalized == raw:
        return publish_request

    return RosPublishRequest(
        topic=publish_request.topic,
        message_type=publish_request.message_type,
        payload={**payload, "data": request.normalized},
    )


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
