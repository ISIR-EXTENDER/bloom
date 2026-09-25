"""The robot description and the mesh files it points at, for the 3D robot view."""

from __future__ import annotations

import os
from collections.abc import Callable
from pathlib import Path
from typing import Protocol

from libs.ros_adapters.parameters import RosParameterGateway

ASSET_CONTENT_TYPES: dict[str, str] = {
    ".dae": "model/vnd.collada+xml",
    ".stl": "model/stl",
    ".obj": "text/plain",
    ".mtl": "text/plain",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}


class RobotModelGateway(Protocol):
    def description(self) -> str | None:
        raise NotImplementedError

    def asset(self, package: str, relative_path: str) -> Path | None:
        raise NotImplementedError


class NoopRobotModelGateway:
    """Safe default when no ROS node is attached."""

    def description(self) -> str | None:
        return None

    def asset(self, package: str, relative_path: str) -> Path | None:
        return None


class RclpyRobotModelGateway:
    """robot_description from the node that holds it, and package:// through the ament index."""

    def __init__(self, parameters: RosParameterGateway, node_name: str) -> None:
        self._parameters = parameters
        self._node_name = node_name

    def description(self) -> str | None:
        try:
            readings = self._parameters.get(self._node_name, ("robot_description",))
        except RuntimeError:
            # The node is not there: the robot is down, or not up yet. That is the unavailable state the
            # view polls for, not a fault, and the view asks again every few seconds until it appears.
            return None
        value = readings[0].value if readings else None
        return value if isinstance(value, str) and value.strip() else None

    def asset(self, package: str, relative_path: str) -> Path | None:
        return resolve_package_asset(package, relative_path, ament_share_directory)


def resolve_package_asset(
    package: str, relative_path: str, share_directory: Callable[[str], Path | None]
) -> Path | None:
    """The file a package:// URI names, or None: outside the share directory, or not a mesh, is not served."""
    if Path(relative_path).suffix.lower() not in ASSET_CONTENT_TYPES:
        return None
    share = share_directory(package)
    if share is None:
        return None
    # Containment is judged on the path as named, before any symlink: a symlink-installed workspace
    # links every mesh into the source tree, and the share directory vouches for what it links to.
    candidate = Path(os.path.normpath(share / relative_path))
    if share not in candidate.parents or not candidate.is_file():
        return None
    return candidate


def ament_share_directory(package: str) -> Path | None:
    try:
        from ament_index_python.packages import PackageNotFoundError, get_package_share_directory
    except ModuleNotFoundError:
        return None
    try:
        return Path(get_package_share_directory(package))
    except (PackageNotFoundError, ValueError):
        return None
