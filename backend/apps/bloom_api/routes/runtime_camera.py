"""Camera frames both ways: browser frames published to ROS, and the per-widget frame stream socket."""

import asyncio
import logging
from contextlib import suppress

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from apps.bloom_api.routes.runtime_common import (
    audited_rejection,
    cancel_runtime_task,
    get_camera_frame_gateway,
    get_camera_stream_gateway,
    get_runtime_audit_log,
    get_runtime_command_policy,
    get_runtime_command_rate_limiter,
    get_runtime_stop_controller,
)
from apps.bloom_api.security import (
    BloomPrincipal,
    execute_as_runtime_owner,
    require_runtime_owner,
    require_runtime_websocket_principal,
    select_runtime_websocket_subprotocol,
)
from libs.ros_adapters.camera_frames import (
    CameraFrameError,
    NoopCameraFrameGateway,
    decode_image_data_url,
)
from libs.ros_adapters.camera_streams import (
    CameraStreamFrame,
    CameraStreamHandle,
    NoopCameraStreamGateway,
)
from libs.ros_adapters.safety import (
    RuntimeCommandPolicyError,
)
from libs.sessions import (
    RuntimeAuditRecord,
    RuntimeRateLimitError,
    RuntimeStoppedError,
)

logger = logging.getLogger(__name__)

router = APIRouter()


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

    def reject(status_code: int, detail: str) -> HTTPException:
        return audited_rejection(
            audit_log,
            status_code,
            channel="http_camera_frame",
            detail=detail,
            message_type="sensor_msgs/msg/CompressedImage",
            topic=payload.topic,
        )

    # The allowlist runs first: counting an unknown topic would let any string
    # in a request body create a rate-limit bucket that is never collected.
    try:
        policy.ensure_publish_allowed(payload.topic, "sensor_msgs/msg/CompressedImage", {})
    except RuntimeCommandPolicyError as exc:
        raise reject(403, str(exc)) from exc

    # Frames are megabytes each. Without a limit a camera widget stuck in a
    # retry loop would saturate the backend and the ROS graph, so this is rate
    # limited like every other robot-facing command.
    try:
        get_runtime_command_rate_limiter(request).ensure_allowed(f"http_camera_frame:{payload.topic}")
    except RuntimeRateLimitError as exc:
        raise reject(429, str(exc)) from exc

    try:
        frame = decode_image_data_url(payload.image_data_url)
    except CameraFrameError as exc:
        raise reject(422, str(exc)) from exc

    stop_controller = get_runtime_stop_controller(request)
    try:
        execute_as_runtime_owner(
            request,
            lambda: stop_controller.execute_if_running(lambda: gateway.publish(payload.topic, frame, payload.frame_id)),
        )
    except RuntimeStoppedError as exc:
        raise reject(409, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    # Every other Noop seam says "simulated"; a frame that reached nothing must not claim otherwise.
    published = not isinstance(gateway, NoopCameraFrameGateway)
    detail = (
        f"Published {frame.image_format} frame of {len(frame.image_bytes)} bytes."
        if published
        else f"Accepted {frame.image_format} frame of {len(frame.image_bytes)} bytes, "
        "but no ROS camera publisher is connected, so it reached no topic."
    )
    audit_log.record(
        RuntimeAuditRecord(
            channel="http_camera_frame",
            detail=detail,
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
        status="published" if published else "simulated",
        detail=detail,
    )


@router.websocket("/camera")
async def runtime_camera_websocket(websocket: WebSocket) -> None:
    """Stream one ROS camera topic as binary frames.

    Separate from `/ws` on purpose: a frame is hundreds of times larger than a
    twist, and putting the two on one socket makes a slow image delay the
    telemetry an operator is steering by. Watching needs no control lease, for
    the same reason STOP does not: a locked-out session should still see.
    """
    await require_runtime_websocket_principal(websocket)
    topic = websocket.query_params.get("topic", "").strip()
    await websocket.accept(subprotocol=select_runtime_websocket_subprotocol(websocket))

    if not topic.startswith("/") or any(character.isspace() for character in topic):
        await websocket.close(code=1008, reason="A camera topic must start with / and carry no whitespace.")
        return

    gateway = get_camera_stream_gateway(websocket)
    event_loop = asyncio.get_running_loop()
    # One slot: an operator judging where the gripper is wants the newest frame, never a backlog.
    frames: asyncio.Queue[CameraStreamFrame] = asyncio.Queue(maxsize=1)
    handle: CameraStreamHandle | None = None
    receive_task: asyncio.Task | None = None
    frame_task: asyncio.Task | None = None

    try:
        handle = gateway.subscribe(
            topic,
            lambda frame: event_loop.call_soon_threadsafe(enqueue_camera_frame, frames, frame),
        )
    except (RuntimeError, ValueError) as error:
        logger.warning("Cannot stream camera topic %s: %s", topic, error)
        await websocket.close(code=1011, reason=str(error))
        return

    try:
        # Said once, before any frame: "waiting for a frame" and "no ROS here" look identical otherwise.
        await websocket.send_json(
            {
                "type": "camera_stream_opened",
                "topic": topic,
                "connected": not isinstance(gateway, NoopCameraStreamGateway),
            }
        )
        receive_task = asyncio.create_task(websocket.receive_text())
        frame_task = asyncio.create_task(frames.get())
        while True:
            done, _ = await asyncio.wait({receive_task, frame_task}, return_when=asyncio.FIRST_COMPLETED)
            if receive_task in done:
                # The client sends nothing; this task exists so a disconnect lands here.
                receive_task.result()
                receive_task = asyncio.create_task(websocket.receive_text())
            if frame_task in done:
                await websocket.send_bytes(frame_task.result().image_bytes)
                frame_task = asyncio.create_task(frames.get())
    except WebSocketDisconnect:
        pass
    finally:
        if handle is not None:
            handle.close()
        await cancel_runtime_task(receive_task)
        await cancel_runtime_task(frame_task)


def enqueue_camera_frame(frames: asyncio.Queue[CameraStreamFrame], frame: CameraStreamFrame) -> None:
    """Keep the newest frame. A frame nobody has read yet is already stale."""
    try:
        frames.put_nowait(frame)
    except asyncio.QueueFull:
        with suppress(asyncio.QueueEmpty):
            frames.get_nowait()
        frames.put_nowait(frame)
