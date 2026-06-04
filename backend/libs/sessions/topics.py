from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Protocol


@dataclass(frozen=True)
class RuntimeTopicSubscription:
    topic: str
    message_type: str = ""
    field_path: str = ""


@dataclass(frozen=True)
class RuntimeTopicSample:
    topic: str
    value: Any
    message_type: str = ""
    received_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


RuntimeTopicSampleCallback = Callable[[RuntimeTopicSample], None]


class RuntimeTopicSubscriptionHandle(Protocol):
    def close(self) -> None:
        raise NotImplementedError


class RuntimeTopicSubscriptionGateway(Protocol):
    def subscribe(
        self,
        subscription: RuntimeTopicSubscription,
        on_sample: RuntimeTopicSampleCallback,
    ) -> RuntimeTopicSubscriptionHandle:
        raise NotImplementedError


class NoopRuntimeTopicSubscriptionHandle:
    def close(self) -> None:
        return None


class NoopRuntimeTopicSubscriptionGateway:
    """Safe default for runtimes where live topic streaming is not attached."""

    def subscribe(
        self,
        subscription: RuntimeTopicSubscription,
        on_sample: RuntimeTopicSampleCallback,
    ) -> RuntimeTopicSubscriptionHandle:
        return NoopRuntimeTopicSubscriptionHandle()
