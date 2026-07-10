import asyncio
from contextlib import suppress
from dataclasses import asdict
from pathlib import Path
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator

from apps.bloom_api.security import BloomPrincipal, require_operator, require_runtime_websocket_operator
from libs.config import (
    ApplicationConfig,
    ConfigurationNotFoundError,
    ConfigurationRepository,
    RuntimeActionPreset,
    RuntimeAdapterPolicy,
)
from libs.ros_adapters import RosPublishRequest, RosPublisherGateway, SafeRosPublishError, publish_with_runtime_policy
from libs.ros_adapters.payloads import parse_ros_payload_text
from libs.ros_adapters.safety import RuntimeCommandPolicy, RuntimeCommandPolicyError, RuntimePayloadShapeError
from libs.sessions import (
    RuntimeClientMessage,
    RuntimeAuditLog,
    RuntimeAuditRecord,
    RuntimeCommandRateLimiter,
    RuntimePingMessage,
    RuntimeRecordingGateway,
    RuntimeRecordingRequest,
    RuntimeServerMessage,
    RuntimeSessionManager,
    RuntimeTopicSample,
    RuntimeTopicSubscription,
    RuntimeTopicSubscriptionGateway,
    RuntimeTopicSubscriptionHandle,
    RuntimeSubscribeTopicMessage,
    RuntimeTeleopCommandMessage,
    TeleopCommandGateway,
    parse_runtime_client_message,
)
from libs.sessions.audit import summarize_payload
from libs.sessions.teleop_runtime import build_teleop_ack

router = APIRouter(prefix="/runtime", tags=["runtime"])


def get_runtime_session_manager(websocket: WebSocket) -> RuntimeSessionManager:
    return websocket.app.state.runtime_session_manager


def get_teleop_command_gateway(websocket: WebSocket) -> TeleopCommandGateway:
    return websocket.app.state.teleop_command_gateway


def get_runtime_topic_subscription_gateway(websocket: WebSocket) -> RuntimeTopicSubscriptionGateway:
    return websocket.app.state.runtime_topic_subscription_gateway


def get_runtime_audit_log(connection: Request | WebSocket) -> RuntimeAuditLog:
    return connection.app.state.runtime_audit_log


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


@router.get("/audit", response_model=RuntimeAuditListResponse)
def list_runtime_audit_records(
    request: Request,
    limit: int = 100,
    _principal: BloomPrincipal = Depends(require_operator),
) -> RuntimeAuditListResponse:
    audit_log = get_runtime_audit_log(request)
    return RuntimeAuditListResponse(
        records=tuple(RuntimeAuditRecordResponse(**asdict(record)) for record in audit_log.list_records(limit))
    )


@router.post("/actions", response_model=RuntimeActionDispatchResponse)
def dispatch_runtime_action(
    request: Request,
    action_request: RuntimeActionDispatchRequest,
    _principal: BloomPrincipal = Depends(require_operator),
) -> RuntimeActionDispatchResponse:
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
        receipt = publish_with_runtime_policy(
            get_ros_publisher_gateway(request),
            get_runtime_command_policy(request),
            audit_log,
            ros_publish_request,
            get_runtime_command_rate_limiter(request),
        )
    except SafeRosPublishError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

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


@router.post("/recordings", response_model=RuntimeRecordingResponse)
def start_runtime_recording(
    request: Request,
    recording_request: RuntimeRecordingStartRequest,
    _principal: BloomPrincipal = Depends(require_operator),
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
        receipt = gateway.start(
            RuntimeRecordingRequest(
                label=recording_request.label,
                output_folder=recording_request.output_folder,
                topics=recording_request.topics,
            )
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
    _principal: BloomPrincipal = Depends(require_operator),
) -> RuntimeRecordingResponse:
    gateway = get_runtime_recording_gateway(request)
    receipt = gateway.stop(recording_id)
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
    await require_runtime_websocket_operator(websocket)
    manager = get_runtime_session_manager(websocket)
    await websocket.accept()
    session = manager.connect()
    event_loop = asyncio.get_running_loop()
    topic_samples: asyncio.Queue[RuntimeTopicSample] = asyncio.Queue(maxsize=100)
    topic_subscription_handles: list[RuntimeTopicSubscriptionHandle] = []
    receive_task: asyncio.Task | None = None
    sample_task: asyncio.Task | None = None

    try:
        await websocket.send_json(
            RuntimeServerMessage(
                type="session_connected",
                active_sessions=manager.active_session_count,
                detail="Runtime session connected.",
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
                    session.id,
                    payload,
                    event_loop,
                    topic_samples,
                    topic_subscription_handles,
                )
                receive_task = asyncio.create_task(websocket.receive_json())

            if sample_task in done_tasks:
                sample = sample_task.result()
                await websocket.send_json(build_runtime_topic_sample(session.id, sample).model_dump())
                sample_task = asyncio.create_task(topic_samples.get())
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(session)
        for handle in topic_subscription_handles:
            handle.close()
        await cancel_runtime_task(receive_task)
        await cancel_runtime_task(sample_task)


async def handle_runtime_client_payload(
    websocket: WebSocket,
    session_id: str,
    payload: dict,
    event_loop: asyncio.AbstractEventLoop,
    topic_samples: asyncio.Queue[RuntimeTopicSample],
    topic_subscription_handles: list[RuntimeTopicSubscriptionHandle],
) -> None:
    try:
        message = parse_runtime_client_message(payload)
    except ValidationError as exc:
        await websocket.send_json(
            RuntimeServerMessage(
                type="runtime_error",
                detail="Invalid runtime message.",
                payload={"message": str(exc)},
                session_id=session_id,
            ).model_dump()
        )
        return

    await websocket.send_json(
        build_runtime_ack(
            session_id,
            message,
            get_teleop_command_gateway(websocket),
            get_runtime_topic_subscription_gateway(websocket),
            get_runtime_audit_log(websocket),
            get_runtime_command_policy(websocket),
            get_runtime_command_rate_limiter(websocket),
            lambda sample: event_loop.call_soon_threadsafe(enqueue_topic_sample, topic_samples, sample),
            topic_subscription_handles,
        ).model_dump()
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
    topic_subscription_handles: list[RuntimeTopicSubscriptionHandle] | None = None,
) -> RuntimeServerMessage:
    if isinstance(message, RuntimePingMessage):
        return RuntimeServerMessage(type="pong", detail="Runtime session is alive.", session_id=session_id)

    if isinstance(message, RuntimeSubscribeTopicMessage):
        if topic_subscription_gateway and on_topic_sample and topic_subscription_handles is not None:
            try:
                topic_subscription_handles.append(
                    topic_subscription_gateway.subscribe(
                        RuntimeTopicSubscription(
                            field_path=message.field_path,
                            message_type=message.message_type,
                            topic=message.topic,
                        ),
                        on_topic_sample,
                    )
                )
            except (RuntimeError, ValueError) as exc:
                return RuntimeServerMessage(
                    type="runtime_error",
                    detail="Topic subscription could not be started.",
                    payload={"message": str(exc), "topic": message.topic},
                    session_id=session_id,
                )

        return RuntimeServerMessage(
            type="subscription_ack",
            detail=f"Subscribed to {message.topic}.",
            payload={
                "field_path": message.field_path,
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
