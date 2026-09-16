from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator, model_validator

from apps.bloom_api.security import (
    BloomPrincipal,
    execute_as_runtime_owner,
    require_operator,
    require_runtime_owner,
)
from libs.ros_adapters import (
    RosPublishReceipt,
    RosPublishRequest,
    RosPublisherGateway,
    RosServiceGateway,
    RosServiceRequest,
    RosTopicCatalogGateway,
    RosTopicInfo,
    RosTopicStatus,
    SafeRosPublishError,
    publish_with_runtime_policy,
)
from libs.ros_adapters.payloads import parse_ros_payload_text
from libs.ros_adapters.safety import RuntimeCommandPolicy, RuntimeCommandPolicyError
from libs.sessions import (
    RuntimeAuditLog,
    RuntimeAuditRecord,
    RuntimeCommandRateLimiter,
    RuntimeRateLimitError,
    RuntimeStoppedError,
)

router = APIRouter(prefix="/ros", tags=["ros"])


class RosTopicPublishRequest(BaseModel):
    topic: str = Field(min_length=1)
    message_type: str = Field(min_length=1)
    payload: dict[str, Any] | None = None
    payload_text: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def _validate_single_payload_source(self) -> "RosTopicPublishRequest":
        if self.payload is not None and self.payload_text is not None:
            raise ValueError("Use either payload or payload_text, not both")
        return self

    def to_payload(self) -> dict[str, Any]:
        if self.payload is not None:
            return self.payload
        if self.payload_text is not None:
            return _parse_payload_text(self.payload_text)
        return {}

    @field_validator("topic")
    @classmethod
    def _validate_topic(cls, topic: str) -> str:
        normalized_topic = topic.strip()
        if not normalized_topic.startswith("/"):
            raise ValueError("ROS topic must start with '/'")
        if any(character.isspace() for character in normalized_topic):
            raise ValueError("ROS topic must not contain whitespace")
        return normalized_topic

    @field_validator("message_type")
    @classmethod
    def _validate_message_type(cls, message_type: str) -> str:
        normalized_message_type = message_type.strip()
        if "/" not in normalized_message_type:
            raise ValueError("ROS message type must use package/msg/Type notation")
        if any(character.isspace() for character in normalized_message_type):
            raise ValueError("ROS message type must not contain whitespace")
        return normalized_message_type


class RosServiceCallRequest(BaseModel):
    service: str = Field(min_length=1)
    service_type: str = Field(min_length=1)

    @field_validator("service")
    @classmethod
    def _validate_service(cls, service: str) -> str:
        normalized = service.strip()
        if not normalized.startswith("/"):
            raise ValueError("ROS service must start with '/'")
        if any(character.isspace() for character in normalized):
            raise ValueError("ROS service must not contain whitespace")
        return normalized

    @field_validator("service_type")
    @classmethod
    def _validate_service_type(cls, service_type: str) -> str:
        normalized = service_type.strip()
        if "/srv/" not in normalized:
            raise ValueError("ROS service type must use package/srv/Type notation")
        if any(character.isspace() for character in normalized):
            raise ValueError("ROS service type must not contain whitespace")
        return normalized


class RosServiceCallResponse(BaseModel):
    service: str
    service_type: str
    status: str
    success: bool | None
    detail: str


class RosTopicPublishResponse(BaseModel):
    topic: str
    message_type: str
    status: str
    detail: str


class RosTopicInfoResponse(BaseModel):
    name: str
    message_type: str


class RosTopicListResponse(BaseModel):
    topics: tuple[RosTopicInfoResponse, ...]


class RosTopicStatusResponse(BaseModel):
    name: str
    message_type: str
    publisher_count: int
    subscription_count: int


class RosTopicStatusListResponse(BaseModel):
    topics: tuple[RosTopicStatusResponse, ...]


def get_ros_publisher_gateway(request: Request) -> RosPublisherGateway:
    return request.app.state.ros_publisher_gateway


def get_ros_topic_catalog_gateway(request: Request) -> RosTopicCatalogGateway:
    return request.app.state.ros_topic_catalog_gateway


def get_runtime_audit_log(request: Request) -> RuntimeAuditLog:
    return request.app.state.runtime_audit_log


def get_runtime_command_policy(request: Request) -> RuntimeCommandPolicy:
    return request.app.state.runtime_command_policy


def get_runtime_command_rate_limiter(request: Request) -> RuntimeCommandRateLimiter:
    return request.app.state.runtime_command_rate_limiter


@router.get("/topics", response_model=RosTopicListResponse)
def list_ros_topics(
    request: Request,
    _principal: BloomPrincipal = Depends(require_operator),
) -> RosTopicListResponse:
    gateway = get_ros_topic_catalog_gateway(request)
    topics = tuple(_to_topic_response(topic) for topic in gateway.list_topics())
    return RosTopicListResponse(topics=topics)


