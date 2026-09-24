"""At most one sample per topic per interval on the runtime socket: the newest, and never the last one lost."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Protocol

from libs.sessions.topics import RuntimeTopicSample


class TimerHandle(Protocol):
    def cancel(self) -> None: ...


class TimerLoop(Protocol):
    def call_later(self, delay: float, callback: Callable[..., object], *args: object) -> TimerHandle: ...


class TopicSampleThrottle:
    """A 200 Hz joint state is 200 JSON frames a second a display cannot use; a tablet on Wi-Fi pays for each.

    A sample arriving inside the interval after the last one sent waits, replacing any earlier waiting
    sample, and goes out when the interval ends. A stream that stops therefore still ends on its last value.
    A rate of zero forwards everything.
    """

    def __init__(
        self,
        loop: TimerLoop,
        max_rate_hz: float,
        emit: Callable[[RuntimeTopicSample], None],
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._loop = loop
        self._interval = 1.0 / max_rate_hz if max_rate_hz > 0 else 0.0
        self._emit = emit
        self._clock = clock
        self._last_sent: dict[str, float] = {}
        self._pending: dict[str, RuntimeTopicSample] = {}
        self._timers: dict[str, TimerHandle] = {}

    def offer(self, sample: RuntimeTopicSample) -> None:
        if self._interval == 0.0:
            self._emit(sample)
            return
        topic = sample.topic
        now = self._clock()
        due = self._last_sent.get(topic, float("-inf")) + self._interval
        if now >= due and topic not in self._pending:
            self._last_sent[topic] = now
            self._emit(sample)
            return
        self._pending[topic] = sample
        if topic not in self._timers:
            self._timers[topic] = self._loop.call_later(max(0.0, due - now), self._flush, topic)

    def _flush(self, topic: str) -> None:
        self._timers.pop(topic, None)
        sample = self._pending.pop(topic, None)
        if sample is not None:
            self._last_sent[topic] = self._clock()
            self._emit(sample)

    def close(self) -> None:
        for timer in self._timers.values():
            timer.cancel()
        self._timers.clear()
        self._pending.clear()
