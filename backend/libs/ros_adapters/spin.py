"""One rclpy spin so a just-published message leaves the node before the request returns."""

from typing import Any


def spin_node_once(node: Any, purpose: str, timeout_sec: float = 0.05) -> None:
    try:
        import rclpy
    except ModuleNotFoundError as exc:
        raise RuntimeError(f"rclpy is required to {purpose}") from exc

    rclpy.spin_once(node, timeout_sec=timeout_sec)
