"""The runtime socket forwards at most one sample per topic per interval, the newest, and never loses the last."""

from __future__ import annotations

from dataclasses import replace

from libs.sessions.topic_sample_throttle import TopicSampleThrottle
from libs.sessions.topics import RuntimeTopicSample


class FakeTimer:
    def __init__(self, loop: FakeLoop, when: float, callback, args) -> None:
        self.loop = loop
        self.when = when
        self.callback = callback
        self.args = args
        self.cancelled = False

    def cancel(self) -> None:
        self.cancelled = True


class FakeLoop:
    def __init__(self) -> None:
        self.now = 0.0
        self.timers: list[FakeTimer] = []

    def call_later(self, delay: float, callback, *args) -> FakeTimer:
        timer = FakeTimer(self, self.now + delay, callback, args)
        self.timers.append(timer)
        return timer

    def advance(self, seconds: float) -> None:
        self.now += seconds
        for timer in sorted(self.timers, key=lambda t: t.when):
            if timer.when <= self.now and not timer.cancelled and timer in self.timers:
                self.timers.remove(timer)
                timer.callback(*timer.args)


def sample(topic: str, value: float) -> RuntimeTopicSample:
    return RuntimeTopicSample(topic=topic, message_type="std_msgs/msg/Float64", received_at="t", value=value)


def make() -> tuple[FakeLoop, list[float], TopicSampleThrottle]:
    loop = FakeLoop()
    sent: list[float] = []
    throttle = TopicSampleThrottle(loop, 10.0, lambda s: sent.append(float(s.value)), clock=lambda: loop.now)
    return loop, sent, throttle


def test_the_first_sample_goes_straight_through_and_the_rest_wait_for_the_interval() -> None:
    loop, sent, throttle = make()
    throttle.offer(sample("/a", 1))
    throttle.offer(sample("/a", 2))
    throttle.offer(sample("/a", 3))
    assert sent == [1.0]
    loop.advance(0.1)
    # The newest waiting sample, not the first that waited.
    assert sent == [1.0, 3.0]


def test_a_stream_that_stops_still_ends_on_its_last_value() -> None:
    loop, sent, throttle = make()
    for value in range(20):
        throttle.offer(sample("/a", value))
        loop.advance(0.01)
    loop.advance(0.2)
    assert sent[-1] == 19.0
    # Twenty samples over 0.19 s at 10 Hz: two on the beat and the last one after.
    assert len(sent) == 3


def test_topics_are_throttled_apart() -> None:
    loop, sent, throttle = make()
    throttle.offer(sample("/a", 1))
    throttle.offer(sample("/b", 2))
    assert sent == [1.0, 2.0]


def test_a_derived_stream_is_throttled_apart_from_its_topic() -> None:
    # A raw /ee_jac and its manipulability arrive in pairs; on one key the later always replaced the earlier.
    loop, sent, throttle = make()
    for value in range(10):
        throttle.offer(sample("/ee_jac", value))
        throttle.offer(replace(sample("/ee_jac", 100 + value), stream="manipulability"))
        loop.advance(0.05)

    assert any(value < 100 for value in sent[2:])
    assert any(value >= 100 for value in sent[2:])


def test_a_rate_of_zero_forwards_everything() -> None:
    loop = FakeLoop()
    sent: list[float] = []
    throttle = TopicSampleThrottle(loop, 0, lambda s: sent.append(float(s.value)), clock=lambda: loop.now)
    for value in range(5):
        throttle.offer(sample("/a", value))
    assert sent == [0.0, 1.0, 2.0, 3.0, 4.0]
    assert loop.timers == []


def test_close_cancels_what_is_waiting() -> None:
    loop, sent, throttle = make()
    throttle.offer(sample("/a", 1))
    throttle.offer(sample("/a", 2))
    throttle.close()
    loop.advance(1.0)
    assert sent == [1.0]
