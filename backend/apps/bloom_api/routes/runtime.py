import asyncio
from collections.abc import Callable
from contextlib import suppress
from dataclasses import asdict
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator

from apps.bloom_api.security import (
    RUNTIME_SESSION_HEADER,
    BloomPrincipal,
    execute_as_runtime_owner,
    require_observer,
    require_operator,
    require_runtime_owner,
    require_runtime_websocket_principal,
)
from apps.bloom_api.settings import Settings
from libs.config import (
    ApplicationConfig,
    ConfigurationNotFoundError,
    ConfigurationRepository,
    RuntimeActionPreset,
    RuntimeAdapterPolicy,
)
from libs.ros_adapters import (
    RosPublisherGateway,
    RosPublishRequest,
    RosServiceGateway,
    RosServiceRequest,
    SafeRosPublishError,
    publish_with_runtime_policy,
)
from libs.ros_adapters.camera_frames import (
    CameraFrameError,
    NoopCameraFrameGateway,
    decode_image_data_url,
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
    RuntimeClaimControlMessage,
    RuntimeClientMessage,
    RuntimeCommandRateLimiter,
    RuntimeControlSnapshot,
    RuntimePingMessage,
    RuntimeRateLimitError,
    RuntimeRecordingGateway,
    RuntimeRecordingRequest,
    RuntimeReleaseControlMessage,
    RuntimeServerMessage,
    RuntimeSession,
    RuntimeSessionManager,
    RuntimeStopAssertionError,
    RuntimeStopController,
    RuntimeStoppedError,
    RuntimeSubscribeTopicMessage,
    RuntimeTeleopCommandMessage,
    RuntimeTopicSample,
    RuntimeTopicSubscription,
    RuntimeTopicSubscriptionGateway,
    RuntimeTopicSubscriptionHandle,
    TeleopCommand,
    TeleopCommandGateway,
    TeleopVector3,
    parse_runtime_client_message,
)
from libs.sessions.audit import summarize_payload
from libs.sessions.positions import (
    JointPose,
    PositionLibrary,
    PositionLibraryError,
    render_joint_targets_yaml,
)
from libs.sessions.teleop_runtime import build_teleop_ack, to_teleop_command
from libs.sessions.topics import is_live_subscription_gateway

router = APIRouter(prefix="/runtime", tags=["runtime"])


def get_runtime_session_manager(websocket: WebSocket) -> RuntimeSessionManager:
    return websocket.app.state.runtime_session_manager


def get_teleop_command_gateway(websocket: WebSocket) -> TeleopCommandGateway:
    return websocket.app.state.teleop_command_gateway


def get_runtime_topic_subscription_gateway(websocket: WebSocket) -> RuntimeTopicSubscriptionGateway:
    return websocket.app.state.runtime_topic_subscription_gateway


def get_runtime_stop_controller(connection: Request | WebSocket) -> RuntimeStopController:
    return connection.app.state.runtime_stop_controller


def get_allowed_command_frame_ids(connection: Request | WebSocket) -> tuple[str, ...]:
    settings: Settings = connection.app.state.settings
    if settings.ros_command_backend != "cartesian_manager":
        return ()
    return settings.allowed_command_frame_ids


def get_runtime_audit_log(connection: Request | WebSocket) -> RuntimeAuditLog:
    return connection.app.state.runtime_audit_log


def get_camera_frame_gateway(connection: Request | WebSocket):
    gateway = getattr(connection.app.state, "camera_frame_gateway", None)
    return gateway if gateway is not None else NoopCameraFrameGateway()


def get_runtime_command_policy(connection: Request | WebSocket) -> RuntimeCommandPolicy:
    return connection.app.state.runtime_command_policy


def get_runtime_command_rate_limiter(connection: Request | WebSocket) -> RuntimeCommandRateLimiter:
    return connection.app.state.runtime_command_rate_limiter


def get_runtime_recording_gateway(request: Request) -> RuntimeRecordingGateway:
    return request.app.state.runtime_recording_gateway


def get_ros_publisher_gateway(request: Request) -> RosPublisherGateway:
    return request.app.state.ros_publisher_gateway


def get_configuration_repository(request: Request) -> ConfigurationRepository:
    return request.app.state.configuration_repository


