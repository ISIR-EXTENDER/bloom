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

import json
import re
import threading
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Protocol

from libs.db.sqlite import apply_sqlite_migrations, sqlite_connection

#: What cartesian_manager can name as a joint target.
POSITION_NAME_PATTERN = re.compile(r"^[a-z0-9_]{1,64}$")
#: URDF joint names keep their case and may hold hyphens (the Explorer's joint-tool).
JOINT_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


def normalize_pose_name(name: str) -> str:
    """The manager lowercases a mode request and turns '-' into '_', so a saved name must already be that."""
    return name.strip().lower().replace("-", "_")


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
                f"'{self.name}' has {len(self.positions)} values for {len(self.joint_names)} joints"
            )


@dataclass
class PositionLibrary:
    """Ordered, name-unique collection of poses for one application.

    `on_change` receives the whole list after every mutation, under the lock, so
    a store can write it through without reasoning about partial updates.
    """

    poses: list[JointPose] = field(default_factory=list)
    on_change: Callable[[list[JointPose]], None] | None = field(default=None, repr=False, compare=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False, compare=False)

    def _changed(self) -> None:
        if self.on_change is not None:
            self.on_change(list(self.poses))

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
                    self._changed()
                    return pose
            self.poses.append(pose)
            self._changed()
            return pose

    def remove(self, name: str) -> bool:
        with self._lock:
            for index, existing in enumerate(self.poses):
                if existing.name == name:
                    del self.poses[index]
                    self._changed()
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
                    self._changed()
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
                f"'{pose.name}' uses joints {list(pose.joint_names)} but the library uses {list(expected)}"
            )


class PositionStore(Protocol):
    """Where a library's poses outlive the API process."""

    def load(self, config_id: str, app_id: str) -> list[JointPose]:
        raise NotImplementedError

    def replace(self, config_id: str, app_id: str, poses: list[JointPose]) -> None:
        raise NotImplementedError


class SQLitePositionStore:
    """Poses in the configuration database, one row per pose, replaced as a whole per library."""

    def __init__(self, database_path: str | Path) -> None:
        self.database_path = Path(database_path)
        with sqlite_connection(self.database_path) as connection:
            apply_sqlite_migrations(connection)

    def load(self, config_id: str, app_id: str) -> list[JointPose]:
        with sqlite_connection(self.database_path) as connection:
            rows = connection.execute(
                "SELECT name, joint_names_json, positions_json, description FROM saved_positions"
                " WHERE config_id = ? AND app_id = ? ORDER BY position",
                (config_id, app_id),
            ).fetchall()
        return [
            JointPose(
                name=str(row["name"]),
                joint_names=tuple(str(joint) for joint in json.loads(row["joint_names_json"])),
                positions=tuple(float(value) for value in json.loads(row["positions_json"])),
                description=str(row["description"]),
            )
            for row in rows
        ]

    def replace(self, config_id: str, app_id: str, poses: list[JointPose]) -> None:
        with sqlite_connection(self.database_path) as connection:
            connection.execute("BEGIN")
            connection.execute("DELETE FROM saved_positions WHERE config_id = ? AND app_id = ?", (config_id, app_id))
            connection.executemany(
                "INSERT INTO saved_positions"
                " (config_id, app_id, position, name, joint_names_json, positions_json, description)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                    (
                        config_id,
                        app_id,
                        index,
                        pose.name,
                        json.dumps(list(pose.joint_names)),
                        json.dumps(list(pose.positions)),
                        pose.description,
                    )
                    for index, pose in enumerate(poses)
                ],
            )
            connection.commit()


def library_backed_by(store: PositionStore | None, config_id: str, app_id: str) -> PositionLibrary:
    """A library hydrated from the store, writing every change back through it."""
    if store is None:
        return PositionLibrary()
    return PositionLibrary(
        poses=store.load(config_id, app_id),
        on_change=lambda poses: store.replace(config_id, app_id, poses),
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
            raise PositionLibraryError(f"'{pose.name}' uses a different joint order to '{pose_list[0].name}'")

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
    names = [str(item) for item in state_names]
    positions = [float(item) for item in state_positions]
    # Truncating to the shorter list would record a pose built from whichever
    # joints happened to line up, which is the permuted pose this function
    # exists to prevent.
    if len(names) != len(positions):
        raise PositionLibraryError(f"joint state has {len(names)} names for {len(positions)} positions")
    lookup = dict(zip(names, positions, strict=True))

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
    "JOINT_NAME_PATTERN",
    "POSITION_NAME_PATTERN",
    "normalize_pose_name",
    "render_joint_targets_yaml",
]
