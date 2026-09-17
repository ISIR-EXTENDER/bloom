from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

TeleopPublishStatus = Literal["accepted", "simulated"]


@dataclass(frozen=True)
class TeleopVector3:
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0


@dataclass(frozen=True)
class TeleopCommand:
    angular: TeleopVector3
    linear: TeleopVector3
    mode: int
    seq: int
    target: str = "/joystick_cartesian_command"
    #: Rotation frame for cartesian_manager; empty uses the configured default.
    frame_id: str = ""


@dataclass(frozen=True)
class TeleopPublishReceipt:
    detail: str
    status: TeleopPublishStatus
    target: str
    #: Effective ROS frame used by the adapter; empty for unframed transports.
    frame_id: str = ""


class TeleopCommandGateway(Protocol):
    def publish(self, command: TeleopCommand) -> TeleopPublishReceipt:
        raise NotImplementedError


class NoopTeleopCommandGateway:
    """Safe default for runtimes where the robot teleop adapter is not attached."""

    def publish(self, command: TeleopCommand) -> TeleopPublishReceipt:
        return TeleopPublishReceipt(
            detail="Teleop gateway is not configured.",
            frame_id=command.frame_id,
            status="simulated",
            target=command.target,
        )
