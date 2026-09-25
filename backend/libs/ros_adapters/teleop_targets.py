"""The topics a joystick may drive: the manager's declared inputs, read live, plus any the deployment adds.

Which inputs exist is cartesian_manager's business. Bloom reads `inputs.sources` and each source's
`topics.<source>_command`, so an input the manager does not declare is never offered.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Sequence

from libs.ros_adapters.parameters import RosParameterGateway

logger = logging.getLogger(__name__)

SOURCES_PARAMETER = "inputs.sources"


class TeleopTargetDirectory:
    def __init__(
        self,
        static_targets: Sequence[str],
        parameter_gateway: RosParameterGateway,
        node: str = "",
        refresh_sec: float = 5.0,
    ) -> None:
        self._static = tuple(static_targets)
        self._gateway = parameter_gateway
        self._node = node
        self._refresh_sec = refresh_sec
        self._discovered: tuple[str, ...] = ()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def targets(self) -> tuple[str, ...]:
        return tuple(dict.fromkeys((*self._static, *self._discovered)))

    def refresh(self) -> None:
        """One read of the manager; a manager that cannot answer keeps what it last said."""
        read_list = getattr(self._gateway, "get_string_list", None)
        if not self._node or read_list is None:
            return
        try:
            sources = read_list(self._node, SOURCES_PARAMETER)
            if sources is None:
                return
            readings = self._gateway.get(self._node, tuple(f"topics.{source}_command" for source in sources))
        except Exception as exc:  # noqa: BLE001 - a manager that is not up yet is the normal case at start
            logger.debug("Teleop targets: %s did not answer (%s).", self._node, exc)
            return
        found = (r.value for r in readings if isinstance(r.value, str) and r.value.startswith("/"))
        self._discovered = tuple(dict.fromkeys(found))

    def start(self) -> None:
        if self._thread is not None or not self._node:
            return
        self._thread = threading.Thread(target=self._run, name="teleop-target-directory", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _run(self) -> None:
        while not self._stop.is_set():
            self.refresh()
            self._stop.wait(self._refresh_sec)
