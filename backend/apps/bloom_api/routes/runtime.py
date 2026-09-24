import logging
from dataclasses import asdict
from hashlib import sha256
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, model_validator

from apps.bloom_api.routes.configuration_bundles import get_configuration_repository
from apps.bloom_api.routes.runtime_camera import router as camera_router
from apps.bloom_api.routes.runtime_common import (
    audited_rejection,
    get_ros_publisher_gateway,
    get_runtime_audit_log,
    get_runtime_command_policy,
    get_runtime_command_rate_limiter,
    get_runtime_control_snapshot,
    get_runtime_stop_controller,
    runtime_control_detail,
)
from apps.bloom_api.routes.runtime_positions import router as positions_router
from apps.bloom_api.routes.runtime_recordings import router as recordings_router
from apps.bloom_api.routes.runtime_socket import router as socket_router
from apps.bloom_api.security import (
    RUNTIME_SESSION_HEADER,
    BloomPrincipal,
    execute_as_runtime_owner,
    require_observer,
    require_operator,
    require_runtime_owner,
)
from libs.config import (
    ApplicationConfig,
    ConfigurationNotFoundError,
    RuntimeActionPreset,
    RuntimeAdapterPolicy,
)
from libs.ros_adapters import (
    RosPublishRequest,
    RosServiceGateway,
    RosServiceRequest,
    SafeRosPublishError,
    publish_with_runtime_policy,
)
from libs.ros_adapters.payloads import parse_ros_payload_text
from libs.ros_adapters.safety import (
    RuntimeCommandPolicy,
    RuntimeCommandPolicyError,
    RuntimePayloadShapeError,
    ensure_allowed,
)
from libs.sessions import (
    RuntimeAuditLog,
    RuntimeAuditRecord,
    RuntimeRateLimitError,
    RuntimeStopAssertionError,
    RuntimeStoppedError,
)
from libs.sessions.audit import summarize_payload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/runtime", tags=["runtime"])

router.include_router(camera_router)
router.include_router(positions_router)
router.include_router(recordings_router)
router.include_router(socket_router)


class RuntimeAuditRecordResponse(BaseModel):
    channel: str
    detail: str
    message_type: str
    payload_summary: dict = Field(default_factory=dict)
    recorded_at: str
    repeats: int = 1
    session_id: str
    status: str
    target: str
    topic: str


class RuntimeAuditListResponse(BaseModel):
    records: tuple[RuntimeAuditRecordResponse, ...]


class RuntimeActionDispatchRequest(BaseModel):
    app_id: str = Field(min_length=1)
    command: str = ""
    config_id: str = Field(min_length=1)
    preset_id: str = ""

    @model_validator(mode="after")
    def preset_or_command_is_required(self) -> "RuntimeActionDispatchRequest":
        if not self.preset_id and not self.command:
            raise ValueError("preset_id or command is required")
        return self


class RuntimeActionDispatchResponse(BaseModel):
    app_id: str
    command: str
    config_id: str
    detail: str
    message_type: str
    preset_id: str
    status: str
    topic: str


class RuntimeStopStateResponse(BaseModel):
    stopped: bool
    asserted: bool
    engaged_at: str
    detail: str
    simulated: bool = False


class RuntimeControlStateResponse(BaseModel):
    active_sessions: int
    detail: str
    is_owner: bool
    owner_present: bool
    session_id: str
    #: The controlling session's own state, for the read-only mirror.
    owner_frame_id: str = ""
    owner_mode_request: str = ""
    owner_moving: bool = False


@router.get("/control", response_model=RuntimeControlStateResponse)
def get_runtime_control_state(
    request: Request,
    _principal: BloomPrincipal = Depends(require_observer),
) -> RuntimeControlStateResponse:
    session_id = request.headers.get(RUNTIME_SESSION_HEADER, "").strip()
    snapshot = get_runtime_control_snapshot(request, request.app.state.runtime_session_manager, session_id)
    return RuntimeControlStateResponse(
        **asdict(snapshot),
        detail=runtime_control_detail(snapshot.is_owner, snapshot.owner_present),
    )


@router.get("/stop", response_model=RuntimeStopStateResponse)
def get_runtime_stop_state(
    request: Request,
    _principal: BloomPrincipal = Depends(require_observer),
) -> RuntimeStopStateResponse:
    return RuntimeStopStateResponse(**asdict(get_runtime_stop_controller(request).state))