@router.get("/topics/status", response_model=RosTopicStatusListResponse)
def list_ros_topic_status(
    request: Request,
    _principal: BloomPrincipal = Depends(require_operator),
) -> RosTopicStatusListResponse:
    gateway = get_ros_topic_catalog_gateway(request)
    topics = tuple(_to_topic_status_response(topic) for topic in gateway.list_topic_status())
    return RosTopicStatusListResponse(topics=topics)


@router.post("/topics/publish", response_model=RosTopicPublishResponse)
def publish_ros_topic(
    request: Request,
    publish_request: RosTopicPublishRequest,
    _principal: BloomPrincipal = Depends(require_runtime_owner),
) -> RosTopicPublishResponse:
    audit_log = get_runtime_audit_log(request)
    # One robot, one latch: the generic publish path is refused too.
    stop_controller = request.app.state.runtime_stop_controller
    stop_reason = stop_controller.rejection_reason()
    if stop_reason is not None:
        audit_log.record(
            RuntimeAuditRecord(
                channel="http_ros_publish",
                detail=stop_reason,
                message_type=publish_request.message_type,
                status="rejected",
                topic=publish_request.topic,
            )
        )
        raise HTTPException(status_code=409, detail=stop_reason)

    gateway = get_ros_publisher_gateway(request)
    policy = get_runtime_command_policy(request)
    rate_limiter = get_runtime_command_rate_limiter(request)
    ros_publish_request = RosPublishRequest(
        topic=publish_request.topic,
        message_type=publish_request.message_type,
        payload=publish_request.to_payload(),
    )
    try:
        receipt = execute_as_runtime_owner(
            request,
            lambda: stop_controller.execute_if_running(
                lambda: publish_with_runtime_policy(
                    gateway,
                    policy,
                    audit_log,
                    ros_publish_request,
                    rate_limiter,
                )
            )
        )
    except RuntimeStoppedError as exc:
        audit_log.record(
            RuntimeAuditRecord(
                channel="http_ros_publish",
                detail=str(exc),
                message_type=publish_request.message_type,
                status="rejected",
                topic=publish_request.topic,
            )
        )
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except SafeRosPublishError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return _to_response(receipt)


def get_ros_service_gateway(request: Request) -> RosServiceGateway:
    return request.app.state.ros_service_gateway


@router.post("/services/call", response_model=RosServiceCallResponse)
def call_ros_service(
    request: Request,
    call_request: RosServiceCallRequest,
    _principal: BloomPrincipal = Depends(require_runtime_owner),
) -> RosServiceCallResponse:
    audit_log = get_runtime_audit_log(request)

    def record(status: str, detail: str) -> None:
        audit_log.record(
            RuntimeAuditRecord(
                channel="http_ros_service",
                detail=detail,
                message_type=call_request.service_type,
                status="accepted" if status == "accepted" else "rejected",
                target=call_request.service,
            )
        )

    stop_controller = request.app.state.runtime_stop_controller
    stop_reason = stop_controller.rejection_reason()
    if stop_reason is not None:
        record("rejected", stop_reason)
        raise HTTPException(status_code=409, detail=stop_reason)

    try:
        get_runtime_command_policy(request).ensure_service_allowed(call_request.service, call_request.service_type)
    except RuntimeCommandPolicyError as exc:
        record("rejected", str(exc))
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    try:
        get_runtime_command_rate_limiter(request).ensure_allowed(f"http_ros_service:{call_request.service}")
    except RuntimeRateLimitError as exc:
        record("rejected", str(exc))
        raise HTTPException(status_code=429, detail=str(exc)) from exc

    try:
        receipt = execute_as_runtime_owner(
            request,
            lambda: stop_controller.execute_if_running(
                lambda: get_ros_service_gateway(request).call(
                    RosServiceRequest(service=call_request.service, service_type=call_request.service_type)
                )
            )
        )
    except RuntimeStoppedError as exc:
        record("rejected", str(exc))
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        record("rejected", str(exc))
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        record("rejected", str(exc))
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    record("accepted", receipt.detail)
    return RosServiceCallResponse(
        service=receipt.service,
        service_type=receipt.service_type,
        status=receipt.status,
        success=receipt.success,
        detail=receipt.detail,
    )


def _to_topic_response(topic: RosTopicInfo) -> RosTopicInfoResponse:
    return RosTopicInfoResponse(name=topic.name, message_type=topic.message_type)


def _to_topic_status_response(topic: RosTopicStatus) -> RosTopicStatusResponse:
    return RosTopicStatusResponse(
        name=topic.name,
        message_type=topic.message_type,
        publisher_count=topic.publisher_count,
        subscription_count=topic.subscription_count,
    )


def _to_response(receipt: RosPublishReceipt) -> RosTopicPublishResponse:
    return RosTopicPublishResponse(
        topic=receipt.topic,
        message_type=receipt.message_type,
        status=receipt.status,
        detail=receipt.detail,
    )


def _parse_payload_text(payload_text: str) -> dict[str, Any]:
    try:
        return parse_ros_payload_text(payload_text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
