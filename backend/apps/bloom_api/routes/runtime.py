import asyncio
from contextlib import suppress
from dataclasses import asdict
from pathlib import Path
from typing import Callable

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, ValidationError, field_validator

from apps.bloom_api.security import BloomPrincipal, require_operator, require_runtime_websocket_operator
from libs.ros_adapters.safety import RuntimeCommandPolicy
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

    gateway = get_runtime_recording_gateway(request)
    receipt = gateway.start(
        RuntimeRecordingRequest(
            label=recording_request.label,
            output_folder=recording_request.output_folder,
            topics=recording_request.topics,
        )
    )
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
