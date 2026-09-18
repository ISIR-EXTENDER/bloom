"""Refuse an oversized request body before anything reads it.

Starlette hands the route a fully buffered body, and FastAPI resolves dependencies afterwards, so the
API key is checked only once the whole thing is in memory. An unauthenticated caller therefore chose
how much the backend allocated, and this backend is the one driving the arm.

The camera frame is the largest thing Bloom legitimately accepts, at 8 MB of image; base64 and the
surrounding JSON need roughly a third more again.
"""

from __future__ import annotations

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from libs.ros_adapters.camera_frames import MAX_IMAGE_BYTES

#: The largest body any Bloom route has a use for, with room for base64 and the JSON around it.
MAX_REQUEST_BODY_BYTES = MAX_IMAGE_BYTES * 2


class RequestBodyLimitMiddleware:
    """Answer 413 on a body over the limit, by declared length and again as it arrives."""

    def __init__(self, app: ASGIApp, max_body_bytes: int = MAX_REQUEST_BODY_BYTES) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared = _declared_length(scope)
        if declared is not None and declared > self.max_body_bytes:
            await _refuse(send)
            return

        received = 0

        async def receive_within_limit() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_body_bytes:
                    # Nothing further is read, so a chunked body cannot grow past this either.
                    return {"type": "http.disconnect"}
            return message

        await self.app(scope, receive_within_limit, send)


def _declared_length(scope: Scope) -> int | None:
    for name, value in scope.get("headers", ()):
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                return None
    return None


async def _refuse(send: Send) -> None:
    await send(
        {
            "type": "http.response.start",
            "status": 413,
            "headers": [(b"content-type", b"application/json")],
        }
    )
    await send({"type": "http.response.body", "body": b'{"detail":"request body is too large"}'})
