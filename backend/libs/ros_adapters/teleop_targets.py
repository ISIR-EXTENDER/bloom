"""The topics a joystick may drive: the manager's own inputs, read live, plus any the deployment adds.

Which inputs exist is cartesian_manager's business. Bloom reads the input topic names from the manager's
parameters, so a lab that renames or adds an input changes nothing on the Bloom side.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Sequence

from libs.ros_adapters.parameters import RosParameterGateway

logger = logging.getLogger(__name__)


class TeleopTargetDirectory:
    def __init__(
        self,
        static_targets: Sequence[str],
        parameter_gateway: RosParameterGateway,
        sources: Sequence[str] = (),
        refresh_sec: float = 5.0,
    ) -> None:
        self._static = tuple(static_targets)
        self._gateway = parameter_gateway
        self._sources = _group_by_node(sources)
        self._refresh_sec = refresh_sec
        self._discovered: tuple[str, ...] = ()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def targets(self) -> tuple[str, ...]:
        return tuple(dict.fromkeys((*self._static, *self._discovered)))

    def refresh(self) -> None:
        """One read of every source; a node that cannot answer keeps what it last said."""
        found: list[str] = []
        answered = False
        for node, names in self._sources.items():
            try:
                readings = self._gateway.get(node, names)
            except Exception as exc:  # noqa: BLE001 - a manager that is not up yet is the normal case at start
                logger.debug("Teleop targets: %s did not answer (%s).", node, exc)
                continue
            answered = True
            found.extend(r.value for r in readings if is_topic_name(r.value))
        if answered:
            self._discovered = tuple(dict.fromkeys(found))

    def start(self) -> None:
        if self._thread is not None or not self._sources:
            return
        self._thread = threading.Thread(target=self._run, name="teleop-target-directory", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _run(self) -> None:
        while not self._stop.is_set():
            self.refresh()
            self._stop.wait(self._refresh_sec)


def is_topic_name(value: object) -> bool:
    """One topic, never a namespace or a wildcard: the allowlist reads a trailing `/` as a whole namespace."""
    return isinstance(value, str) and value.startswith("/") and not value.endswith("/") and "*" not in value


def _group_by_node(sources: Sequence[str]) -> dict[str, tuple[str, ...]]:
    grouped: dict[str, list[str]] = {}
    for source in sources:
        node, _, name = source.partition(":")
        if node and name:
            grouped.setdefault(node, []).append(name)
    return {node: tuple(names) for node, names in grouped.items()}
