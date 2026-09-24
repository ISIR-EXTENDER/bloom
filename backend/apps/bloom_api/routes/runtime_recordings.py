"""Bag recordings, started and stopped by the control owner within the recording policy."""

import logging
from dataclasses import asdict
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from apps.bloom_api.routes.runtime_common import (
    audited_rejection,
    get_allowed_recording_output_folders,
    get_runtime_audit_log,
    get_runtime_command_policy,
    get_runtime_recording_gateway,
)
from apps.bloom_api.security import (
    BloomPrincipal,
    execute_as_runtime_owner,
    require_runtime_owner,
)
from libs.ros_adapters.safety import (
    RuntimeCommandPolicyError,
)
from libs.sessions import (
    RuntimeAuditRecord,
    RuntimeRecordingRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class RuntimeRecordingStartRequest(BaseModel):
    topics: tuple[str, ...] = Field(min_length=1)
    output_folder: str = Field(default="data/recordings", min_length=1)
    label: str = ""

    @field_validator("topics")
    @classmethod
    def topics_must_be_absolute(cls, topics: tuple[str, ...]) -> tuple[str, ...]:
        normalized_topics: list[str] = []
        for topic in topics:
            normalized_topic = topic.strip()
            if not normalized_topic.startswith("/"):
                raise ValueError("recording topics must start with '/'")
            if any(character.isspace() for character in normalized_topic):
                raise ValueError("recording topics must not contain whitespace")
            normalized_topics.append(normalized_topic)
        return tuple(dict.fromkeys(normalized_topics))

    @field_validator("output_folder")
    @classmethod
    def output_folder_must_be_relative(cls, output_folder: str) -> str:
        normalized_folder = output_folder.strip()
        path = Path(normalized_folder)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError("recording output folder must be a safe relative path")
        return normalized_folder


class RuntimeRecordingResponse(BaseModel):
    detail: str
    output_folder: str
    recording_id: str
    status: str
    topics: tuple[str, ...]


@router.post("/recordings", response_model=RuntimeRecordingResponse)
def start_runtime_recording(
    request: Request,
    recording_request: RuntimeRecordingStartRequest,
    _principal: BloomPrincipal = Depends(require_runtime_owner),
) -> RuntimeRecordingResponse:
    audit_log = get_runtime_audit_log(request)

    def reject(status_code: int, detail: str, topic: str = "") -> HTTPException:
        return audited_rejection(
            audit_log,
            status_code,
            channel="runtime_recording",
            detail=detail,
            payload_summary={"topic_count": len(recording_request.topics)},
            target=recording_request.output_folder,
            topic=topic,
        )

    if recording_request.output_folder not in get_allowed_recording_output_folders(request):
        raise reject(403, "Recording output folder is not allowed.")

    policy = get_runtime_command_policy(request)
    try:
        policy.ensure_recording_topics_allowed(recording_request.topics)
    except RuntimeCommandPolicyError as exc:
        raise reject(
            403, str(exc), find_rejected_recording_topic(recording_request.topics, policy.allowed_recording_topics)
        ) from exc

    gateway = get_runtime_recording_gateway(request)
    try:
        receipt = execute_as_runtime_owner(
            request,
            lambda: gateway.start(
                RuntimeRecordingRequest(
                    label=recording_request.label,
                    output_folder=recording_request.output_folder,
                    topics=recording_request.topics,
                )
            ),
        )
    except RuntimeError as exc:
        raise reject(503, str(exc)) from exc
    audit_log.record(
        RuntimeAuditRecord(
            channel="runtime_recording",
            detail=receipt.detail,
            payload_summary={"topic_count": len(receipt.topics)},
            session_id=receipt.recording_id,
            status="accepted",
            target=receipt.output_folder,
        )
    )
    return RuntimeRecordingResponse(**asdict(receipt))


def find_rejected_recording_topic(topics: tuple[str, ...], allowed_topics: tuple[str, ...]) -> str:
    if "*" in allowed_topics:
        return ""
    return next((topic for topic in topics if topic not in allowed_topics), "")


@router.post("/recordings/{recording_id}/stop", response_model=RuntimeRecordingResponse)
def stop_runtime_recording(
    request: Request,
    recording_id: str,
    _principal: BloomPrincipal = Depends(require_runtime_owner),
) -> RuntimeRecordingResponse:
    gateway = get_runtime_recording_gateway(request)
    receipt = execute_as_runtime_owner(request, lambda: gateway.stop(recording_id))
    get_runtime_audit_log(request).record(
        RuntimeAuditRecord(
            channel="runtime_recording",
            detail=receipt.detail,
            payload_summary={"topic_count": len(receipt.topics)},
            session_id=receipt.recording_id,
            status="accepted",
            target=receipt.output_folder,
        )
    )
    return RuntimeRecordingResponse(**asdict(receipt))
