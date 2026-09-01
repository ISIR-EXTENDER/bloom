"""A named-position library that Bloom owns, plus export to manager config.

Two storage layers exist and they are not the same thing.

1. **Manager targets.** What `behaviour/joint_target/<name>` can actually reach.
   They live in `cartesian_manager`'s `explorer_params.yaml`, need a node
   restart, and are the only thing that moves the arm through the QP.
2. **This library.** Poses Bloom captures live, with no restart and no access to
   anyone else's repository.

A pose saved here cannot be replayed through `behaviour/joint_target/<name>`
until the manager knows the name, so the bridge is an export: render the exact
YAML block to paste into the manager config.

The export has to be generated rather than hand-written because `positions` is a
single flattened array across every entry in `target_names`, and the manager
refuses to start unless
``len(positions) == len(joint_names) * len(target_names)``.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field, replace
from typing import Iterable


class PositionLibraryError(ValueError):
    """Raised when a pose would produce a configuration the manager rejects."""


@dataclass(frozen=True)
class JointPose:
    """A pose captured from the robot, ordered to match ``joint_names``."""

    name: str
    joint_names: tuple[str, ...]
    positions: tuple[float, ...]
    description: str = ""

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise PositionLibraryError("a saved position needs a name")
        if not self.joint_names:
            raise PositionLibraryError("a saved position needs joint names")
        if len(self.joint_names) != len(self.positions):
            raise PositionLibraryError(
                f"'{self.name}' has {len(self.positions)} values for "
                f"{len(self.joint_names)} joints"
            )


@dataclass
class PositionLibrary:
    """Ordered, name-unique collection of poses for one application."""

    poses: list[JointPose] = field(default_factory=list)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False, compare=False)

    def save(self, pose: JointPose) -> JointPose:
        """Add a pose, or replace one with the same name in place.

        Replacing in place matters: recapturing `home` must not append a second
        target with a duplicate name, which the manager would reject.
        """
        with self._lock:
            self._ensure_consistent_joints(pose)
            for index, existing in enumerate(self.poses):
                if existing.name == pose.name:
                    self.poses[index] = pose
                    return pose
            self.poses.append(pose)
            return pose

    def remove(self, name: str) -> bool:
        with self._lock:
            for index, existing in enumerate(self.poses):
                if existing.name == name:
                    del self.poses[index]
                    return True
            return False

    def get(self, name: str) -> JointPose | None:
        with self._lock:
            return next((pose for pose in self.poses if pose.name == name), None)

    def list(self) -> tuple[JointPose, ...]:
        with self._lock:
            return tuple(self.poses)

    def rename(self, name: str, new_name: str) -> JointPose:
        with self._lock:
            if any(pose.name == new_name for pose in self.poses):
                raise PositionLibraryError(f"'{new_name}' already exists")
            for index, existing in enumerate(self.poses):
                if existing.name == name:
                    renamed = replace(existing, name=new_name)
                    self.poses[index] = renamed
                    return renamed
            raise PositionLibraryError(f"no saved position named '{name}'")

    def _ensure_consistent_joints(self, pose: JointPose) -> None:
        """Every pose in one library must share a joint order.

        The manager's `joint_targets` block carries a single `joint_names` list
        for all targets, so a library holding two different joint orders cannot
        be exported at all.
        """
        if not self.poses:
            return
        expected = self.poses[0].joint_names
        if pose.joint_names != expected:
            raise PositionLibraryError(
                f"'{pose.name}' uses joints {list(pose.joint_names)} but the library uses "
                f"{list(expected)}"
            )


def render_joint_targets_yaml(poses: Iterable[JointPose], indent: str = "      ") -> str:
    """Render the `joint_targets` block for `explorer_params.yaml`.

    Refuses to render a block whose flattening would be inconsistent, because
    the failure mode downstream is a manager that will not start.
    """
    pose_list = list(poses)
    if not pose_list:
        raise PositionLibraryError("no saved positions to export")

    joint_names = pose_list[0].joint_names
    for pose in pose_list:
        if pose.joint_names != joint_names:
            raise PositionLibraryError(
                f"'{pose.name}' uses a different joint order to '{pose_list[0].name}'"
            )

    flattened: list[float] = []
    for pose in pose_list:
        flattened.extend(pose.positions)

    expected = len(joint_names) * len(pose_list)
    if len(flattened) != expected:
        raise PositionLibraryError(
            f"flattened positions has {len(flattened)} values but "
            f"{len(joint_names)} joints x {len(pose_list)} targets needs {expected}"
        )

    lines = [f"{indent}joint_targets:", f"{indent}  joint_names:"]
    lines += [f"{indent}    - {name}" for name in joint_names]
    lines.append(f"{indent}  target_names:")
    lines += [f"{indent}    - {pose.name}" for pose in pose_list]
    lines.append(f"{indent}  positions:")
    for pose in pose_list:
        lines.append(f"{indent}    # {pose.name}")
        lines += [f"{indent}    - {value:.4f}" for value in pose.positions]

    return "\n".join(lines)


def pose_from_joint_state(
    name: str,
    joint_names: Iterable[str],
    state_names: Iterable[str],
    state_positions: Iterable[float],
    description: str = "",
) -> JointPose:
    """Build a pose from a `/joint_states` message, matching **by name**.

    `/joint_states` carries no guarantee of publishing in the manager's
    `joint_names` order, so reading by index can silently record a pose with the
    joints permuted, which then moves the arm somewhere unintended.
    """
    ordered = list(joint_names)
    lookup = dict(zip([str(item) for item in state_names], [float(item) for item in state_positions]))

    missing = [joint for joint in ordered if joint not in lookup]
    if missing:
        raise PositionLibraryError(f"joint state is missing: {', '.join(missing)}")

    return JointPose(
        name=name,
        joint_names=tuple(ordered),
        positions=tuple(lookup[joint] for joint in ordered),
        description=description,
    )


__all__ = [
    "JointPose",
    "PositionLibrary",
    "PositionLibraryError",
    "pose_from_joint_state",
    "render_joint_targets_yaml",
]
