from __future__ import annotations

import threading
from collections import defaultdict, deque
from collections.abc import Callable
from dataclasses import dataclass, field
from time import monotonic

#: Keys held before idle ones are swept. A deployment counts a handful of
#: topics and targets, so anything past this is a client inventing keys.
MAX_TRACKED_KEYS = 256


class RuntimeRateLimitError(RuntimeError):
    """Raised when a runtime command exceeds the configured rate limit."""


@dataclass
class RuntimeCommandRateLimiter:
    max_commands_per_second: int
    clock: Callable[[], float] = monotonic
    _events_by_key: dict[str, deque[float]] = field(default_factory=lambda: defaultdict(deque))
    # Called from the event loop and from worker threads alike.
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False, compare=False)

    def ensure_allowed(self, key: str) -> None:
        if self.max_commands_per_second <= 0:
            return
        with self._lock:
            self._ensure_allowed_unlocked(key)

    def _ensure_allowed_unlocked(self, key: str) -> None:
        now = self.clock()
        window_start = now - 1.0
        if len(self._events_by_key) >= MAX_TRACKED_KEYS:
            self._forget_idle_keys(window_start)
        events = self._events_by_key[key]

        while events and events[0] <= window_start:
            events.popleft()

        if len(events) >= self.max_commands_per_second:
            raise RuntimeRateLimitError(
                f"Runtime command rate limit exceeded for '{key}' ({self.max_commands_per_second} commands/s)."
            )

        events.append(now)

    @property
    def tracked_keys(self) -> tuple[str, ...]:
        with self._lock:
            return tuple(self._events_by_key)

    def _forget_idle_keys(self, window_start: float) -> None:
        """A key with nothing left in its window is indistinguishable from a new one."""
        idle_keys = [key for key, events in self._events_by_key.items() if not events or events[-1] <= window_start]
        for idle_key in idle_keys:
            del self._events_by_key[idle_key]