def get_allowed_recording_output_folders(request: Request) -> tuple[str, ...]:
    return request.app.state.settings.allowed_recording_output_folders


class RuntimeAuditRecordResponse(BaseModel):
    channel: str
    detail: str
    message_type: str
    payload_summary: dict = Field(default_factory=dict)
    recorded_at: str
    session_id: str
    status: str
    target: str
    topic: str


class RuntimeAuditListResponse(BaseModel):
    records: tuple[RuntimeAuditRecordResponse, ...]


class SavedPositionRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    joint_names: tuple[str, ...] = Field(min_length=1)
    positions: tuple[float, ...] = Field(min_length=1)
    description: str = Field(default="", max_length=280)


class SavedPositionResponse(BaseModel):
    name: str
    joint_names: tuple[str, ...]
    positions: tuple[float, ...]
    description: str


class SavedPositionListResponse(BaseModel):
    positions: tuple[SavedPositionResponse, ...]


class SavedPositionExportResponse(BaseModel):
    """The block to paste into cartesian_manager's explorer_params.yaml."""

    yaml: str
    target_names: tuple[str, ...]


class CameraFramePublishRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=256)
    image_data_url: str = Field(min_length=32)
    frame_id: str = Field(default="", max_length=64)


class CameraFramePublishResponse(BaseModel):
    topic: str
    image_format: str
    byte_count: int
    status: str
    detail: str


class RuntimeRecordingStartRequest(BaseModel):
    topics: tuple[str, ...] = Field(min_length=1)
    output_folder: str = Field(default="data/recordings", min_length=1)
    label: str = ""

    @field_validator("topics")
    @classmethod
    def topics_must_be_absolute(cls, topics: tuple[str, ...]) -> tuple[str, ...]:
        normalized_topics: list[str] = []
        for topic in topics:
            normalized_topic = topic.strip()
            if not normalized_topic.startswith("/"):
                raise ValueError("recording topics must start with '/'")
            if any(character.isspace() for character in normalized_topic):
                raise ValueError("recording topics must not contain whitespace")
            normalized_topics.append(normalized_topic)
        return tuple(dict.fromkeys(normalized_topics))

    @field_validator("output_folder")
    @classmethod
    def output_folder_must_be_relative(cls, output_folder: str) -> str:
        normalized_folder = output_folder.strip()
        path = Path(normalized_folder)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError("recording output folder must be a safe relative path")
        return normalized_folder


class RuntimeRecordingResponse(BaseModel):
    detail: str
    output_folder: str
    recording_id: str
    status: str
    topics: tuple[str, ...]


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
        raise HTTPException(status_code=503, detail=exc.state.detail) from exc
    return RuntimeStopStateResponse(**asdict(state))


@router.post("/stop/resume", response_model=RuntimeStopStateResponse)
def resume_runtime_stop(
    request: Request,
    _principal: BloomPrincipal = Depends(require_runtime_owner),
) -> RuntimeStopStateResponse:
    state = execute_as_runtime_owner(request, lambda: get_runtime_stop_controller(request).resume())
    return RuntimeStopStateResponse(**asdict(state))


@router.get("/audit", response_model=RuntimeAuditListResponse)
def list_runtime_audit_records(
    request: Request,
    limit: int = 100,
    _principal: BloomPrincipal = Depends(require_observer),
) -> RuntimeAuditListResponse:
    audit_log = get_runtime_audit_log(request)
    return RuntimeAuditListResponse(
        records=tuple(RuntimeAuditRecordResponse(**asdict(record)) for record in audit_log.list_records(limit))
    )


@router.post("/actions", response_model=RuntimeActionDispatchResponse)
def dispatch_runtime_action(
    request: Request,
    action_request: RuntimeActionDispatchRequest,
    _principal: BloomPrincipal = Depends(require_runtime_owner),
) -> RuntimeActionDispatchResponse:
    stop_controller = get_runtime_stop_controller(request)
    stop_reason = stop_controller.rejection_reason()
    if stop_reason is not None:
        get_runtime_audit_log(request).record(
            RuntimeAuditRecord(
                channel="runtime_action",
                detail=stop_reason,
                payload_summary={
                    "app_id": action_request.app_id,
                    "config_id": action_request.config_id,
                    "preset_id": action_request.preset_id,
                },
                status="rejected",
                target=action_request.command or action_request.preset_id,
            )
        )
        raise HTTPException(status_code=409, detail=stop_reason)

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

    record_mode_request_for_mirror(request, preset, payload)

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


