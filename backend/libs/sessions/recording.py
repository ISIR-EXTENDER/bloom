from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal, Protocol
from uuid import uuid4


RuntimeRecordingStatus = Literal["recording", "simulated", "stopped"]


@dataclass(frozen=True)
class RuntimeRecordingRequest:
    topics: tuple[str, ...]
    output_folder: str
    label: str = ""


@dataclass(frozen=True)
class RuntimeRecordingReceipt:
    detail: str
    output_folder: str
    recording_id: str
    status: RuntimeRecordingStatus
    topics: tuple[str, ...]


class RuntimeRecordingGateway(Protocol):
    def start(self, request: RuntimeRecordingRequest) -> RuntimeRecordingReceipt:
        raise NotImplementedError

    def stop(self, recording_id: str) -> RuntimeRecordingReceipt:
        raise NotImplementedError


class NoopRuntimeRecordingGateway:
    """Safe default for deployments where rosbag recording is not attached."""

    def start(self, request: RuntimeRecordingRequest) -> RuntimeRecordingReceipt:
        recording_id = f"simulated-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{uuid4().hex[:8]}"
        return RuntimeRecordingReceipt(
            detail="Recording gateway is not configured.",
            output_folder=request.output_folder,
            recording_id=recording_id,
            status="simulated",
            topics=request.topics,
        )

    def stop(self, recording_id: str) -> RuntimeRecordingReceipt:
        return RuntimeRecordingReceipt(
            detail="Recording gateway is not configured.",
            output_folder="",
            recording_id=recording_id,
            status="stopped",
            topics=(),
        )
