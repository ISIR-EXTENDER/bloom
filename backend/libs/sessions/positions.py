"""A named-position library that Bloom owns, plus export to manager config.

Two storage layers exist and they are not the same thing.

1. **Manager targets.** What `behaviour/joint_target/<name>` can actually reach.
   They live in `cartesian_manager`'s `explorer_params.yaml`, need a node
   restart, and are the only thing that moves the arm through the QP.
2. **This library.** Poses Bloom captures live, with no restart and no access to
   anyone else's repository.

A pose saved here cannot be replayed through `behaviour/joint_target/<name>`
until the manager knows the name, so the bridge is an export: render the exact
YAML block to paste into the manager config. A pose saved with the hand's
Cartesian pose can be replayed live, as a PoseStamped on the manager's
`pose_target` topic (cartesian_manager#11).

The export has to be generated rather than hand-written because `positions` is a
single flattened array across every entry in `target_names`, and the manager
refuses to start unless
``len(positions) == len(joint_names) * len(target_names)``.
"""

from __future__ import annotations

import hashlib
import json
import math
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
#: A TF frame id as /ee_pose stamps it; the manager compares it to its base frame as a string.
FRAME_ID_PATTERN = re.compile(r"^[A-Za-z0-9_/-]{1,128}$")
_MIN_QUATERNION_NORM = 1.0e-9


def normalize_pose_name(name: str) -> str:
    """The manager lowercases a mode request and turns '-' into '_', so a saved name must already be that."""
    return name.strip().lower().replace("-", "_")


class PositionLibraryError(ValueError):
    """Raised when a pose would produce a configuration the manager rejects."""


class PositionExistsError(PositionLibraryError):
    """A create that would silently replace a pose someone saved under the same name."""


def with_normalized_names(poses: Iterable[JointPose]) -> list[JointPose]:
    """Stored names normalized; a legacy `pose-1` and a later `pose_1` collide, and the later one wins."""
    result: list[JointPose] = []
    slots: dict[str, int] = {}
    for pose in poses:
        normalized = replace(pose, name=normalize_pose_name(pose.name))
        if normalized.name in slots:
            result[slots[normalized.name]] = normalized
        else:
            slots[normalized.name] = len(result)
            result.append(normalized)
    return result


@dataclass(frozen=True)
class CartesianPose:
    """The hand's pose from /ee_pose, in the frame it was stamped in; orientation is x, y, z, w, unit length."""

    frame_id: str
    position: tuple[float, float, float]
    orientation: tuple[float, float, float, float]
    #: /ee_pose is qontrol's commanded pose; True when the tip measured through TF agreed with it at save time.
    verified: bool = False

    def __post_init__(self) -> None:
        if not FRAME_ID_PATTERN.fullmatch(self.frame_id):
            raise PositionLibraryError(f"'{self.frame_id}' is not a frame id")
        if len(self.position) != 3 or len(self.orientation) != 4:
            raise PositionLibraryError("a hand pose needs three position values and four quaternion values")
        values = (*self.position, *self.orientation)
        if not all(isinstance(value, (int, float)) and math.isfinite(value) for value in values):
            raise PositionLibraryError("a hand pose must be finite")
        norm = math.sqrt(sum(value * value for value in self.orientation))
        if norm <= _MIN_QUATERNION_NORM:
            raise PositionLibraryError("a hand pose needs a non-zero quaternion")
        # The manager normalizes too; storing it unit-length keeps the export and the replay identical.
        object.__setattr__(self, "position", tuple(float(value) for value in self.position))
        object.__setattr__(self, "orientation", tuple(float(value) / norm for value in self.orientation))

    def to_json(self) -> dict[str, object]:
        return {
            "frame_id": self.frame_id,
            "position": list(self.position),
            "orientation": list(self.orientation),
            "verified": self.verified,
        }

    @classmethod
    def from_json(cls, value: object) -> CartesianPose | None:
        if not isinstance(value, dict):
            return None
        try:
            return cls(
                frame_id=str(value["frame_id"]),
                position=tuple(float(item) for item in value["position"]),
                orientation=tuple(float(item) for item in value["orientation"]),
                verified=value.get("verified") is True,
            )
        except (KeyError, TypeError, ValueError):
            return None


