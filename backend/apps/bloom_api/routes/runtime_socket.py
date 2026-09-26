"""The runtime WebSocket: one session per socket, its control lease, teleop acks and topic samples."""

import asyncio
import logging
from collections.abc import Callable
from contextlib import suppress
from dataclasses import asdict
from json import JSONDecodeError
from time import monotonic

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from apps.bloom_api.routes.runtime_common import (
    MAX_TOPIC_SUBSCRIPTIONS_PER_SESSION,
    RuntimeSocketPolicy,
    build_runtime_control_message,
    cancel_runtime_task,
    get_allowed_command_frame_ids,
    get_runtime_audit_log,
    get_runtime_command_policy,
    get_runtime_command_rate_limiter,
    get_runtime_control_snapshot,
    get_runtime_session_manager,
    get_runtime_stop_controller,
    get_runtime_topic_subscription_gateway,
    get_teleop_command_gateway,
    record_runtime_control,
    run_runtime_thread,
    runtime_control_detail,
    runtime_error,
)
from apps.bloom_api.security import (
    BloomPrincipal,
    require_runtime_websocket_principal,
    select_runtime_websocket_subprotocol,
)
from libs.ros_adapters.mode_request import DEFAULT_GEOMETRIC_MODE
from libs.ros_adapters.safety import (
    RuntimeCommandPolicy,
)
from libs.sessions import (
    RuntimeAppContextMessage,
    RuntimeAuditLog,
    RuntimeAuditRecord,
    RuntimeClaimControlMessage,
    RuntimeClientMessage,
    RuntimeCommandRateLimiter,
    RuntimePingMessage,
    RuntimeReleaseControlMessage,
    RuntimeServerMessage,
    RuntimeSession,
    RuntimeSessionLimitError,
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
    RuntimeUnsubscribeTopicMessage,
    TeleopCommand,
    TeleopCommandGateway,
    TeleopVector3,
    parse_runtime_client_message,
)
from libs.sessions.manager import VISUAL_SERVOING_OFF
from libs.sessions.stop import VISUAL_SERVOING_ON_TOPIC
from libs.sessions.teleop_runtime import build_teleop_ack, to_teleop_command
from libs.sessions.topic_sample_throttle import TopicSampleThrottle
from libs.sessions.topics import is_live_subscription_gateway

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws")
async def runtime_websocket(websocket: WebSocket) -> None:
    principal = await require_runtime_websocket_principal(websocket)
    manager = get_runtime_session_manager(websocket)
    await websocket.accept(subprotocol=select_runtime_websocket_subprotocol(websocket))
    try:
        # Before anything else is set up, so a refusal leaves nothing behind. A principal that cannot
        # command takes a session from the reserved half, so mirrors cannot crowd out the operator.
        session = manager.connect(read_only=not principal.is_operator)
    except RuntimeSessionLimitError as exc:
        await websocket.send_json(
            runtime_error(
                "",
                "Runtime session refused: this robot already has enough connections.",
                {"code": "session_limit", "message": str(exc)},
                active_sessions=manager.active_session_count,
            ).model_dump()
        )
        await websocket.close(code=1013, reason="Too many runtime sessions.")
        return
    event_loop = asyncio.get_running_loop()
    topic_samples: asyncio.Queue[RuntimeTopicSample] = asyncio.Queue(maxsize=100)
    # A display cannot use more than a few dozen samples a second per topic; the wire should not carry more.
    sample_throttle = TopicSampleThrottle(
        event_loop,
        websocket.app.state.settings.runtime_topic_max_rate_hz,
        lambda sample: enqueue_topic_sample(topic_samples, sample),
    )
    # Keyed by widget and topic: a screen that subscribes again replaces its own
    # handle instead of stacking a second subscription on the same topic.
    topic_subscription_handles: dict[str, RuntimeTopicSubscriptionHandle] = {}
    # Deployment-wide until the client names the app it is running.
    socket_policy = RuntimeSocketPolicy(policy=get_runtime_command_policy(websocket))
    receive_task: asyncio.Task | None = None
    sample_task: asyncio.Task | None = None
    message_budget = SocketMessageBudget()

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
                # A frame that is not JSON, or not text at all, is one client's mistake. Answering it the
                # way an unparseable message is already answered keeps the operator's lease and their
                # telemetry; unwinding here used to drop both and force a reconnect.
                try:
                    payload = receive_task.result()
                except (JSONDecodeError, KeyError, UnicodeDecodeError) as exc:
                    await websocket.send_json(
                        runtime_error(session.id, "Invalid runtime message.", {"message": str(exc)}).model_dump()
                    )
                    receive_task = asyncio.create_task(websocket.receive_json())
                    continue
                if not message_budget.allow(payload):
                    await websocket.send_json(
                        runtime_error(
                            session.id,
                            "Runtime message refused: this session is sending too many.",
                            {"code": "message_rate_limited", "message": "Slow down and send it again."},
                        ).model_dump()
                    )
                    receive_task = asyncio.create_task(websocket.receive_json())
                    continue
                await handle_runtime_client_payload(
                    websocket,
                    session,
                    manager,
                    payload,
                    event_loop,
                    sample_throttle,
                    topic_subscription_handles,
                    principal,
                    socket_policy,
                )
                receive_task = asyncio.create_task(websocket.receive_json())

            if sample_task in done_tasks:
                sample = sample_task.result()
                await websocket.send_json(build_runtime_topic_sample(session.id, sample).model_dump())
                sample_task = asyncio.create_task(topic_samples.get())
    except WebSocketDisconnect:
        pass
    finally:
        sample_throttle.close()
        # Whatever the handover does, the rclpy subscriptions and both tasks have to go: a lease that moved on
        # while this socket was closing used to raise here and leak them for the life of the process.
        try:
            release_started = (
                manager.begin_control_release(session)
                if websocket.app.state.settings.runtime_control_required
                else False
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
                # Zeroing belongs to "this session was commanding", not to the lease feature. Without the
                # lease a disconnect used to leave the last non-zero twist standing; cartesian_manager
                # expires it after 0.2 s, but the legacy /teleop_cmd path has no such timeout. There is
                # no release to wait for here, so the neutralize step runs on its own.
                if (
                    manager.moving_teleop_commands(session)
                    or manager.pending_joint_target(session)
                    or manager.pending_shaping_reset(session)
                    or manager.pending_visual_servoing_off(session)
                ):
                    await run_runtime_thread(
                        neutralize_runtime_session,
                        manager,
                        session,
                        get_teleop_command_gateway(websocket),
                        get_runtime_stop_controller(websocket),
                        get_runtime_audit_log(websocket),
                    )
                manager.disconnect(session)
        except Exception:
            logger.exception("Runtime session %s failed to release control on disconnect.", session.id)
            manager.disconnect(session)
        finally:
            for handle in topic_subscription_handles.values():
                handle.close()
            await cancel_runtime_task(receive_task)
            await cancel_runtime_task(sample_task)


#: Keep-alives and teleop, which has its own command rate limit, are never throttled here.
UNMETERED_MESSAGE_TYPES = frozenset({"ping", "teleop_cmd"})
#: A screen switch unsubscribes the old screen and subscribes the new one, up to the session cap each way.
SUBSCRIPTION_MESSAGE_TYPES = frozenset({"subscribe_topic", "unsubscribe_topic"})
SUBSCRIPTION_BURST = 2 * MAX_TOPIC_SUBSCRIPTIONS_PER_SESSION + 32


class TokenBucket:
    def __init__(self, rate_per_sec: float, burst: float, clock: Callable[[], float]) -> None:
        self._rate = rate_per_sec
        self._burst = burst
        self._clock = clock
        self._tokens = burst
        self._updated = clock()

    def take(self) -> bool:
        now = self._clock()
        self._tokens = min(self._burst, self._tokens + (now - self._updated) * self._rate)
        self._updated = now
        if self._tokens < 1:
            return False
        self._tokens -= 1
        return True


class SocketMessageBudget:
    """Token buckets per socket, so a client looping on subscribe or app_context cannot busy the server."""

    def __init__(
        self,
        rate_per_sec: float = 20.0,
        burst: float = 40.0,
        clock: Callable[[], float] = monotonic,
        subscription_rate_per_sec: float = 64.0,
        subscription_burst: float = SUBSCRIPTION_BURST,
    ) -> None:
        self._messages = TokenBucket(rate_per_sec, burst, clock)
        self._subscriptions = TokenBucket(subscription_rate_per_sec, subscription_burst, clock)

    def allow(self, payload: object) -> bool:
        message_type = payload.get("type") if isinstance(payload, dict) else None
        if message_type in UNMETERED_MESSAGE_TYPES:
            return True
        if message_type in SUBSCRIPTION_MESSAGE_TYPES:
            return self._subscriptions.take()
        return self._messages.take()


async def handle_runtime_client_payload(
    websocket: WebSocket,
    session: RuntimeSession,
    manager: RuntimeSessionManager,
    payload: dict,
    event_loop: asyncio.AbstractEventLoop,
    sample_throttle: TopicSampleThrottle,
    topic_subscription_handles: dict[str, RuntimeTopicSubscriptionHandle],
    principal: BloomPrincipal,
    socket_policy: RuntimeSocketPolicy,
) -> None:
    # Anything this session sends, a ping included, renews its control lease.
    manager.record_activity(session.id)
    try:
        message = parse_runtime_client_message(payload)
    except ValidationError as exc:
        await websocket.send_json(
            runtime_error(session.id, "Invalid runtime message.", {"message": str(exc)}).model_dump()
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
        # Deliberately not audited. The perimeter already knows this session can never command, so the
        # record carries nothing, and writing one per message let a read-only key push the operator's
        # own records out of a 500-entry log in about a second. The socket still answers.
        await websocket.send_json(
            runtime_error(
                session.id,
                "Runtime command rejected: this session is read-only.",
                {"code": "observer_read_only", "message": detail},
            ).model_dump()
        )
        return

    if isinstance(message, RuntimeAppContextMessage):
        await websocket.send_json(apply_runtime_app_context(websocket, session, message, socket_policy).model_dump())
        return

    if isinstance(message, RuntimeClaimControlMessage):
        control_message = claim_runtime_control(websocket, session, manager, audit_log)
        if manager.is_control_owner(session.id) and manager.has_orphaned_mode_resets():
            await run_runtime_thread(
                reset_orphaned_modes,
                manager,
                session,
                get_runtime_stop_controller(websocket),
                audit_log,
                get_teleop_command_gateway(websocket),
            )
        await websocket.send_json(control_message.model_dump())
        return

    if isinstance(message, RuntimeReleaseControlMessage):
        await websocket.send_json((await release_runtime_control(websocket, session, manager, audit_log)).model_dump())
        return

    owns_control = True
    if isinstance(message, RuntimeTeleopCommandMessage) and websocket.app.state.settings.runtime_control_required:
        owns_control = manager.is_control_owner(session.id)
    if isinstance(message, RuntimeTeleopCommandMessage) and not owns_control:
        detail = "Another runtime session owns robot control."
        record_runtime_control(audit_log, session.id, False, detail)
        await websocket.send_json(
            runtime_error(
                session.id,
                "Teleop command rejected: this session does not own control.",
                {"code": "control_not_owned", "message": detail, "target": message.target},
            ).model_dump()
        )
        return

    response = build_runtime_ack(
        session.id,
        message,
        get_teleop_command_gateway(websocket),
        get_runtime_topic_subscription_gateway(websocket),
        audit_log,
        socket_policy.current(websocket),
        get_runtime_command_rate_limiter(websocket),
        lambda sample: event_loop.call_soon_threadsafe(sample_throttle.offer, sample),
        topic_subscription_handles,
        get_runtime_stop_controller(websocket),
        get_allowed_command_frame_ids(websocket),
    )
    if isinstance(message, RuntimeTeleopCommandMessage) and response.type == "teleop_ack":
        manager.record_teleop_command(session, to_teleop_command(message))
    await websocket.send_json(response.model_dump())


def reset_orphaned_modes(
    manager: RuntimeSessionManager,
    session: RuntimeSession,
    stop_controller: RuntimeStopController,
    audit_log: RuntimeAuditLog,
    teleop_gateway: TeleopCommandGateway | None = None,
) -> None:
    """Undo the joint target or shaping mode a displaced stale owner left, before the new owner drives."""
    for zero in manager.take_orphaned_teleop_zeros() if teleop_gateway is not None else ():
        publish_orphaned_zero(teleop_gateway, zero, session, audit_log)
    for topic, mode in manager.take_orphaned_mode_resets():
        try:
            if mode == VISUAL_SERVOING_OFF:
                detail = stop_controller.turn_off_visual_servoing()
            else:
                detail = stop_controller.publish_mode_reset(topic, mode)
            status = "accepted"
        except RuntimeError as exc:
            detail = str(exc)
            status = "rejected"
        audit_log.record(
            RuntimeAuditRecord(
                channel="runtime_control", detail=detail, session_id=session.id, status=status, topic=topic
            )
        )


def publish_orphaned_zero(
    gateway: TeleopCommandGateway, zero: TeleopCommand, session: RuntimeSession, audit_log: RuntimeAuditLog
) -> None:
    try:
        detail = gateway.publish(zero).detail
        status = "accepted"
    except RuntimeError as exc:
        detail = str(exc)
        status = "rejected"
    audit_log.record(
        RuntimeAuditRecord(
            channel="runtime_control", detail=detail, session_id=session.id, status=status, target=zero.target
        )
    )


def claim_runtime_control(
    websocket: WebSocket, session: RuntimeSession, manager: RuntimeSessionManager, audit_log: RuntimeAuditLog
) -> RuntimeServerMessage:
    snapshot = (
        manager.claim_control(session)
        if websocket.app.state.settings.runtime_control_required
        else get_runtime_control_snapshot(websocket, manager, session.id)
    )
    record_runtime_control(audit_log, session.id, snapshot.is_owner, runtime_control_detail(snapshot))
    return build_runtime_control_message(snapshot)


async def release_runtime_control(
    websocket: WebSocket, session: RuntimeSession, manager: RuntimeSessionManager, audit_log: RuntimeAuditLog
) -> RuntimeServerMessage:
    """Let go of the lease once the arm is at rest; if it cannot be, STOP wins and the client hears why."""
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
        # wait_for_control_operations raises ValueError when the lease moved on mid-release, which is
        # exactly the case this path exists to answer; catching RuntimeError alone tore the socket down.
        except (RuntimeError, ValueError) as exc:
            try:
                await run_runtime_thread(
                    get_runtime_stop_controller(websocket).engage,
                    executor=getattr(websocket.app.state, "runtime_stop_executor", None),
                )
            except RuntimeStopAssertionError:
                pass
            snapshot = manager.finish_control_release(session)
            record_runtime_control(audit_log, session.id, False, str(exc))
            return runtime_error(
                session.id,
                "Robot control could not be released safely.",
                {**asdict(snapshot), "code": "control_release_failed", "message": str(exc)},
            )
    snapshot = (
        manager.finish_control_release(session)
        if release_started
        else get_runtime_control_snapshot(websocket, manager, session.id)
    )
    record_runtime_control(audit_log, session.id, True, "Robot control released.")
    return build_runtime_control_message(snapshot)


def apply_runtime_app_context(
    websocket: WebSocket,
    session: RuntimeSession,
    message: RuntimeAppContextMessage,
    socket_policy: RuntimeSocketPolicy,
) -> RuntimeServerMessage:
    """Narrow this socket to the app it is running.

    Without it the socket only knew the deployment policy, so an app that
    declares no teleop target of its own could still stream teleop.
    """
    application = socket_policy.find_application(websocket, message.config_id, message.app_id)
    if application is None:
        return runtime_error(
            session.id,
            "Runtime app context was refused: no such application.",
            {"code": "app_context_unknown", "app_id": message.app_id, "config_id": message.config_id},
        )

    socket_policy.application = application
    socket_policy.current(websocket)
    return RuntimeServerMessage(
        type="app_context_ack",
        detail=f"Runtime commands are now limited to what '{application.name}' allows.",
        payload={
            "allowed_teleop_targets": list(socket_policy.policy.allowed_teleop_targets),
            "app_id": message.app_id,
            "config_id": message.config_id,
        },
        session_id=session.id,
    )


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
        # A joint target runs to its pose with nobody left to stop it; cancel it the way STOP does.
        cancel_topic = manager.pending_joint_target(session)
        if cancel_topic is not None:
            detail = stop_controller.cancel_joint_target(cancel_topic)
            manager.clear_joint_target(session)
            audit_log.record(
                RuntimeAuditRecord(
                    channel="runtime_control",
                    detail=detail,
                    session_id=session.id,
                    status="accepted",
                    topic=cancel_topic,
                )
            )
        # A held Snake whose release never came would shape the next operator's motion.
        shaping_topic = manager.pending_shaping_reset(session)
        if shaping_topic is not None:
            detail = stop_controller.publish_mode_reset(shaping_topic, DEFAULT_GEOMETRIC_MODE)
            manager.clear_shaping_reset(session)
            audit_log.record(
                RuntimeAuditRecord(
                    channel="runtime_control",
                    detail=detail,
                    session_id=session.id,
                    status="accepted",
                    topic=shaping_topic,
                )
            )
        # The servoing node keeps commanding while its switch is on, whoever is driving next.
        if manager.pending_visual_servoing_off(session):
            detail = stop_controller.turn_off_visual_servoing()
            manager.clear_visual_servoing(session)
            audit_log.record(
                RuntimeAuditRecord(
                    channel="runtime_control",
                    detail=detail,
                    session_id=session.id,
                    status="accepted",
                    topic=VISUAL_SERVOING_ON_TOPIC,
                )
            )
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

    if isinstance(message, RuntimeUnsubscribeTopicMessage):
        key = topic_subscription_key(message.widget_id, message.topic)
        handle = topic_subscription_handles.pop(key, None) if topic_subscription_handles is not None else None
        if handle is not None:
            handle.close()
        return RuntimeServerMessage(
            type="unsubscription_ack",
            detail=f"Unsubscribed from {message.topic}." if handle else f"No subscription to {message.topic} was open.",
            payload={"removed": handle is not None, "topic": message.topic, "widget_id": message.widget_id},
            session_id=session_id,
        )

    if isinstance(message, RuntimeSubscribeTopicMessage):
        if topic_subscription_gateway and on_topic_sample and topic_subscription_handles is not None:
            subscription_key = topic_subscription_key(message.widget_id, message.topic)
            if (
                subscription_key not in topic_subscription_handles
                and len(topic_subscription_handles) >= MAX_TOPIC_SUBSCRIPTIONS_PER_SESSION
            ):
                return runtime_error(
                    session_id,
                    "Topic subscription could not be started.",
                    {
                        "message": f"a session may hold at most {MAX_TOPIC_SUBSCRIPTIONS_PER_SESSION} subscriptions",
                        "topic": message.topic,
                    },
                )
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
                return runtime_error(
                    session_id,
                    "Topic subscription could not be started.",
                    {"message": str(exc), "topic": message.topic},
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

    return runtime_error(session_id, "Unsupported runtime message.")


def topic_subscription_key(widget_id: str, topic: str) -> str:
    """A widget re-asking for its topic replaces its handle; a new topic under the same id stands apart."""
    return f"{widget_id} {topic}"


def enqueue_topic_sample(topic_samples: asyncio.Queue[RuntimeTopicSample], sample: RuntimeTopicSample) -> None:
    try:
        topic_samples.put_nowait(sample)
    except asyncio.QueueFull:
        with suppress(asyncio.QueueEmpty):
            topic_samples.get_nowait()
        topic_samples.put_nowait(sample)


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
