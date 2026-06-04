from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field
from time import monotonic
from typing import Callable


class RuntimeRateLimitError(RuntimeError):
    """Raised when a runtime command exceeds the configured rate limit."""


@dataclass
class RuntimeCommandRateLimiter:
    max_commands_per_second: int
    clock: Callable[[], float] = monotonic
    _events_by_key: dict[str, deque[float]] = field(default_factory=lambda: defaultdict(deque))

    def ensure_allowed(self, key: str) -> None:
        if self.max_commands_per_second <= 0:
            return

        now = self.clock()
        window_start = now - 1.0
        events = self._events_by_key[key]

        while events and events[0] <= window_start:
            events.popleft()

        if len(events) >= self.max_commands_per_second:
            raise RuntimeRateLimitError(
                f"Runtime command rate limit exceeded for '{key}' "
                f"({self.max_commands_per_second} commands/s)."
            )

        events.append(now)
