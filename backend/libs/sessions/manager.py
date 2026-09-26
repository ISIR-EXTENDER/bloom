from collections.abc import Callable
from dataclasses import dataclass
from threading import Lock
from time import monotonic
from typing import TypeVar
from uuid import uuid4

from libs.ros_adapters.mode_request import (
    DEFAULT_GEOMETRIC_MODE,
    GEOMETRIC_PREFIX,
    ModeRequestError,
    parse_mode_request,
)
from libs.sessions.stop import VISUAL_SERVOING_ON_TOPIC
from libs.sessions.teleop import TeleopCommand

T = TypeVar("T")
STOP_MODE_REQUEST = "behaviour/passthrough"
#: Marks an orphaned reset that switches visual servoing off rather than publishing a mode request.
VISUAL_SERVOING_OFF = "visual_servoing/off"
#: Sockets one backend serves at once. Each may hold 64 ROS subscriptions, and
#: a robot is driven by one operator with a few mirrors beside it, so anything
#: past this is a client reconnecting in a loop rather than a room full of
#: tablets.
MAX_RUNTIME_SESSIONS = 32
#: How long an owner may say nothing at all before another operator may take
#: the lease. The dashboard pings every 3 s, so a live but idle tablet is never
#: stale; a tablet that lost Wi-Fi with its socket still open is displaced
#: after five dashboard status polls rather than never.
CONTROL_LEASE_TIMEOUT_SEC = 10.0


@dataclass(frozen=True)
class RuntimeSession:
    id: str


@dataclass(frozen=True)
class RuntimeControlSnapshot:
    active_sessions: int
    is_owner: bool
    owner_present: bool
    session_id: str
    #: What the operator who holds control is actually doing, so a supervisor
    #: reads the session's state instead of its own browser's copy of it.
    owner_frame_id: str = ""
    owner_mode_request: str = ""
    owner_moving: bool = False


class RuntimeControlNotOwnedError(RuntimeError):
    """Raised when a command loses the runtime control lease."""


class RuntimeSessionLimitError(RuntimeError):
    """Raised when the backend already holds every session it serves."""


