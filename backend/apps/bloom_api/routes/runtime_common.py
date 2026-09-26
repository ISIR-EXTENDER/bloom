"""What every runtime route reaches for: the app-state gateways, the refusal helpers, the control snapshot."""

import asyncio
import logging
from collections.abc import Callable
from dataclasses import asdict, dataclass, replace
from functools import partial
from typing import Any

from fastapi import HTTPException, Request, WebSocket, WebSocketDisconnect

from apps.bloom_api.settings import Settings
from libs.config import (
    ApplicationConfig,
    ConfigurationNotFoundError,
    ConfigurationUnreadableError,
)
from libs.ros_adapters import (
    RosPublisherGateway,
)
from libs.ros_adapters.camera_frames import (
    NoopCameraFrameGateway,
)
from libs.ros_adapters.camera_streams import (
    CameraStreamGateway,
    NoopCameraStreamGateway,
)
from libs.ros_adapters.safety import (
    RuntimeCommandPolicy,
)
from libs.sessions import (
    RuntimeAuditLog,
    RuntimeAuditRecord,
    RuntimeCommandRateLimiter,
    RuntimeControlSnapshot,
    RuntimeRecordingGateway,
    RuntimeServerMessage,
    RuntimeSessionManager,
    RuntimeStopController,
    RuntimeTopicSubscriptionGateway,
    TeleopCommandGateway,
)

logger = logging.getLogger(__name__)


def get_runtime_session_manager(websocket: WebSocket) -> RuntimeSessionManager:
    return websocket.app.state.runtime_session_manager


def get_teleop_command_gateway(websocket: WebSocket) -> TeleopCommandGateway:
    return websocket.app.state.teleop_command_gateway


def get_runtime_topic_subscription_gateway(websocket: WebSocket) -> RuntimeTopicSubscriptionGateway:
    return websocket.app.state.runtime_topic_subscription_gateway


def get_camera_stream_gateway(websocket: WebSocket) -> CameraStreamGateway:
    gateway = getattr(websocket.app.state, "camera_stream_gateway", None)
    return gateway if gateway is not None else NoopCameraStreamGateway()


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
    policy = connection.app.state.runtime_command_policy
    directory = getattr(connection.app.state, "teleop_target_directory", None)
    return policy if directory is None else replace(policy, allowed_teleop_targets=directory.targets())


def get_runtime_command_rate_limiter(connection: Request | WebSocket) -> RuntimeCommandRateLimiter:
    return connection.app.state.runtime_command_rate_limiter


def get_runtime_recording_gateway(request: Request) -> RuntimeRecordingGateway:
    return request.app.state.runtime_recording_gateway


def get_ros_publisher_gateway(request: Request) -> RosPublisherGateway:
    return request.app.state.ros_publisher_gateway


def get_allowed_recording_output_folders(request: Request) -> tuple[str, ...]:
    return request.app.state.settings.allowed_recording_output_folders


def runtime_error(
    session_id: str, detail: str, payload: dict[str, Any] | None = None, **fields: Any
) -> RuntimeServerMessage:
    """The answer to a request the runtime refuses; the socket stays open."""
    return RuntimeServerMessage(
        type="runtime_error",
        detail=detail,
        session_id=session_id,
        **({"payload": payload} if payload is not None else {}),
        **fields,
    )


def audited_rejection(audit_log: RuntimeAuditLog, status_code: int, **record: Any) -> HTTPException:
    """Record a refused request and hand back the HTTP error to raise for it."""
    audit_log.record(RuntimeAuditRecord(status="rejected", **record))
    return HTTPException(status_code=status_code, detail=record["detail"])


MAX_TOPIC_SUBSCRIPTIONS_PER_SESSION = 64


