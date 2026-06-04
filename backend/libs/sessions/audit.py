from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

RuntimeAuditStatus = Literal["accepted", "rejected"]
RuntimeAuditChannel = Literal["http_ros_publish", "websocket_teleop"]


@dataclass(frozen=True)
class RuntimeAuditRecord:
    channel: RuntimeAuditChannel
    status: RuntimeAuditStatus
    detail: str
    message_type: str = ""
    payload_summary: dict[str, Any] = field(default_factory=dict)
    session_id: str = ""
    target: str = ""
    topic: str = ""
    recorded_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class RuntimeAuditLog:
    def record(self, record: RuntimeAuditRecord) -> None:
        raise NotImplementedError

    def list_records(self, limit: int = 100) -> tuple[RuntimeAuditRecord, ...]:
        raise NotImplementedError


class InMemoryRuntimeAuditLog(RuntimeAuditLog):
    def __init__(self, max_records: int = 500) -> None:
        self._max_records = max_records
        self._records: list[RuntimeAuditRecord] = []

    def record(self, record: RuntimeAuditRecord) -> None:
        self._records.append(record)
        if len(self._records) > self._max_records:
            self._records = self._records[-self._max_records :]

    def list_records(self, limit: int = 100) -> tuple[RuntimeAuditRecord, ...]:
        normalized_limit = max(0, min(limit, self._max_records))
        return tuple(reversed(self._records[-normalized_limit:]))


def summarize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    summary: dict[str, Any] = {"field_count": len(payload), "fields": sorted(payload.keys())}
    data = payload.get("data")
    if isinstance(data, list):
        summary["data_length"] = len(data)
    elif data is not None:
        summary["data_type"] = type(data).__name__
    return summary