class RuntimeSessionManager:
    def __init__(
        self,
        max_sessions: int = MAX_RUNTIME_SESSIONS,
        lease_timeout_sec: float = CONTROL_LEASE_TIMEOUT_SEC,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self._max_sessions = max_sessions
        self._max_read_only_sessions = max(1, max_sessions // 2)
        self._lease_timeout_sec = lease_timeout_sec
        self._clock = clock
        self._last_seen: dict[str, float] = {}
        self._sessions: set[str] = set()
        self._read_only_sessions: set[str] = set()
        self._owner_session_id: str | None = None
        self._releasing_session_id: str | None = None
        self._teleop_commands: dict[str, dict[str, TeleopCommand]] = {}
        self._mode_requests: dict[str, str] = {}
        self._frame_ids: dict[str, str] = {}
        #: The mode-request topic a session sent a joint target on, until something cancels it.
        self._joint_target_topics: dict[str, str] = {}
        #: The mode-request topic a session left a shaping mode other than geometric/both on.
        self._shaping_topics: dict[str, str] = {}
        #: Sessions that last switched visual servoing on, until someone switches it off.
        self._visual_servoing_sessions: set[str] = set()
        #: Resets a stale owner's lease left behind, for whoever claims control next.
        self._orphaned_mode_resets: list[tuple[str, str]] = []
        self._lock = Lock()
        self._operation_lock = Lock()

    @property
    def active_session_count(self) -> int:
        with self._lock:
            return len(self._sessions)

    def connect(self, *, read_only: bool = False) -> RuntimeSession:
        """Take a session, keeping room for the people who can actually drive.

        Mirrors and other read-only clients share half the cap between them. Handed out first come
        first served, enough of them filled every slot, and the operator was then refused the socket
        they need to claim control or to resume after a STOP: the arm stays latched and undriveable.
        """
        session = RuntimeSession(id=str(uuid4()))
        with self._lock:
            if read_only and len(self._read_only_sessions) >= self._max_read_only_sessions:
                raise RuntimeSessionLimitError(
                    f"This robot already has {self._max_read_only_sessions} read-only sessions connected. "
                    "Close a supervisor mirror and try again."
                )
            if len(self._sessions) >= self._max_sessions:
                raise RuntimeSessionLimitError(
                    f"This robot already has {self._max_sessions} runtime sessions connected. "
                    "Close a Bloom tab or mirror and try again."
                )
            self._sessions.add(session.id)
            if read_only:
                self._read_only_sessions.add(session.id)
            self._last_seen[session.id] = self._clock()
        return session

    def record_activity(self, session_id: str) -> None:
        """Any message from a session, a ping included, proves it is still there."""
        with self._lock:
            if session_id in self._sessions:
                self._last_seen[session_id] = self._clock()

    def disconnect(self, session: RuntimeSession) -> None:
        with self._lock:
            self._sessions.discard(session.id)
            self._read_only_sessions.discard(session.id)
            self._last_seen.pop(session.id, None)
            self._teleop_commands.pop(session.id, None)
            self._mode_requests.pop(session.id, None)
            self._frame_ids.pop(session.id, None)
            self._joint_target_topics.pop(session.id, None)
            self._shaping_topics.pop(session.id, None)
            self._visual_servoing_sessions.discard(session.id)
            if self._owner_session_id == session.id:
                self._owner_session_id = None
            if self._releasing_session_id == session.id:
                self._releasing_session_id = None

    def claim_control(self, session: RuntimeSession) -> RuntimeControlSnapshot:
        with self._lock:
            self._ensure_connected(session.id)
            self._last_seen[session.id] = self._clock()
            self._drop_a_stale_lease()
            if self._owner_session_id is None and self._releasing_session_id is None:
                self._owner_session_id = session.id
            return self._snapshot(session.id)

    def release_control(self, session: RuntimeSession) -> RuntimeControlSnapshot:
        if self.begin_control_release(session):
            self.wait_for_control_operations(session)
            return self.finish_control_release(session)
        with self._lock:
            self._ensure_connected(session.id)
            return self._snapshot(session.id)

    def begin_control_release(self, session: RuntimeSession) -> bool:
        """Immediately block new commands and claims before the final zero."""
        with self._lock:
            self._ensure_connected(session.id)
            if self._owner_session_id != session.id:
                return False
            self._releasing_session_id = session.id
            return True

    def wait_for_control_operations(self, session: RuntimeSession) -> None:
        """Wait until every operation accepted before release has completed."""
        with self._operation_lock:
            with self._lock:
                self._ensure_connected(session.id)
                if self._releasing_session_id != session.id:
                    raise ValueError("Runtime session is not releasing robot control.")

    def finish_control_release(self, session: RuntimeSession) -> RuntimeControlSnapshot:
        with self._lock:
            self._ensure_connected(session.id)
            if self._owner_session_id == session.id:
                self._owner_session_id = None
                self._teleop_commands.pop(session.id, None)
            if self._releasing_session_id == session.id:
                self._releasing_session_id = None
            return self._snapshot(session.id)

    def control_snapshot(self, session_id: str = "") -> RuntimeControlSnapshot:
        with self._lock:
            return self._snapshot(session_id)

    def is_control_owner(self, session_id: str) -> bool:
        with self._lock:
            return self._is_control_owner(session_id)

    def execute_if_control_owner(self, session_id: str, operation: Callable[[], T]) -> T:
        """Serialize robot operations with lease release and handover."""
        with self._operation_lock:
            with self._lock:
                if not self._is_control_owner(session_id):
                    raise RuntimeControlNotOwnedError("This runtime session does not own robot control.")
            return operation()

    def record_teleop_command(self, session: RuntimeSession, command: TeleopCommand) -> None:
        with self._lock:
            self._ensure_connected(session.id)
            # A frame change sends a zero, so the frame is kept even when nothing moves.
            if command.frame_id:
                self._frame_ids[session.id] = command.frame_id
            commands = self._teleop_commands.setdefault(session.id, {})
            if _is_zero_command(command):
                commands.pop(command.target, None)
                if not commands:
                    self._teleop_commands.pop(session.id, None)
                return
            commands[command.target] = command

    def record_mode_request(
        self, session_id: str, mode: str, topic: str = "/mode_request", *, require_owner: bool = False
    ) -> None:
        """Remember what the controlling session last asked the manager for.

        The manager publishes no mode feedback, so this is the last request,
        never a confirmed controller state.
        """
        try:
            request = parse_mode_request(mode)
        except ModeRequestError:
            return
        with self._lock:
            if not self._may_record(session_id, require_owner):
                return
            # A joint target fires once and is not a lasting mode, but it runs on after its sender leaves.
            if request.one_shot:
                self._joint_target_topics[session_id] = topic
                return
            self._mode_requests[session_id] = request.normalized
            if request.normalized.startswith(f"{GEOMETRIC_PREFIX}/"):
                if request.normalized == DEFAULT_GEOMETRIC_MODE:
                    self._shaping_topics.pop(session_id, None)
                else:
                    self._shaping_topics[session_id] = topic
            if request.normalized == STOP_MODE_REQUEST:
                self._joint_target_topics.pop(session_id, None)

    def record_published_mode_request(
        self, session_id: str, topic: str, payload: object, *, require_owner: bool = False
    ) -> None:
        """With the lease on, a session that no longer holds it records nothing its later disconnect would undo."""
        data = payload.get("data") if isinstance(payload, dict) else None
        if topic.endswith("mode_request") and isinstance(data, str):
            self.record_mode_request(session_id, data, topic, require_owner=require_owner)
        elif topic == VISUAL_SERVOING_ON_TOPIC and isinstance(data, bool):
            with self._lock:
                if not data:
                    self._visual_servoing_sessions.clear()
                elif self._may_record(session_id, require_owner):
                    self._visual_servoing_sessions.add(session_id)

    def pending_visual_servoing_off(self, session: RuntimeSession) -> bool:
        with self._lock:
            return session.id in self._visual_servoing_sessions

    def clear_visual_servoing(self, session: RuntimeSession) -> None:
        with self._lock:
            self._visual_servoing_sessions.discard(session.id)

    def pending_joint_target(self, session: RuntimeSession) -> str | None:
        """The mode-request topic to cancel on, when this session left a joint target running."""
        with self._lock:
            return self._joint_target_topics.get(session.id)

    def clear_joint_target(self, session: RuntimeSession) -> None:
        with self._lock:
            self._joint_target_topics.pop(session.id, None)

    def pending_shaping_reset(self, session: RuntimeSession) -> str | None:
        """The mode-request topic to send geometric/both on, when this session left Snake or another shaper set."""
        with self._lock:
            return self._shaping_topics.get(session.id)

    def clear_shaping_reset(self, session: RuntimeSession) -> None:
        with self._lock:
            self._shaping_topics.pop(session.id, None)

    def has_orphaned_mode_resets(self) -> bool:
        with self._lock:
            return bool(self._orphaned_mode_resets)

    def take_orphaned_mode_resets(self) -> tuple[tuple[str, str], ...]:
        """What a displaced stale owner left set, handed once to the session that now holds control."""
        with self._lock:
            resets = tuple(self._orphaned_mode_resets)
            self._orphaned_mode_resets.clear()
            return resets

    def record_runtime_stop(self, zeroed_target: str) -> None:
        """STOP zeroed that target and asked every session's manager for passthrough."""
        with self._lock:
            self._joint_target_topics.clear()
            self._visual_servoing_sessions.clear()
            for session_id in self._sessions:
                self._mode_requests[session_id] = STOP_MODE_REQUEST
                commands = self._teleop_commands.get(session_id, {})
                commands.pop(zeroed_target, None)
                if not commands:
                    self._teleop_commands.pop(session_id, None)

    def moving_teleop_targets(self) -> tuple[str, ...]:
        """Every target some session is driving now, including one granted through a namespace entry."""
        with self._lock:
            return tuple(dict.fromkeys(target for commands in self._teleop_commands.values() for target in commands))

    def moving_teleop_commands(self, session: RuntimeSession) -> tuple[TeleopCommand, ...]:
        with self._lock:
            return tuple(self._teleop_commands.get(session.id, {}).values())

    def clear_teleop_commands(self, session: RuntimeSession) -> None:
        with self._lock:
            self._teleop_commands.pop(session.id, None)

    def _snapshot(self, session_id: str) -> RuntimeControlSnapshot:
        owner_id = self._owner_session_id
        owner_commands = tuple(self._teleop_commands.get(owner_id or "", {}).values())
        # Only moving commands are kept, so any entry means the arm is driven.
        owner_frame_id = next((command.frame_id for command in owner_commands if command.frame_id), "") or (
            self._frame_ids.get(owner_id or "", "")
        )
        return RuntimeControlSnapshot(
            active_sessions=len(self._sessions),
            is_owner=self._is_control_owner(session_id),
            owner_present=owner_id is not None,
            session_id=session_id,
            owner_frame_id=owner_frame_id,
            owner_mode_request=self._mode_requests.get(owner_id or "", ""),
            owner_moving=bool(owner_commands),
        )

    def _drop_a_stale_lease(self) -> None:
        """A lease holds only while its session is still saying something.

        A tablet that loses Wi-Fi keeps its TCP socket open, and its lease used
        to block every other operator, and every resume, until that socket
        finally died.
        """
        owner_id = self._owner_session_id or self._releasing_session_id
        if owner_id is None:
            return
        last_seen = self._last_seen.get(owner_id)
        if last_seen is not None and self._clock() - last_seen <= self._lease_timeout_sec:
            return

        self._owner_session_id = None
        self._releasing_session_id = None
        # Whatever it last sent expired on the manager long before this. A joint target and a shaping mode do not
        # expire, and the old session's own disconnect must not undo the new owner's, so the next claim resets them.
        self._teleop_commands.pop(owner_id, None)
        joint_target_topic = self._joint_target_topics.pop(owner_id, None)
        if joint_target_topic is not None:
            self._orphaned_mode_resets.append((joint_target_topic, STOP_MODE_REQUEST))
        shaping_topic = self._shaping_topics.pop(owner_id, None)
        if shaping_topic is not None:
            self._orphaned_mode_resets.append((shaping_topic, DEFAULT_GEOMETRIC_MODE))
        if owner_id in self._visual_servoing_sessions:
            self._visual_servoing_sessions.discard(owner_id)
            self._orphaned_mode_resets.append((VISUAL_SERVOING_ON_TOPIC, VISUAL_SERVOING_OFF))

    def _may_record(self, session_id: str, require_owner: bool) -> bool:
        # The lease holder, releasing included: a release waits for this publish, then undoes what it recorded.
        if require_owner:
            return session_id in self._sessions and self._owner_session_id == session_id
        return session_id in self._sessions

    def _is_control_owner(self, session_id: str) -> bool:
        return (
            bool(session_id)
            and self._owner_session_id == session_id
            and self._releasing_session_id != session_id
            and session_id in self._sessions
        )

    def _ensure_connected(self, session_id: str) -> None:
        if session_id not in self._sessions:
            raise ValueError("Runtime session is not connected.")


def _is_zero_command(command: TeleopCommand) -> bool:
    return all(
        component == 0
        for component in (
            command.angular.x,
            command.angular.y,
            command.angular.z,
            command.linear.x,
            command.linear.y,
            command.linear.z,
        )
    )