@router.post("/stop", response_model=RuntimeStopStateResponse)
def engage_runtime_stop(
    request: Request,
    _principal: BloomPrincipal = Depends(require_operator),
) -> RuntimeStopStateResponse:
    """HTTP on purpose: STOP matters most when the WebSocket is what died."""
    try:
        state = get_runtime_stop_controller(request).engage()
    except RuntimeStopAssertionError as exc:
        # The latch is set; the body carries the whole state so a client can tell that from a refused STOP.
        raise HTTPException(status_code=503, detail=asdict(exc.state)) from exc
    return RuntimeStopStateResponse(**asdict(state))


@router.post("/stop/resume", response_model=RuntimeStopStateResponse)
def resume_runtime_stop(
    request: Request,
    _principal: BloomPrincipal = Depends(require_runtime_owner),
) -> RuntimeStopStateResponse:
    state = execute_as_runtime_owner(request, lambda: get_runtime_stop_controller(request).resume())
    return RuntimeStopStateResponse(**asdict(state))


# Each is a live ROS subscription; far more than any screen has widgets.


@router.get("/audit", response_model=RuntimeAuditListResponse)
def list_runtime_audit_records(
    request: Request,
    limit: int = 100,
    _principal: BloomPrincipal = Depends(require_observer),
) -> RuntimeAuditListResponse:
    audit_log = get_runtime_audit_log(request)
    return RuntimeAuditListResponse(
        records=tuple(
            RuntimeAuditRecordResponse(**(asdict(record) | {"session_id": audit_session_alias(record.session_id)}))
            for record in audit_log.list_records(limit)
        )
    )


def audit_session_alias(session_id: str) -> str:
    """A session id proves ownership, so readers get a stable alias instead."""
    return sha256(session_id.encode()).hexdigest()[:12] if session_id else ""


@router.post("/actions", response_model=RuntimeActionDispatchResponse)
def dispatch_runtime_action(
    request: Request,
    action_request: RuntimeActionDispatchRequest,
    _principal: BloomPrincipal = Depends(require_runtime_owner),
) -> RuntimeActionDispatchResponse:
    stop_controller = get_runtime_stop_controller(request)
    stop_reason = stop_controller.rejection_reason()
    if stop_reason is not None:
        raise audited_rejection(
            get_runtime_audit_log(request),
            409,
            channel="runtime_action",
            detail=stop_reason,
            payload_summary={
                "app_id": action_request.app_id,
                "config_id": action_request.config_id,
                "preset_id": action_request.preset_id,
            },
            target=action_request.command or action_request.preset_id,
        )

    repository = get_configuration_repository(request)
    try:
        configuration = repository.get(action_request.config_id)
    except ConfigurationNotFoundError as exc:
        raise HTTPException(status_code=404, detail="configuration not found") from exc

    application = next((app for app in configuration.applications if app.id == action_request.app_id), None)
    if application is None:
        raise HTTPException(status_code=404, detail="application not found")

    preset = resolve_runtime_action_preset(application, action_request)
    if preset is None:
        raise HTTPException(status_code=404, detail="runtime action preset not found")
    if preset.kind == "service-call":
        # Preset schema reuse: `topic` holds the service name, `message_type`
        # the service type.
        return dispatch_service_call_preset(request, action_request, application, preset)
    if preset.kind != "topic-publish" or not preset.topic or not preset.message_type:
        raise HTTPException(status_code=422, detail="runtime action preset is not a ROS topic publish adapter")

    try:
        payload = resolve_runtime_action_payload(preset)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    ros_publish_request = RosPublishRequest(topic=preset.topic, message_type=preset.message_type, payload=payload)
    audit_log = get_runtime_audit_log(request)
    try:
        ensure_application_policy_allows(application.runtime_policy, ros_publish_request)
    except RuntimeCommandPolicyError as exc:
        record_runtime_action_rejection(audit_log, action_request, preset, payload, str(exc))
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except RuntimePayloadShapeError as exc:
        record_runtime_action_rejection(audit_log, action_request, preset, payload, str(exc))
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        receipt = execute_as_runtime_owner(
            request,
            lambda: stop_controller.execute_if_running(
                lambda: publish_with_runtime_policy(
                    get_ros_publisher_gateway(request),
                    get_runtime_command_policy(request),
                    audit_log,
                    ros_publish_request,
                    get_runtime_command_rate_limiter(request),
                )
            ),
        )
    except RuntimeStoppedError as exc:
        record_runtime_action_rejection(audit_log, action_request, preset, payload, str(exc))
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except SafeRosPublishError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    request.app.state.runtime_session_manager.record_published_mode_request(
        request.headers.get(RUNTIME_SESSION_HEADER, "").strip(), preset.topic, payload
    )

    return RuntimeActionDispatchResponse(
        app_id=action_request.app_id,
        command=preset.command,
        config_id=action_request.config_id,
        detail=receipt.detail,
        message_type=receipt.message_type,
        preset_id=preset.id,
        status=receipt.status,
        topic=receipt.topic,
    )


