from dataclasses import dataclass
from uuid import uuid4


@dataclass(frozen=True)
class RuntimeSession:
    id: str


class RuntimeSessionManager:
    def __init__(self) -> None:
        self._sessions: set[str] = set()

    @property
    def active_session_count(self) -> int:
        return len(self._sessions)

    def connect(self) -> RuntimeSession:
        session = RuntimeSession(id=str(uuid4()))
        self._sessions.add(session.id)
        return session

    def disconnect(self, session: RuntimeSession) -> None:
        self._sessions.discard(session.id)
