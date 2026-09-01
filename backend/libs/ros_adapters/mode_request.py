"""Mode-request grammar for the ``cartesian_manager`` control stack.

``cartesian_manager`` selects its shapers from a ``std_msgs/msg/String`` published
on ``/mode_request``. It normalizes the string, splits it on ``/``, and silently
drops anything it cannot parse.

Bloom validates the request before publishing so an invalid mode surfaces as a
runtime error the operator can see, rather than a robot that quietly does
nothing. This mirrors the same check in the Extender ``tablet_interface``
backend, which is the other client of this contract.
"""

from __future__ import annotations

from dataclasses import dataclass

GEOMETRIC_PREFIX = "geometric"
BEHAVIOUR_PREFIX = "behaviour"

#: Geometric shapers accepted by ``Manager::setMode``.
#:
#: The target architecture selects between ``translation``, ``orientation``,
#: ``snake`` and ``both``; ``jaco`` is the current transitional name. Adding the
#: new behaviours is a one-line change here.
GEOMETRIC_MODES = ("both", "jaco", "snake")

DEFAULT_GEOMETRIC_MODE = f"{GEOMETRIC_PREFIX}/both"
SNAKE_MODE = f"{GEOMETRIC_PREFIX}/snake"
JACO_MODE = f"{GEOMETRIC_PREFIX}/jaco"
PASSTHROUGH_MODE = f"{BEHAVIOUR_PREFIX}/passthrough"
JOINT_TARGET_PREFIX = f"{BEHAVIOUR_PREFIX}/joint_target"

MODE_REQUEST_TOPIC = "/mode_request"
MODE_REQUEST_MESSAGE_TYPE = "std_msgs/msg/String"


class ModeRequestError(ValueError):
    """Raised when a mode request does not match the manager grammar."""


@dataclass(frozen=True)
class ModeRequest:
    normalized: str
    detail: str
    one_shot: bool


def normalize_mode_request(raw: str) -> str:
    """Normalize a mode request the way ``cartesian_manager`` does.

    Lowercases the request and turns ``-`` into ``_``.
    """
    return raw.strip().lower().replace("-", "_")


def parse_mode_request(raw: str) -> ModeRequest:
    """Validate a mode request, or raise :class:`ModeRequestError`.

    Joint-target names are not validated: the valid set lives in the manager's
    ``behaviours.joint_targets.target_names`` parameter, which Bloom does not
    read. The manager rejects an unknown name itself.
    """
    normalized = normalize_mode_request(raw)
    if not normalized:
        raise ModeRequestError("mode request is empty")

    parts = normalized.split("/")
    if any(not part for part in parts):
        raise ModeRequestError("mode request has an empty path segment")
    if len(parts) < 2:
        raise ModeRequestError("mode request needs at least two segments, such as geometric/both")

    if parts[0] == GEOMETRIC_PREFIX:
        if len(parts) != 2:
            raise ModeRequestError("geometric mode request takes exactly one name")
        if parts[1] not in GEOMETRIC_MODES:
            raise ModeRequestError(
                f"unknown geometric mode '{parts[1]}', expected one of {', '.join(GEOMETRIC_MODES)}"
            )
        return ModeRequest(normalized=normalized, detail=f"geometric mode {parts[1]}", one_shot=False)

    if parts[0] == BEHAVIOUR_PREFIX:
        if parts[1] == "passthrough":
            if len(parts) != 2:
                raise ModeRequestError("behaviour/passthrough takes no extra segment")
            return ModeRequest(normalized=normalized, detail="behaviour passthrough", one_shot=False)

        if parts[1] == "joint_target":
            if len(parts) != 3:
                raise ModeRequestError(
                    "behaviour/joint_target needs a target name, such as behaviour/joint_target/home"
                )
            # The manager dispatches the target once and returns to passthrough
            # by itself, so this must not be recorded as sticky state.
            return ModeRequest(
                normalized=normalized,
                detail=f"behaviour joint target {parts[2]}",
                one_shot=True,
            )

        raise ModeRequestError(f"unknown behaviour '{parts[1]}', expected passthrough or joint_target")

    raise ModeRequestError(
        f"unknown mode family '{parts[0]}', expected {GEOMETRIC_PREFIX} or {BEHAVIOUR_PREFIX}"
    )


__all__ = [
    "BEHAVIOUR_PREFIX",
    "DEFAULT_GEOMETRIC_MODE",
    "GEOMETRIC_MODES",
    "GEOMETRIC_PREFIX",
    "JACO_MODE",
    "JOINT_TARGET_PREFIX",
    "MODE_REQUEST_MESSAGE_TYPE",
    "MODE_REQUEST_TOPIC",
    "PASSTHROUGH_MODE",
    "SNAKE_MODE",
    "ModeRequest",
    "ModeRequestError",
    "normalize_mode_request",
    "parse_mode_request",
]
