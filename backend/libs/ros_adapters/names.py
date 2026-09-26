"""ROS 2 name rules, checked before rclpy sees a name: its own errors are not ValueError and closed the socket."""

import re

_TOKEN = r"[A-Za-z_][A-Za-z0-9_]*"
_ABSOLUTE_NAME = re.compile(rf"/{_TOKEN}(?:/{_TOKEN})*")


def ros_name_error(name: str, kind: str = "topic") -> str | None:
    """Why `name` is not an absolute ROS topic or service name, or None when it is."""
    if not name.startswith("/"):
        return f"ROS {kind} must start with '/'"
    if any(character.isspace() for character in name):
        return f"ROS {kind} must not contain whitespace"
    if not _ABSOLUTE_NAME.fullmatch(name):
        return (
            f"ROS {kind} '{name}' is not a valid name: use letters, digits and '_' between single '/', "
            "and no part may start with a digit"
        )
    return None


def require_ros_name(name: str, kind: str = "topic") -> str:
    normalized = name.strip()
    error = ros_name_error(normalized, kind)
    if error:
        raise ValueError(error)
    return normalized
