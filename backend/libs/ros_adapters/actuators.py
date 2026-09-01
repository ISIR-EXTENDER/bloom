"""Gripper and digital-output semantics, matching `tablet_interface`.

Bloom's gripper widget published a raw `Float64MultiArray` whose contents the app
configuration had to spell out. That pushes a robot-specific calibration into
every screen that wants a gripper: an operator configuring a new app has to know
the open and close joint positions for this particular hand.

`tablet_interface/actuator_bridge.py` keeps that calibration in one place and
exposes an intent instead: `open` or `close`. This mirrors it, so a Bloom gripper
control and a tablet gripper control produce the same message.

The digital-output side is the `hub` package's contract: a flat array of
`[pin, value, pin, value, ...]` pairs, which is how `tools/hub` addresses the
Arduino.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

GripperAction = Literal["open", "close"]

#: Explorer values from tablet_interface's parameter profiles.
DEFAULT_GRIPPER_OPEN_POSITION = 0.2
DEFAULT_GRIPPER_CLOSE_POSITION = 1.1


class ActuatorError(ValueError):
    """Raised when an actuator command cannot be built."""


@dataclass(frozen=True)
class GripperCalibration:
    """Where this gripper's jaws sit when open and closed."""

    open_position: float = DEFAULT_GRIPPER_OPEN_POSITION
    close_position: float = DEFAULT_GRIPPER_CLOSE_POSITION

    def position_for(self, action: str) -> float:
        normalized = action.strip().lower()
        if normalized == "open":
            return float(self.open_position)
        if normalized == "close":
            return float(self.close_position)
        raise ActuatorError(f"unknown gripper action '{action}', expected open or close")

    def action_for(self, position: float) -> GripperAction:
        """Classify a measured position, for reporting state back to the UI.

        Nearest-of-two rather than a threshold, so a partially closed gripper
        reports the state it is closer to instead of an arbitrary side of a
        cutoff.
        """
        open_distance = abs(float(position) - float(self.open_position))
        close_distance = abs(float(position) - float(self.close_position))
        return "open" if open_distance <= close_distance else "close"


def build_gripper_payload(action: str, calibration: GripperCalibration) -> dict[str, Any]:
    """Build the `Float64MultiArray` payload for a gripper intent."""
    return {"data": [calibration.position_for(action)]}


def build_digital_output_payload(channel: float, enabled: bool) -> dict[str, Any]:
    """Build the `hub` digital-output payload.

    `tools/hub` reads a flat array of `[pin, value]` pairs, so a single channel
    is a two-element array rather than a scalar.
    """
    if channel < 0:
        raise ActuatorError(f"digital output channel must not be negative, got {channel}")
    return {"data": [float(channel), 1.0 if enabled else 0.0]}


__all__ = [
    "DEFAULT_GRIPPER_CLOSE_POSITION",
    "DEFAULT_GRIPPER_OPEN_POSITION",
    "ActuatorError",
    "GripperAction",
    "GripperCalibration",
    "build_digital_output_payload",
    "build_gripper_payload",
]
