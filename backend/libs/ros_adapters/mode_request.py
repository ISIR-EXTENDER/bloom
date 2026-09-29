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
SHARED_CONTROL_MODE = f"{BEHAVIOUR_PREFIX}/shared_control"
SHARED_CONTROL_RESET_MODE = f"{SHARED_CONTROL_MODE}/reset"
INTENT_SCALING_MODE = f"{BEHAVIOUR_PREFIX}/intent_scaling"
#: Behaviours that last until passthrough or the other one replaces them.
LASTING_BEHAVIOURS = (INTENT_SCALING_MODE, SHARED_CONTROL_MODE)

MODE_REQUEST_TOPIC = "/mode_request"
MODE_REQUEST_MESSAGE_TYPE = "std_msgs/msg/String"
#: cartesian_manager's dynamic pose target (topics.pose_target): a PoseStamped in its base frame starts
#: behaviour/pose_target at once; it ends within tolerance, or on behaviour/passthrough.
POSE_TARGET_TOPIC = "/pose_target"
POSE_TARGET_MESSAGE_TYPE = "geometry_msgs/msg/PoseStamped"


class ModeRequestError(ValueError):
    """Raised when a mode request does not match the manager grammar."""


@dataclass(frozen=True)
class ModeRequest:
    normalized: str
    detail: str
    one_shot: bool
    #: A behaviour that outlives its sender unless a ``behaviour/passthrough`` ends it.
    cancel_on_leave: bool = False


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
            raise ModeRequestError(f"unknown geometric mode '{parts[1]}', expected one of {', '.join(GEOMETRIC_MODES)}")
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
                cancel_on_leave=True,
            )

        if parts[1] == "pose_target":
            if len(parts) != 3:
                raise ModeRequestError("behaviour/pose_target needs a target name, such as behaviour/pose_target/ready")
            # Like a joint target: it runs until the pose is within tolerance, then the manager returns to
            # passthrough, and passthrough cancels it earlier.
            return ModeRequest(
                normalized=normalized,
                detail=f"behaviour pose target {parts[2]}",
                one_shot=True,
                cancel_on_leave=True,
            )

        if parts[1] == "shared_control":
            if len(parts) > 3 or (len(parts) == 3 and parts[2] != "reset"):
                raise ModeRequestError("behaviour/shared_control takes only an optional /reset")
            # Lasting assistance: the next operator must not inherit it, so leaving ends it like a target.
            # The reset enters shared control too, with every confidence cleared.
            return ModeRequest(
                normalized=normalized,
                detail="behaviour shared control" + (" with confidences reset" if len(parts) == 3 else ""),
                one_shot=False,
                cancel_on_leave=True,
            )

        if parts[1] == "intent_scaling":
            if len(parts) != 2:
                raise ModeRequestError("behaviour/intent_scaling takes no extra segment")
            # Lasting, like shared control: the next operator must not inherit it.
            return ModeRequest(
                normalized=normalized, detail="behaviour intent scaling", one_shot=False, cancel_on_leave=True
            )

        raise ModeRequestError(
            f"unknown behaviour '{parts[1]}', expected passthrough, joint_target, pose_target, shared_control "
            "or intent_scaling"
        )

    raise ModeRequestError(f"unknown mode family '{parts[0]}', expected {GEOMETRIC_PREFIX} or {BEHAVIOUR_PREFIX}")


__all__ = [
    "BEHAVIOUR_PREFIX",
    "DEFAULT_GEOMETRIC_MODE",
    "GEOMETRIC_MODES",
    "GEOMETRIC_PREFIX",
    "INTENT_SCALING_MODE",
    "JACO_MODE",
    "JOINT_TARGET_PREFIX",
    "LASTING_BEHAVIOURS",
    "MODE_REQUEST_MESSAGE_TYPE",
    "MODE_REQUEST_TOPIC",
    "PASSTHROUGH_MODE",
    "POSE_TARGET_MESSAGE_TYPE",
    "POSE_TARGET_TOPIC",
    "SHARED_CONTROL_MODE",
    "SHARED_CONTROL_RESET_MODE",
    "SNAKE_MODE",
    "ModeRequest",
    "ModeRequestError",
    "normalize_mode_request",
    "parse_mode_request",
]