@dataclass(frozen=True)
class JointPose:
    """A pose captured from the robot, ordered to match ``joint_names``; ``ee_pose`` is the hand's, when captured."""

    name: str
    joint_names: tuple[str, ...]
    positions: tuple[float, ...]
    description: str = ""
    ee_pose: CartesianPose | None = None

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

    `on_change` receives the whole new list, under the lock, before the library keeps it; if it raises, nothing
    changes, so a store can write it through without reasoning about partial updates.
    """

    poses: list[JointPose] = field(default_factory=list)
    on_change: Callable[[list[JointPose]], None] | None = field(default=None, repr=False, compare=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False, compare=False)

    def _commit(self, poses: list[JointPose]) -> None:
        """Write first, then keep: a failed write leaves the list as the store has it."""
        if self.on_change is not None:
            self.on_change(list(poses))
        self.poses = poses

    def save(self, pose: JointPose) -> JointPose:
        """Add a pose, or replace one with the same name in place.

        Replacing in place matters: recapturing `home` must not append a second
        target with a duplicate name, which the manager would reject.
        """
        with self._lock:
            self._ensure_consistent_joints(pose)
            poses = list(self.poses)
            for index, existing in enumerate(poses):
                if normalize_pose_name(existing.name) == normalize_pose_name(pose.name):
                    poses[index] = pose
                    break
            else:
                poses.append(pose)
            self._commit(poses)
            return pose

    def create(self, pose: JointPose) -> JointPose:
        """Add a pose under a name nobody holds; never replaces one."""
        with self._lock:
            if any(normalize_pose_name(existing.name) == normalize_pose_name(pose.name) for existing in self.poses):
                raise PositionExistsError(f"'{pose.name}' already exists")
            self._ensure_consistent_joints(pose)
            self._commit([*self.poses, pose])
            return pose

    def create_numbered(self, make: Callable[[str], JointPose]) -> JointPose:
        """Add a pose under the next free `pose_N`, chosen under the lock so two saves never pick the same one."""
        with self._lock:
            taken = {normalize_pose_name(pose.name) for pose in self.poses}
            index = 1
            while f"pose_{index}" in taken:
                index += 1
            pose = make(f"pose_{index}")
            self._ensure_consistent_joints(pose)
            self._commit([*self.poses, pose])
            return pose

    def remove(self, name: str) -> bool:
        with self._lock:
            for index, existing in enumerate(self.poses):
                if normalize_pose_name(existing.name) == normalize_pose_name(name):
                    self._commit(self.poses[:index] + self.poses[index + 1 :])
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
            if any(
                normalize_pose_name(pose.name) == normalize_pose_name(new_name) and pose.name != name
                for pose in self.poses
            ):
                raise PositionLibraryError(f"'{new_name}' already exists")
            for index, existing in enumerate(self.poses):
                if existing.name == name:
                    renamed = replace(existing, name=new_name)
                    self._commit([*self.poses[:index], renamed, *self.poses[index + 1 :]])
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
                "SELECT name, joint_names_json, positions_json, description, ee_pose_json FROM saved_positions"
                " WHERE config_id = ? AND app_id = ? ORDER BY position",
                (config_id, app_id),
            ).fetchall()
        return with_normalized_names(
            JointPose(
                name=str(row["name"]),
                joint_names=tuple(str(joint) for joint in json.loads(row["joint_names_json"])),
                positions=tuple(float(value) for value in json.loads(row["positions_json"])),
                description=str(row["description"]),
                ee_pose=CartesianPose.from_json(json.loads(row["ee_pose_json"])) if row["ee_pose_json"] else None,
            )
            for row in rows
        )

    def replace(self, config_id: str, app_id: str, poses: list[JointPose]) -> None:
        with sqlite_connection(self.database_path) as connection:
            connection.execute("BEGIN")
            connection.execute("DELETE FROM saved_positions WHERE config_id = ? AND app_id = ?", (config_id, app_id))
            connection.executemany(
                "INSERT INTO saved_positions"
                " (config_id, app_id, position, name, joint_names_json, positions_json, description, ee_pose_json)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    (
                        config_id,
                        app_id,
                        index,
                        pose.name,
                        json.dumps(list(pose.joint_names)),
                        json.dumps(list(pose.positions)),
                        pose.description,
                        json.dumps(pose.ee_pose.to_json()) if pose.ee_pose is not None else None,
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
        poses=with_normalized_names(store.load(config_id, app_id)),
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

    names = [normalize_pose_name(pose.name) for pose in pose_list]
    duplicates = sorted({name for name in names if names.count(name) > 1})
    if duplicates:
        # cartesian_manager normalizes target names and refuses to start on a duplicate.
        raise PositionLibraryError(f"two saved positions share the name {', '.join(duplicates)}")

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


def pose_offset(target: CartesianPose, current: CartesianPose) -> tuple[float, float]:
    """Metres and radians between two poses in one frame; q and -q are the same orientation."""
    metres = math.dist(target.position, current.position)
    dot = abs(sum(a * b for a, b in zip(target.orientation, current.orientation, strict=True)))
    return metres, 2 * math.acos(min(1.0, dot))


def hand_pose_fingerprint(pose: CartesianPose) -> str:
    """What a tablet previewed: a Go to naming another fingerprint was armed on a pose that has since changed."""
    values = ",".join(f"{value:.6f}" for value in (*pose.position, *pose.orientation))
    return hashlib.sha256(f"{bare_frame(pose.frame_id)}|{values}".encode()).hexdigest()[:16]


def bare_frame(frame_id: str) -> str:
    """tf2 names a frame without a leading slash; a stamp with one is the same frame."""
    return frame_id.strip().lstrip("/")


def render_pose_targets_yaml(poses: Iterable[JointPose], indent: str = "      ") -> str:
    """The `pose_targets` block for the manager's params: names, frames, positions and orientations only.

    Gains, speed caps and tolerances stay as the manager config has them, so the block is merged by hand.
    """
    reachable = [pose for pose in poses if pose.ee_pose is not None]
    if not reachable:
        return ""
    lines = [
        f"{indent}pose_targets:",
        f"{indent}  # Keep linear_kp, angular_kp, max_*_velocity and *_tolerance from the manager config.",
        f"{indent}  target_names: [{', '.join(pose.name for pose in reachable)}]",
        f"{indent}  frame_ids: [{', '.join(bare_frame(pose.ee_pose.frame_id) for pose in reachable)}]",
        f"{indent}  positions: [{', '.join(f'{v:.4f}' for pose in reachable for v in pose.ee_pose.position)}]",
        f"{indent}  orientations: [{', '.join(f'{v:.4f}' for pose in reachable for v in pose.ee_pose.orientation)}]",
    ]
    return "\n".join(lines)


def pose_target_payload(pose: CartesianPose) -> dict[str, object]:
    """The PoseStamped the manager's pose_target topic takes; the stamp stays zero, the manager reads none."""
    x, y, z = pose.position
    qx, qy, qz, qw = pose.orientation
    return {
        "header": {"frame_id": pose.frame_id},
        "pose": {
            "position": {"x": x, "y": y, "z": z},
            "orientation": {"x": qx, "y": qy, "z": qz, "w": qw},
        },
    }


__all__ = [
    "FRAME_ID_PATTERN",
    "CartesianPose",
    "JointPose",
    "PositionLibrary",
    "PositionExistsError",
    "PositionLibraryError",
    "pose_from_joint_state",
    "JOINT_NAME_PATTERN",
    "POSITION_NAME_PATTERN",
    "bare_frame",
    "hand_pose_fingerprint",
    "normalize_pose_name",
    "pose_offset",
    "pose_target_payload",
    "render_pose_targets_yaml",
    "render_joint_targets_yaml",
    "with_normalized_names",
]
