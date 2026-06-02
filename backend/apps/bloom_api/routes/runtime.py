from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from libs.sessions import (
    RuntimeClientMessage,
    RuntimePingMessage,
    RuntimeServerMessage,
    RuntimeSessionManager,
    RuntimeSubscribeTopicMessage,
    RuntimeTeleopCommandMessage,
    parse_runtime_client_message,
)

router = APIRouter(prefix="/runtime", tags=["runtime"])


def get_runtime_session_manager(websocket: WebSocket) -> RuntimeSessionManager:
    return websocket.app.state.runtime_session_manager


@router.websocket("/ws")
async def runtime_websocket(websocket: WebSocket) -> None:
    manager = get_runtime_session_manager(websocket)
    await websocket.accept()
    session = manager.connect()

    try:
        await websocket.send_json(
            RuntimeServerMessage(
                type="session_connected",
                active_sessions=manager.active_session_count,
                detail="Runtime session connected.",
                session_id=session.id,
            ).model_dump()
        )

        while True:
            payload = await websocket.receive_json()
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
                continue

            await websocket.send_json(build_runtime_ack(session.id, message).model_dump())
    except WebSocketDisconnect:
        manager.disconnect(session)


def build_runtime_ack(session_id: str, message: RuntimeClientMessage) -> RuntimeServerMessage:
    if isinstance(message, RuntimePingMessage):
        return RuntimeServerMessage(type="pong", detail="Runtime session is alive.", session_id=session_id)

    if isinstance(message, RuntimeSubscribeTopicMessage):
        return RuntimeServerMessage(
            type="subscription_ack",
            detail=f"Subscribed to {message.topic}.",
            payload={
                "field_path": message.field_path,
                "message_type": message.message_type,
                "topic": message.topic,
            },
            session_id=session_id,
        )

    if isinstance(message, RuntimeTeleopCommandMessage):
        return RuntimeServerMessage(
            type="teleop_ack",
            detail="Teleop command accepted by runtime session.",
            payload={
                "axes": message.axes,
                "mode": message.mode,
                "seq": message.seq,
            },
            session_id=session_id,
        )

    return RuntimeServerMessage(type="runtime_error", detail="Unsupported runtime message.", session_id=session_id)
