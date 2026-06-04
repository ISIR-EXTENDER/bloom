import asyncio
from contextlib import suppress
from typing import Callable

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from libs.sessions import (
    RuntimeTopicSample,
    RuntimeTopicSubscription,
    RuntimeTopicSubscriptionGateway,
    RuntimeTopicSubscriptionHandle,
    RuntimeClientMessage,
    RuntimePingMessage,
    RuntimeServerMessage,
    RuntimeSessionManager,
    RuntimeSubscribeTopicMessage,
    RuntimeTeleopCommandMessage,
    NoopTeleopCommandGateway,
    TeleopCommand,
    TeleopCommandGateway,
    TeleopVector3,
    parse_runtime_client_message,
)

router = APIRouter(prefix="/runtime", tags=["runtime"])


def get_runtime_session_manager(websocket: WebSocket) -> RuntimeSessionManager:
    return websocket.app.state.runtime_session_manager


def get_teleop_command_gateway(websocket: WebSocket) -> TeleopCommandGateway:
    return websocket.app.state.teleop_command_gateway


def get_runtime_topic_subscription_gateway(websocket: WebSocket) -> RuntimeTopicSubscriptionGateway:
    return websocket.app.state.runtime_topic_subscription_gateway


@router.websocket("/ws")
async def runtime_websocket(websocket: WebSocket) -> None:
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
            lambda sample: event_loop.call_soon_threadsafe(enqueue_topic_sample, topic_samples, sample),
            topic_subscription_handles,
        ).model_dump()
    )


def build_runtime_ack(
    session_id: str,
    message: RuntimeClientMessage,
    teleop_gateway: TeleopCommandGateway | None = None,
    topic_subscription_gateway: RuntimeTopicSubscriptionGateway | None = None,
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
        gateway = teleop_gateway or NoopTeleopCommandGateway()
        try:
            receipt = gateway.publish(to_teleop_command(message))
        except RuntimeError as exc:
            return RuntimeServerMessage(
                type="runtime_error",
                detail="Teleop command could not be published.",
                payload={"message": str(exc), "target": message.target},
                session_id=session_id,
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


def to_teleop_command(message: RuntimeTeleopCommandMessage) -> TeleopCommand:
    return TeleopCommand(
        angular=TeleopVector3(**message.angular.model_dump()),
        linear=TeleopVector3(**message.linear.model_dump()),
        mode=message.mode,
        seq=message.seq,
        target=message.target,
    )
