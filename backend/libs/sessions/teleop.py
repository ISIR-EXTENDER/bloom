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
    target: str = "/teleop_cmd"


@dataclass(frozen=True)
class TeleopPublishReceipt:
    detail: str
    status: TeleopPublishStatus
    target: str


class TeleopCommandGateway(Protocol):
    def publish(self, command: TeleopCommand) -> TeleopPublishReceipt:
        ...


class NoopTeleopCommandGateway:
    """Safe default for runtimes where the robot teleop adapter is not attached."""

    def publish(self, command: TeleopCommand) -> TeleopPublishReceipt:
        return TeleopPublishReceipt(
            detail="Teleop gateway is not configured.",
            status="simulated",
            target=command.target,
        )
