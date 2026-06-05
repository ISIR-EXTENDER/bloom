from __future__ import annotations

import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from shutil import which
from typing import Any, Callable, Literal, Protocol
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


class RosbagRuntimeRecordingGateway:
    """Manage `ros2 bag record` processes behind Bloom's recording contract."""

    def __init__(
        self,
        *,
        base_directory: Path = Path("."),
        executable: str = "ros2",
        popen_factory: Callable[..., subprocess.Popen[Any]] = subprocess.Popen,
    ) -> None:
        self._base_directory = base_directory
        self._executable = executable
        self._popen_factory = popen_factory
        self._recordings: dict[str, tuple[subprocess.Popen, RuntimeRecordingRequest, str]] = {}

    def start(self, request: RuntimeRecordingRequest) -> RuntimeRecordingReceipt:
        self._ensure_executable_available()
        recording_id = build_recording_id(request)
        output_path = self._base_directory / request.output_folder / recording_id
        output_path.parent.mkdir(parents=True, exist_ok=True)
        command = [self._executable, "bag", "record", "-o", str(output_path), *request.topics]
        process = self._popen_factory(
            command,
            stderr=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            text=True,
        )
        self._recordings[recording_id] = (process, request, str(output_path))
        return RuntimeRecordingReceipt(
            detail="ros2 bag recording started.",
            output_folder=str(output_path),
            recording_id=recording_id,
            status="recording",
            topics=request.topics,
        )

    def stop(self, recording_id: str) -> RuntimeRecordingReceipt:
        recording = self._recordings.pop(recording_id, None)
        if recording is None:
            return RuntimeRecordingReceipt(
                detail="Recording session was not found or already stopped.",
                output_folder="",
                recording_id=recording_id,
                status="stopped",
                topics=(),
            )

        process, request, output_folder = recording
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)

        return RuntimeRecordingReceipt(
            detail="ros2 bag recording stopped.",
            output_folder=output_folder,
            recording_id=recording_id,
            status="stopped",
            topics=request.topics,
        )

    def _ensure_executable_available(self) -> None:
        if which(self._executable) is None:
            raise RuntimeError(f"{self._executable} executable is not available for rosbag recording")


def build_recording_id(request: RuntimeRecordingRequest) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    suffix = normalize_recording_label(request.label) or uuid4().hex[:8]
    return f"rosbag-{timestamp}-{suffix}"


def normalize_recording_label(label: str) -> str:
    normalized = "".join(character.lower() if character.isalnum() else "-" for character in label.strip())
    compact = "-".join(part for part in normalized.split("-") if part)
    return compact[:40]
