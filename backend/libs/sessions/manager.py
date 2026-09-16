from collections.abc import Callable
from dataclasses import dataclass
from threading import Lock
from typing import TypeVar
from uuid import uuid4

from libs.sessions.teleop import TeleopCommand

T = TypeVar("T")


@dataclass(frozen=True)
class RuntimeSession:
    id: str


@dataclass(frozen=True)
class RuntimeControlSnapshot:
    active_sessions: int
    is_owner: bool
    owner_present: bool
    session_id: str


class RuntimeControlNotOwnedError(RuntimeError):
    """Raised when a command loses the runtime control lease."""


class RuntimeSessionManager:
    def __init__(self) -> None:
        self._sessions: set[str] = set()
        self._owner_session_id: str | None = None
        self._releasing_session_id: str | None = None
        self._teleop_commands: dict[str, dict[str, TeleopCommand]] = {}
        self._lock = Lock()
        self._operation_lock = Lock()

    @property
    def active_session_count(self) -> int:
        with self._lock:
            return len(self._sessions)

    def connect(self) -> RuntimeSession:
        session = RuntimeSession(id=str(uuid4()))
        with self._lock:
            self._sessions.add(session.id)
        return session

    def disconnect(self, session: RuntimeSession) -> None:
        with self._lock:
            self._sessions.discard(session.id)
            self._teleop_commands.pop(session.id, None)
            if self._owner_session_id == session.id:
                self._owner_session_id = None
            if self._releasing_session_id == session.id:
                self._releasing_session_id = None

    def claim_control(self, session: RuntimeSession) -> RuntimeControlSnapshot:
        with self._lock:
            self._ensure_connected(session.id)
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
            commands = self._teleop_commands.setdefault(session.id, {})
            if _is_zero_command(command):
                commands.pop(command.target, None)
                if not commands:
                    self._teleop_commands.pop(session.id, None)
                return
            commands[command.target] = command

    def moving_teleop_commands(self, session: RuntimeSession) -> tuple[TeleopCommand, ...]:
        with self._lock:
            return tuple(self._teleop_commands.get(session.id, {}).values())

    def clear_teleop_commands(self, session: RuntimeSession) -> None:
        with self._lock:
            self._teleop_commands.pop(session.id, None)

    def _snapshot(self, session_id: str) -> RuntimeControlSnapshot:
        return RuntimeControlSnapshot(
            active_sessions=len(self._sessions),
            is_owner=self._is_control_owner(session_id),
            owner_present=self._owner_session_id is not None,
            session_id=session_id,
        )

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