def record_mode_request_for_mirror(request: Request, preset: RuntimeActionPreset, payload: object) -> None:
    """Remember a published mode request so the read-only mirror can show it."""
    if not preset.topic.endswith("mode_request"):
        return
    mode = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(mode, str):
        return
    session_id = request.headers.get(RUNTIME_SESSION_HEADER, "").strip()
    if session_id:
        request.app.state.runtime_session_manager.record_mode_request(session_id, mode)


def dispatch_service_call_preset(
    request: Request,
    action_request: RuntimeActionDispatchRequest,
    application: ApplicationConfig,
    preset: RuntimeActionPreset,
) -> RuntimeActionDispatchResponse:
    audit_log = get_runtime_audit_log(request)

    def reject(status_code: int, detail: str) -> HTTPException:
        audit_log.record(
            RuntimeAuditRecord(
                channel="runtime_action",
                detail=detail,
                message_type=preset.message_type,
                status="rejected",
                target=preset.command or preset.id,
                topic=preset.topic,
            )
        )
        return HTTPException(status_code=status_code, detail=detail)

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
            lambda: stop_controller.execute_if_running(
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

    detail = receipt.detail if receipt.success is None or receipt.success else f"Service refused: {receipt.detail}"
    audit_log.record(
        RuntimeAuditRecord(
            channel="runtime_action",
            detail=detail,
            message_type=preset.message_type,
            status="accepted",
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


def get_position_library(request: Request, config_id: str = "", app_id: str = "") -> PositionLibrary:
    """One library per application.

    A pose is a joint vector in one arm's joint order. Sharing a single library
    across Explorer and Kinova let a six-joint Explorer pose appear in a Kinova
    export, where the same numbers mean different angles.
    """
    libraries = getattr(request.app.state, "position_libraries", None)
    if libraries is None:
        libraries = {}
        request.app.state.position_libraries = libraries
    key = f"{config_id}:{app_id}"
    library = libraries.get(key)
    if library is None:
        library = PositionLibrary()
        libraries[key] = library
    return library


def to_position_response(pose: JointPose) -> SavedPositionResponse:
    return SavedPositionResponse(
        name=pose.name,
        joint_names=pose.joint_names,
        positions=pose.positions,
        description=pose.description,
    )


@router.get("/positions", response_model=SavedPositionListResponse)
def list_saved_positions(
    request: Request,
    app_id: str = "",
    config_id: str = "",
    _principal: BloomPrincipal = Depends(require_observer),
) -> SavedPositionListResponse:
    library = get_position_library(request, config_id, app_id)
    return SavedPositionListResponse(positions=tuple(to_position_response(p) for p in library.list()))


@router.post("/positions", response_model=SavedPositionResponse)
def save_position(
    payload: SavedPositionRequest,
    request: Request,
    app_id: str = "",
    config_id: str = "",
    _principal: BloomPrincipal = Depends(require_operator),
) -> SavedPositionResponse:
    library = get_position_library(request, config_id, app_id)
    try:
        pose = JointPose(
            name=payload.name,
            joint_names=tuple(payload.joint_names),
            positions=tuple(payload.positions),
            description=payload.description,
        )
        return to_position_response(library.save(pose))
    except PositionLibraryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/positions/{name}", response_model=SavedPositionListResponse)
def delete_position(
    name: str,
    request: Request,
    app_id: str = "",
    config_id: str = "",
    _principal: BloomPrincipal = Depends(require_operator),
) -> SavedPositionListResponse:
    library = get_position_library(request, config_id, app_id)
    if not library.remove(name):
        raise HTTPException(status_code=404, detail=f"no saved position named '{name}'")
    return SavedPositionListResponse(positions=tuple(to_position_response(p) for p in library.list()))


@router.get("/positions/export", response_model=SavedPositionExportResponse)
def export_positions(
    request: Request,
    app_id: str = "",
    config_id: str = "",
    _principal: BloomPrincipal = Depends(require_observer),
) -> SavedPositionExportResponse:
    """Render the joint_targets block for cartesian_manager.

    Bloom cannot register a target on the manager at runtime, so the bridge
    between the two storage layers is an export the operator pastes into
    explorer_params.yaml and restarts the node to pick up.
    """
    library = get_position_library(request, config_id, app_id)
    poses = library.list()
    try:
        return SavedPositionExportResponse(
            yaml=render_joint_targets_yaml(poses),
            target_names=tuple(pose.name for pose in poses),
        )
    except PositionLibraryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/camera-frames", response_model=CameraFramePublishResponse)
def publish_camera_frame(
    payload: CameraFramePublishRequest,
    request: Request,
    _principal: BloomPrincipal = Depends(require_runtime_owner),
) -> CameraFramePublishResponse:
    """Publish a browser-captured frame as sensor_msgs/msg/CompressedImage.

    The topic goes through the same publish allowlist as every other robot-facing
    command, so a camera widget cannot reach a topic the app was not configured
    for.
    """
    policy = get_runtime_command_policy(request)
    audit_log = get_runtime_audit_log(request)
    gateway = get_camera_frame_gateway(request)

    # Frames are megabytes each. Without a limit a camera widget stuck in a
    # retry loop would saturate the backend and the ROS graph, so this is rate
    # limited like every other robot-facing command.
    try:
        get_runtime_command_rate_limiter(request).ensure_allowed(f"http_camera_frame:{payload.topic}")
    except RuntimeRateLimitError as exc:
        audit_log.record(
            RuntimeAuditRecord(
                channel="http_camera_frame",
                detail=str(exc),
                message_type="sensor_msgs/msg/CompressedImage",
                status="rejected",
                topic=payload.topic,
            )
        )
        raise HTTPException(status_code=429, detail=str(exc)) from exc

    try:
        policy.ensure_publish_allowed(payload.topic, "sensor_msgs/msg/CompressedImage", {})
    except RuntimeCommandPolicyError as exc:
        audit_log.record(
            RuntimeAuditRecord(
                channel="http_camera_frame",
                detail=str(exc),
                message_type="sensor_msgs/msg/CompressedImage",
                status="rejected",
                topic=payload.topic,
            )
        )
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    try:
        frame = decode_image_data_url(payload.image_data_url)
    except CameraFrameError as exc:
        audit_log.record(
            RuntimeAuditRecord(
                channel="http_camera_frame",
                detail=str(exc),
                message_type="sensor_msgs/msg/CompressedImage",
                status="rejected",
                topic=payload.topic,
            )
        )
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        execute_as_runtime_owner(request, lambda: gateway.publish(payload.topic, frame, payload.frame_id))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    audit_log.record(
        RuntimeAuditRecord(
            channel="http_camera_frame",
            detail=f"Published {frame.image_format} frame of {len(frame.image_bytes)} bytes.",
            message_type="sensor_msgs/msg/CompressedImage",
            payload_summary={"byte_count": len(frame.image_bytes), "format": frame.image_format},
            status="accepted",
            topic=payload.topic,
        )
    )

    return CameraFramePublishResponse(
        topic=payload.topic,
        image_format=frame.image_format,
        byte_count=len(frame.image_bytes),
        status="published",
        detail="Camera frame published.",
    )


@router.post("/recordings", response_model=RuntimeRecordingResponse)
def start_runtime_recording(
    request: Request,
    recording_request: RuntimeRecordingStartRequest,
    _principal: BloomPrincipal = Depends(require_runtime_owner),
) -> RuntimeRecordingResponse:
    if recording_request.output_folder not in get_allowed_recording_output_folders(request):
        get_runtime_audit_log(request).record(
            RuntimeAuditRecord(
                channel="runtime_recording",
                detail="Recording output folder is not allowed.",
                payload_summary={"topic_count": len(recording_request.topics)},
                status="rejected",
                target=recording_request.output_folder,
            )
        )
        raise HTTPException(status_code=403, detail="Recording output folder is not allowed.")

    policy = get_runtime_command_policy(request)
    try:
        policy.ensure_recording_topics_allowed(recording_request.topics)
    except RuntimeCommandPolicyError as exc:
        get_runtime_audit_log(request).record(
            RuntimeAuditRecord(
                channel="runtime_recording",
                detail=str(exc),
                payload_summary={"topic_count": len(recording_request.topics)},
                status="rejected",
                target=recording_request.output_folder,
                topic=find_rejected_recording_topic(recording_request.topics, policy.allowed_recording_topics),
            )
        )
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    gateway = get_runtime_recording_gateway(request)
    try:
        receipt = execute_as_runtime_owner(
            request,
            lambda: gateway.start(
                RuntimeRecordingRequest(
                    label=recording_request.label,
                    output_folder=recording_request.output_folder,
                    topics=recording_request.topics,
                )
            ),
        )
    except RuntimeError as exc:
        get_runtime_audit_log(request).record(
            RuntimeAuditRecord(
                channel="runtime_recording",
                detail=str(exc),
                payload_summary={"topic_count": len(recording_request.topics)},
                status="rejected",
                target=recording_request.output_folder,
            )
        )
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    get_runtime_audit_log(request).record(
        RuntimeAuditRecord(
            channel="runtime_recording",
            detail=receipt.detail,
            payload_summary={"topic_count": len(receipt.topics)},
            session_id=receipt.recording_id,
            status="accepted",
            target=receipt.output_folder,
        )
    )
    return RuntimeRecordingResponse(**asdict(receipt))


def find_rejected_recording_topic(topics: tuple[str, ...], allowed_topics: tuple[str, ...]) -> str:
    if "*" in allowed_topics:
        return ""
    return next((topic for topic in topics if topic not in allowed_topics), "")


@router.post("/recordings/{recording_id}/stop", response_model=RuntimeRecordingResponse)
def stop_runtime_recording(
    request: Request,
    recording_id: str,
    _principal: BloomPrincipal = Depends(require_runtime_owner),
) -> RuntimeRecordingResponse:
    gateway = get_runtime_recording_gateway(request)
    receipt = execute_as_runtime_owner(request, lambda: gateway.stop(recording_id))
    get_runtime_audit_log(request).record(
        RuntimeAuditRecord(
            channel="runtime_recording",
            detail=receipt.detail,
            payload_summary={"topic_count": len(receipt.topics)},
            session_id=receipt.recording_id,
            status="accepted",
            target=receipt.output_folder,
        )
    )
    return RuntimeRecordingResponse(**asdict(receipt))


@router.websocket("/ws")
async def runtime_websocket(websocket: WebSocket) -> None:
    principal = await require_runtime_websocket_principal(websocket)
    manager = get_runtime_session_manager(websocket)
    await websocket.accept()
    session = manager.connect()
    event_loop = asyncio.get_running_loop()
    topic_samples: asyncio.Queue[RuntimeTopicSample] = asyncio.Queue(maxsize=100)
    # Keyed by widget: a screen that subscribes again replaces its own handle
    # instead of stacking a second subscription on the same topic.
    topic_subscription_handles: dict[str, RuntimeTopicSubscriptionHandle] = {}
    receive_task: asyncio.Task | None = None
    sample_task: asyncio.Task | None = None

    try:
        control_snapshot = get_runtime_control_snapshot(websocket, manager, session.id)
        await websocket.send_json(
            RuntimeServerMessage(
                type="session_connected",
                active_sessions=control_snapshot.active_sessions,
                detail="Runtime session connected.",
                payload=asdict(control_snapshot),
                session_id=session.id,
            ).model_dump()
        )

        receive_task = asyncio.create_task(websocket.receive_json())
        sample_task = asyncio.create_task(topic_samples.get())

        while True:
            done_tasks, _ = await asyncio.wait(
                {receive_task, sample_task},
                return_when=asyncio.FIRST_COMPLETED,
            )

            if receive_task in done_tasks:
                payload = receive_task.result()
                await handle_runtime_client_payload(
                    websocket,
                    session,
                    manager,
                    payload,
                    event_loop,
                    topic_samples,
                    topic_subscription_handles,
                    principal,
                )
                receive_task = asyncio.create_task(websocket.receive_json())

            if sample_task in done_tasks:
                sample = sample_task.result()
                await websocket.send_json(build_runtime_topic_sample(session.id, sample).model_dump())
                sample_task = asyncio.create_task(topic_samples.get())
    except WebSocketDisconnect:
        pass
    finally:
        release_started = (
            manager.begin_control_release(session) if websocket.app.state.settings.runtime_control_required else False
        )
        if release_started:
            await run_runtime_thread(
                disconnect_runtime_session,
                manager,
                session,
                get_teleop_command_gateway(websocket),
                get_runtime_stop_controller(websocket),
                get_runtime_audit_log(websocket),
            )
        else:
            manager.disconnect(session)
        for handle in topic_subscription_handles.values():
            handle.close()
        await cancel_runtime_task(receive_task)
        await cancel_runtime_task(sample_task)


async def handle_runtime_client_payload(
    websocket: WebSocket,
    session: RuntimeSession,
    manager: RuntimeSessionManager,
    payload: dict,
    event_loop: asyncio.AbstractEventLoop,
    topic_samples: asyncio.Queue[RuntimeTopicSample],
    topic_subscription_handles: dict[str, RuntimeTopicSubscriptionHandle],
    principal: BloomPrincipal,
) -> None:
    try:
        message = parse_runtime_client_message(payload)
    except ValidationError as exc:
        await websocket.send_json(
            RuntimeServerMessage(
                type="runtime_error",
                detail="Invalid runtime message.",
                payload={"message": str(exc)},
                session_id=session.id,
            ).model_dump()
        )
        return

    audit_log = get_runtime_audit_log(websocket)

    # An observer keeps the socket for status and topic samples, and nothing
    # that reaches the arm. Subscriptions are reads, so they pass.
    if not principal.is_operator and isinstance(
        message,
        (RuntimeClaimControlMessage, RuntimeReleaseControlMessage, RuntimeTeleopCommandMessage),
    ):
        detail = "This session may watch the runtime but not command it."
        record_runtime_control(audit_log, session.id, False, detail)
        await websocket.send_json(
            RuntimeServerMessage(
                type="runtime_error",
                detail="Runtime command rejected: this session is read-only.",
                payload={"code": "observer_read_only", "message": detail},
                session_id=session.id,
            ).model_dump()
        )
        return

    if isinstance(message, RuntimeClaimControlMessage):
        snapshot = (
            manager.claim_control(session)
            if websocket.app.state.settings.runtime_control_required
            else get_runtime_control_snapshot(websocket, manager, session.id)
        )
        record_runtime_control(audit_log, session.id, snapshot.is_owner, runtime_control_detail(snapshot))
        await websocket.send_json(build_runtime_control_message(snapshot).model_dump())
        return

    if isinstance(message, RuntimeReleaseControlMessage):
        release_started = (
            manager.begin_control_release(session) if websocket.app.state.settings.runtime_control_required else False
        )
        if release_started:
            try:
                await run_runtime_thread(manager.wait_for_control_operations, session)
                await run_runtime_thread(
                    neutralize_runtime_session,
                    manager,
                    session,
                    get_teleop_command_gateway(websocket),
                    get_runtime_stop_controller(websocket),
                    audit_log,
                )
            except RuntimeError as exc:
                try:
                    await run_runtime_thread(get_runtime_stop_controller(websocket).engage)
                except RuntimeStopAssertionError:
                    pass
                snapshot = manager.finish_control_release(session)
                record_runtime_control(audit_log, session.id, False, str(exc))
                await websocket.send_json(
                    RuntimeServerMessage(
                        type="runtime_error",
                        detail="Robot control could not be released safely.",
                        payload={
                            **asdict(snapshot),
                            "code": "control_release_failed",
                            "message": str(exc),
                        },
                        session_id=session.id,
                    ).model_dump()
                )
                return
        snapshot = (
            manager.finish_control_release(session)
            if release_started
            else get_runtime_control_snapshot(websocket, manager, session.id)
        )
        record_runtime_control(audit_log, session.id, True, "Robot control released.")
        await websocket.send_json(build_runtime_control_message(snapshot).model_dump())
        return

    owns_control = True
    if isinstance(message, RuntimeTeleopCommandMessage) and websocket.app.state.settings.runtime_control_required:
        owns_control = manager.is_control_owner(session.id)
    if isinstance(message, RuntimeTeleopCommandMessage) and not owns_control:
        detail = "Another runtime session owns robot control."
        record_runtime_control(audit_log, session.id, False, detail)
        await websocket.send_json(
            RuntimeServerMessage(
                type="runtime_error",
                detail="Teleop command rejected: this session does not own control.",
                payload={"code": "control_not_owned", "message": detail, "target": message.target},
                session_id=session.id,
            ).model_dump()
        )
        return

    response = build_runtime_ack(
        session.id,
        message,
        get_teleop_command_gateway(websocket),
        get_runtime_topic_subscription_gateway(websocket),
        audit_log,
        get_runtime_command_policy(websocket),
        get_runtime_command_rate_limiter(websocket),
        lambda sample: event_loop.call_soon_threadsafe(enqueue_topic_sample, topic_samples, sample),
        topic_subscription_handles,
        get_runtime_stop_controller(websocket),
        get_allowed_command_frame_ids(websocket),
    )
    if isinstance(message, RuntimeTeleopCommandMessage) and response.type == "teleop_ack":
        manager.record_teleop_command(session, to_teleop_command(message))
    await websocket.send_json(response.model_dump())


def build_runtime_control_message(snapshot: RuntimeControlSnapshot) -> RuntimeServerMessage:
    return RuntimeServerMessage(
        type="control_state",
        active_sessions=snapshot.active_sessions,
        detail=runtime_control_detail(snapshot),
        payload=asdict(snapshot),
        session_id=snapshot.session_id,
    )


def get_runtime_control_snapshot(
    connection: Request | WebSocket,
    manager: RuntimeSessionManager,
    session_id: str,
) -> RuntimeControlSnapshot:
    snapshot = manager.control_snapshot(session_id)
    if connection.app.state.settings.runtime_control_required:
        return snapshot
    # Without an ownership lease nobody "holds" control, but what the robot is
    # being told is still true and still worth mirroring.
    return RuntimeControlSnapshot(
        active_sessions=snapshot.active_sessions,
        is_owner=bool(session_id),
        owner_present=snapshot.active_sessions > 0,
        session_id=session_id,
        owner_frame_id=snapshot.owner_frame_id,
        owner_mode_request=snapshot.owner_mode_request,
        owner_moving=snapshot.owner_moving,
    )


def runtime_control_detail(
    snapshot_or_is_owner: RuntimeControlSnapshot | bool, owner_present: bool | None = None
) -> str:
    if isinstance(snapshot_or_is_owner, RuntimeControlSnapshot):
        is_owner = snapshot_or_is_owner.is_owner
        owner_present = snapshot_or_is_owner.owner_present
    else:
        is_owner = snapshot_or_is_owner

    if is_owner:
        return "This runtime session owns robot control."
    if owner_present:
        return "Another runtime session owns robot control."
    return "No runtime session owns robot control."


def neutralize_runtime_session(
    manager: RuntimeSessionManager,
    session: RuntimeSession,
    gateway: TeleopCommandGateway,
    stop_controller: RuntimeStopController,
    audit_log: RuntimeAuditLog,
) -> None:
    commands = manager.moving_teleop_commands(session)
    try:
        for command in commands:
            zero = TeleopCommand(
                angular=TeleopVector3(),
                frame_id=command.frame_id,
                linear=TeleopVector3(),
                mode=command.mode,
                seq=command.seq + 1,
                target=command.target,
            )
            try:
                stop_controller.execute_if_running(lambda zero=zero: gateway.publish(zero))
            except RuntimeStoppedError:
                # STOP may have won the gate after this target last moved. A
                # direct zero is still safe and covers non-default targets.
                gateway.publish(zero)
    except RuntimeError as exc:
        audit_log.record(
            RuntimeAuditRecord(
                channel="runtime_control",
                detail=str(exc),
                session_id=session.id,
                status="rejected",
            )
        )
        raise

    manager.clear_teleop_commands(session)


def disconnect_runtime_session(
    manager: RuntimeSessionManager,
    session: RuntimeSession,
    gateway: TeleopCommandGateway,
    stop_controller: RuntimeStopController,
    audit_log: RuntimeAuditLog,
) -> None:
    try:
        manager.wait_for_control_operations(session)
        try:
            neutralize_runtime_session(manager, session, gateway, stop_controller, audit_log)
        except RuntimeError:
            try:
                stop_controller.engage()
            except RuntimeStopAssertionError:
                pass
    finally:
        try:
            manager.finish_control_release(session)
        finally:
            manager.disconnect(session)


async def run_runtime_thread(operation: Callable[..., Any], *args: Any) -> Any:
    """Finish safety work even when socket shutdown cancels its handler."""
    task = asyncio.create_task(asyncio.to_thread(operation, *args))
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        return await task


def record_runtime_control(audit_log: RuntimeAuditLog, session_id: str, accepted: bool, detail: str) -> None:
    audit_log.record(
        RuntimeAuditRecord(
            channel="runtime_control",
            detail=detail,
            session_id=session_id,
            status="accepted" if accepted else "rejected",
        )
    )


def build_runtime_ack(
    session_id: str,
    message: RuntimeClientMessage,
    teleop_gateway: TeleopCommandGateway | None = None,
    topic_subscription_gateway: RuntimeTopicSubscriptionGateway | None = None,
    audit_log: RuntimeAuditLog | None = None,
    command_policy: RuntimeCommandPolicy | None = None,
    rate_limiter: RuntimeCommandRateLimiter | None = None,
    on_topic_sample: Callable[[RuntimeTopicSample], None] | None = None,
    topic_subscription_handles: dict[str, RuntimeTopicSubscriptionHandle] | None = None,
    stop_controller: RuntimeStopController | None = None,
    allowed_frame_ids: tuple[str, ...] | None = None,
) -> RuntimeServerMessage:
    if isinstance(message, RuntimePingMessage):
        return RuntimeServerMessage(type="pong", detail="Runtime session is alive.", session_id=session_id)

    if isinstance(message, RuntimeSubscribeTopicMessage):
        if topic_subscription_gateway and on_topic_sample and topic_subscription_handles is not None:
            subscription_key = message.widget_id or message.topic
            try:
                handle = topic_subscription_gateway.subscribe(
                    RuntimeTopicSubscription(
                        field_path=message.field_path,
                        message_type=message.message_type,
                        topic=message.topic,
                    ),
                    on_topic_sample,
                )
            except (RuntimeError, ValueError) as exc:
                return RuntimeServerMessage(
                    type="runtime_error",
                    detail="Topic subscription could not be started.",
                    payload={"message": str(exc), "topic": message.topic},
                    session_id=session_id,
                )
            previous = topic_subscription_handles.pop(subscription_key, None)
            if previous is not None:
                previous.close()
            topic_subscription_handles[subscription_key] = handle

        live = is_live_subscription_gateway(topic_subscription_gateway)
        return RuntimeServerMessage(
            type="subscription_ack",
            detail=(
                f"Subscribed to {message.topic}."
                if live
                else f"Accepted {message.topic}, but no ROS subscriber is connected, so no samples will arrive."
            ),
            payload={
                "field_path": message.field_path,
                "live": live,
                "message_type": message.message_type,
                "topic": message.topic,
                "widget_id": message.widget_id,
            },
            session_id=session_id,
        )

    if isinstance(message, RuntimeTeleopCommandMessage):
        return build_teleop_ack(
            session_id=session_id,
            message=message,
            teleop_gateway=teleop_gateway,
            audit_log=audit_log,
            command_policy=command_policy,
            rate_limiter=rate_limiter,
            stop_controller=stop_controller,
            allowed_frame_ids=allowed_frame_ids,
        )

    return RuntimeServerMessage(type="runtime_error", detail="Unsupported runtime message.", session_id=session_id)


def enqueue_topic_sample(topic_samples: asyncio.Queue[RuntimeTopicSample], sample: RuntimeTopicSample) -> None:
    try:
        topic_samples.put_nowait(sample)
    except asyncio.QueueFull:
        with suppress(asyncio.QueueEmpty):
            topic_samples.get_nowait()
        topic_samples.put_nowait(sample)


async def cancel_runtime_task(task: asyncio.Task | None) -> None:
    if task is None:
        return

    if not task.done():
        task.cancel()

    try:
        await task
    except (asyncio.CancelledError, WebSocketDisconnect):
        return


def build_runtime_topic_sample(session_id: str, sample: RuntimeTopicSample) -> RuntimeServerMessage:
    return RuntimeServerMessage(
        type="topic_sample",
        detail=f"Received {sample.topic}.",
        payload={
            "message_type": sample.message_type,
            "received_at": sample.received_at,
            "topic": sample.topic,
            "value": sample.value,
        },
        session_id=session_id,
    )