def dispatch_service_call_preset(
    request: Request,
    action_request: RuntimeActionDispatchRequest,
    application: ApplicationConfig,
    preset: RuntimeActionPreset,
) -> RuntimeActionDispatchResponse:
    audit_log = get_runtime_audit_log(request)

    def reject(status_code: int, detail: str) -> HTTPException:
        return audited_rejection(
            audit_log,
            status_code,
            channel="runtime_action",
            detail=detail,
            message_type=preset.message_type,
            target=preset.command or preset.id,
            topic=preset.topic,
        )

    if not preset.topic or not preset.message_type:
        raise reject(422, "service-call preset needs a service name in `topic` and a type in `message_type`")

    stop_controller = get_runtime_stop_controller(request)
    stop_reason = stop_controller.rejection_reason()
    if stop_reason is not None:
        raise reject(409, stop_reason)

    try:
        ensure_allowed(preset.topic, application.runtime_policy.allowed_service_calls, "ROS service")
        get_runtime_command_policy(request).ensure_service_allowed(preset.topic, preset.message_type)
    except RuntimeCommandPolicyError as exc:
        raise reject(403, str(exc)) from exc

    try:
        get_runtime_command_rate_limiter(request).ensure_allowed(f"runtime_action_service:{preset.topic}")
    except RuntimeRateLimitError as exc:
        raise reject(429, str(exc)) from exc

    ros_service_gateway: RosServiceGateway = request.app.state.ros_service_gateway
    try:
        receipt = execute_as_runtime_owner(
            request,
            lambda: stop_controller.execute_blocking_if_running(
                lambda: ros_service_gateway.call(
                    RosServiceRequest(service=preset.topic, service_type=preset.message_type)
                )
            ),
        )
    except RuntimeStoppedError as exc:
        raise reject(409, str(exc)) from exc
    except ValueError as exc:
        raise reject(422, str(exc)) from exc
    except RuntimeError as exc:
        raise reject(502, str(exc)) from exc

    refused = receipt.success is False
    detail = f"Service refused: {receipt.detail}" if refused else receipt.detail
    # A refusal is not an acceptance, and a simulated call reached no service.
    audit_log.record(
        RuntimeAuditRecord(
            channel="runtime_action",
            detail=detail,
            message_type=preset.message_type,
            payload_summary={"call_status": receipt.status, "success": receipt.success},
            status="rejected" if refused else "accepted",
            target=preset.command or preset.id,
            topic=preset.topic,
        )
    )
    return RuntimeActionDispatchResponse(
        app_id=action_request.app_id,
        command=preset.command,
        config_id=action_request.config_id,
        detail=detail,
        message_type=preset.message_type,
        preset_id=preset.id,
        status=receipt.status,
        topic=preset.topic,
    )


def resolve_runtime_action_preset(
    application: ApplicationConfig,
    action_request: RuntimeActionDispatchRequest,
) -> RuntimeActionPreset | None:
    if action_request.preset_id:
        return next((preset for preset in application.action_presets if preset.id == action_request.preset_id), None)
    return next((preset for preset in application.action_presets if preset.command == action_request.command), None)


def resolve_runtime_action_payload(preset: RuntimeActionPreset) -> dict[str, Any]:
    if preset.payload_text:
        return parse_ros_payload_text(preset.payload_text)
    if isinstance(preset.payload, dict):
        return dict(preset.payload)
    if preset.payload is None:
        return {}
    return {"data": preset.payload}


def ensure_application_policy_allows(policy: RuntimeAdapterPolicy, publish_request: RosPublishRequest) -> None:
    RuntimeCommandPolicy(
        allowed_message_types=policy.allowed_message_types or ("*",),
        allowed_publish_topics=policy.allowed_publish_topics or ("*",),
        allowed_recording_topics=policy.allowed_recording_topics,
        allowed_teleop_targets=policy.allowed_teleop_targets,
    ).ensure_publish_allowed(publish_request.topic, publish_request.message_type, publish_request.payload)


def record_runtime_action_rejection(
    audit_log: RuntimeAuditLog,
    action_request: RuntimeActionDispatchRequest,
    preset: RuntimeActionPreset,
    payload: dict[str, Any],
    detail: str,
) -> None:
    audit_log.record(
        RuntimeAuditRecord(
            channel="runtime_action",
            detail=detail,
            message_type=preset.message_type,
            payload_summary={
                **summarize_payload(payload),
                "app_id": action_request.app_id,
                "config_id": action_request.config_id,
                "preset_id": preset.id,
            },
            status="rejected",
            target=preset.command,
            topic=preset.topic,
        )
    )