@dataclass
class RuntimeSocketPolicy:
    """What this socket may command: the deployment policy until an app narrows it."""

    policy: RuntimeCommandPolicy
    application: ApplicationConfig | None = None

    def current(self, connection: Request | WebSocket) -> RuntimeCommandPolicy:
        """Recomputed per command, so a manager input that appears after the tablet connected is accepted."""
        deployment = get_runtime_command_policy(connection)
        self.policy = (
            deployment if self.application is None else narrow_policy_to_application(deployment, self.application)
        )
        return self.policy


def narrow_policy_to_application(
    policy: RuntimeCommandPolicy,
    application: ApplicationConfig,
) -> RuntimeCommandPolicy:
    """Intersect the deployment policy with the app's own, as `/runtime/actions` does.

    An empty teleop or service list in an app means none, which is how an app
    such as Bloom Debug declares that it drives nothing.
    """
    application_policy = application.runtime_policy
    return RuntimeCommandPolicy(
        allowed_message_types=narrow_allowlist(
            policy.allowed_message_types, application_policy.allowed_message_types or ("*",)
        ),
        allowed_publish_topics=narrow_allowlist(
            policy.allowed_publish_topics, application_policy.allowed_publish_topics or ("*",)
        ),
        allowed_recording_topics=policy.allowed_recording_topics,
        allowed_service_calls=narrow_allowlist(policy.allowed_service_calls, application_policy.allowed_service_calls),
        allowed_service_types=policy.allowed_service_types,
        allowed_teleop_targets=narrow_allowlist(
            policy.allowed_teleop_targets, application_policy.allowed_teleop_targets
        ),
        # The app names the parameters it tunes; none named means it tunes none.
        allowed_parameters=narrow_allowlist(policy.allowed_parameters, application_policy.allowed_parameters),
    )


def narrow_allowlist(deployment: tuple[str, ...], application: tuple[str, ...]) -> tuple[str, ...]:
    if "*" in application:
        return deployment
    if "*" in deployment:
        return application
    # Namespace-aware: a deployment "/ui/" and an app "/ui/widget_lab/gesture" meet at the topic. A literal
    # intersection dropped it, and the Widget Lab's gesture pad was refused.
    kept = [value for value in application if allowlist_grants(deployment, value)]
    kept += [value for value in deployment if allowlist_grants(application, value)]
    return tuple(dict.fromkeys(kept))


def allowlist_grants(entries: tuple[str, ...], value: str) -> bool:
    """The rule `ensure_allowed` applies: exact, `*`, or an entry ending in `/` granting its namespace."""
    return (
        "*" in entries
        or value in entries
        or any(entry.endswith("/") and entry != "/" and value.startswith(entry) for entry in entries)
    )


def find_runtime_application(connection: Request | WebSocket, config_id: str, app_id: str) -> ApplicationConfig | None:
    try:
        bundle = connection.app.state.configuration_repository.get(config_id)
    except (ConfigurationNotFoundError, ConfigurationUnreadableError, ValueError):
        return None
    return next((application for application in bundle.applications if application.id == app_id), None)


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


async def run_runtime_thread(operation: Callable[..., Any], *args: Any) -> Any:
    """Finish safety work even when socket shutdown cancels its handler.

    The work is handed to a thread before the first await. A task wrapping
    to_thread only reaches the executor on its first loop iteration, and a
    handler cancelled before then dropped the disconnect neutralization.
    """
    future = asyncio.get_running_loop().run_in_executor(None, partial(operation, *args))
    try:
        return await asyncio.shield(future)
    except asyncio.CancelledError:
        return await future


def record_runtime_control(audit_log: RuntimeAuditLog, session_id: str, accepted: bool, detail: str) -> None:
    audit_log.record(
        RuntimeAuditRecord(
            channel="runtime_control",
            detail=detail,
            session_id=session_id,
            status="accepted" if accepted else "rejected",
        )
    )


async def cancel_runtime_task(task: asyncio.Task | None) -> None:
    if task is None:
        return

    if not task.done():
        task.cancel()

    try:
        await task
    except (asyncio.CancelledError, WebSocketDisconnect):
        return
