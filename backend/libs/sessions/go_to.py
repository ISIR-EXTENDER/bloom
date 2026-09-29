"""Go to a saved pose, followed on the server: what the manager reports, how far the tip is, and a watchdog.

The manager follows a pose target until it is within tolerance and reports nothing else: a pose the arm cannot
reach keeps it in behaviour/pose_target with the pad ignored. The monitor ends that with passthrough when the tip
stops closing in, or after three times the time the move should take.

/ee_pose is qontrol's commanded tip, not the measured one. The offset is measured through TF when a tip frame and
live joint states are known, and says it is the commanded pose otherwise.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass
from time import monotonic
from typing import Any

from libs.ros_adapters.mode_request import MODE_REQUEST_TOPIC, PASSTHROUGH_MODE, POSE_TARGET_TOPIC
from libs.sessions.command_state import BY_SERVER, CommandStateStore, manager_key, parameter_key
from libs.sessions.positions import CartesianPose, bare_frame, pose_offset

logger = logging.getLogger(__name__)

GO_KEY = "positions:go"
POSE_TARGET_BEHAVIOUR = "behaviour/pose_target"
#: Twice the manager's shipped tolerances (1 cm, 0.05 rad): inside, the arm arrived; outside, it stopped short.
ARRIVED_METRES = 0.02
ARRIVED_RADIANS = 0.1
#: No progress: neither 2 mm nor 0.02 rad closer over 3 s.
PROGRESS_WINDOW_SEC = 3.0
PROGRESS_METRES = 0.002
PROGRESS_RADIANS = 0.02
#: Three times the time the move needs at the slower of the manager's cap and the controller's limit, plus 5 s.
TIMEOUT_FACTOR = 3.0
TIMEOUT_SLACK_SEC = 5.0
#: The slowest speeds a shipped arm runs at, for a limit nobody has reported yet (the Kinova's Slow segment).
FALLBACK_LINEAR_SPEED = 0.025
FALLBACK_ANGULAR_SPEED = 0.1
WRITE_PERIOD_SEC = 0.25
#: A /ee_pose or /joint_states sample older than this is not the arm's present.
LIVE_SAMPLE_SEC = 1.0
#: Read-only facts Bloom reads from each node, so the manager and the controller own them.
MANAGER_FACT_PARAMETERS = (
    "inputs.sources",
    "frames.base_frame",
    "topics.pose_target",
    "topics.mode_request",
    "behaviours.pose_targets.max_linear_velocity",
    "behaviours.pose_targets.max_angular_velocity",
)
CONTROLLER_FACT_PARAMETERS = ("tip_frame", "command_max_linear_velocity", "command_max_angular_velocity")


@dataclass(frozen=True)
class ManagerFacts:
    """What the running manager and controller said about themselves, read from their parameters."""

    base_frame: str | None
    pose_target_topic: str
    mode_topic: str
    tip_frame: str | None
    linear_speed: float
    angular_speed: float


def read_manager_facts(
    store: CommandStateStore,
    manager_node: str,
    controller_node: str,
    tip_frame_override: str = "",
    speed_topics: tuple[str, str] = ("", ""),
) -> ManagerFacts:
    def param(node: str, name: str) -> Any:
        entry = store.get(parameter_key(node, name))
        return entry.value if entry is not None and entry.source != "unknown" else None

    def text(value: Any) -> str | None:
        return bare_frame(value) if isinstance(value, str) and value.strip() else None

    def number(value: Any) -> float | None:
        return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0 else None

    def published(topic: str) -> float | None:
        entry = store.get(topic) if topic else None
        data = entry.value.get("data") if entry is not None and isinstance(entry.value, dict) else None
        return number(data)

    def speed(cap: str, limit: str, topic: str, fallback: float) -> float:
        # Output is unit scale capped at the manager's max, then scaled by the controller's limit.
        manager_cap = number(param(manager_node, f"behaviours.pose_targets.{cap}"))
        controller = published(topic) or number(param(controller_node, limit))
        known = [value for value in (manager_cap, controller) if value is not None]
        return min(known) if known else fallback

    pose_topic = param(manager_node, "topics.pose_target")
    mode_topic = param(manager_node, "topics.mode_request")
    return ManagerFacts(
        base_frame=text(param(manager_node, "frames.base_frame")),
        pose_target_topic=pose_topic
        if isinstance(pose_topic, str) and pose_topic.startswith("/")
        else POSE_TARGET_TOPIC,
        mode_topic=mode_topic if isinstance(mode_topic, str) and mode_topic.startswith("/") else MODE_REQUEST_TOPIC,
        tip_frame=text(tip_frame_override) or text(param(controller_node, "tip_frame")),
        linear_speed=speed(
            "max_linear_velocity", "command_max_linear_velocity", speed_topics[0], FALLBACK_LINEAR_SPEED
        ),
        angular_speed=speed(
            "max_angular_velocity", "command_max_angular_velocity", speed_topics[1], FALLBACK_ANGULAR_SPEED
        ),
    )


@dataclass
class _Active:
    name: str
    config_id: str
    app_id: str
    target: CartesianPose
    mode_topic: str
    deadline: float
    best_metres: float
    best_radians: float
    best_at: float
    written_at: float = float("-inf")
    written: tuple[str, int, int] | None = None


class GoToMonitor:
    """One Go to at a time, as the manager holds one pose target; a newer one replaces it."""

    def __init__(
        self,
        store: CommandStateStore,
        *,
        hand: Callable[[], tuple[CartesianPose | None, bool]],
        cancel: Callable[[str], None],
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self._store = store
        self._hand = hand
        self._cancel = cancel
        self._clock = clock
        self._lock = threading.Lock()
        self._active: _Active | None = None

    def start(
        self,
        name: str,
        config_id: str,
        app_id: str,
        target: CartesianPose,
        mode_topic: str,
        linear_speed: float,
        angular_speed: float,
    ) -> None:
        now = self._clock()
        current, measured = self._hand()
        metres, radians = pose_offset(target, current) if current is not None else (0.0, 0.0)
        expected = max(metres / linear_speed, radians / angular_speed)
        active = _Active(
            name=name,
            config_id=config_id,
            app_id=app_id,
            target=target,
            mode_topic=mode_topic,
            deadline=now + TIMEOUT_FACTOR * expected + TIMEOUT_SLACK_SEC,
            best_metres=metres,
            best_radians=radians,
            best_at=now,
        )
        with self._lock:
            self._active = active
            self._write(active, "going", current, measured, now, force=True)

    def active_name(self, config_id: str, app_id: str) -> str | None:
        with self._lock:
            active = self._active
            return active.name if active and (active.config_id, active.app_id) == (config_id, app_id) else None

    def tick(self) -> None:
        with self._lock:
            active = self._active
            if active is None:
                return
            now = self._clock()
            current, measured = self._hand()
            behaviour = self._store.get(manager_key("behaviour", active.mode_topic))
            running = behaviour is not None and behaviour.value == POSE_TARGET_BEHAVIOUR
            if not running:
                if behaviour is None or behaviour.source == "unknown":
                    return
                self._finish(active, self._arrival(active, current), current, measured, now)
                return
            state = "moving" if behaviour.source == "measured" else "going"
            if current is not None:
                metres, radians = pose_offset(active.target, current)
                if metres < active.best_metres - PROGRESS_METRES or radians < active.best_radians - PROGRESS_RADIANS:
                    active.best_metres = min(active.best_metres, metres)
                    active.best_radians = min(active.best_radians, radians)
                    active.best_at = now
            stalled = now - active.best_at > PROGRESS_WINDOW_SEC
            if stalled or now > active.deadline:
                reason = "stopped closing in" if stalled else "took three times as long as the move needs"
                try:
                    self._cancel(active.mode_topic)
                except Exception:  # noqa: BLE001 - the record still says the pose was not reached
                    logger.exception("Go to %s: passthrough could not be sent after it %s.", active.name, reason)
                self._finish(active, "unreachable", current, measured, now)
                return
            self._write(active, state, current, measured, now)

    def _arrival(self, active: _Active, current: CartesianPose | None) -> str:
        if current is None:
            return "stopped"
        metres, radians = pose_offset(active.target, current)
        return "arrived" if metres <= ARRIVED_METRES and radians <= ARRIVED_RADIANS else "stopped"

    def _finish(self, active: _Active, state: str, current: CartesianPose | None, measured: bool, now: float) -> None:
        self._write(active, state, current, measured, now, force=True)
        self._active = None

    def _write(
        self,
        active: _Active,
        state: str,
        current: CartesianPose | None,
        measured: bool,
        now: float,
        *,
        force: bool = False,
    ) -> None:
        metres, radians = pose_offset(active.target, current) if current is not None else (None, None)
        millimetres = round(metres * 1000) if metres is not None else -1
        degrees = round(radians * 57.29577951308232) if radians is not None else -1
        written = (state, millimetres, degrees)
        if not force and (
            written == active.written
            or (
                now - active.written_at < WRITE_PERIOD_SEC and active.written is not None and active.written[0] == state
            )
        ):
            return
        active.written, active.written_at = written, now
        self._store.write(
            GO_KEY,
            {
                "name": active.name,
                "config_id": active.config_id,
                "app_id": active.app_id,
                "state": state,
                "offset_mm": millimetres if metres is not None else None,
                "offset_deg": degrees if radians is not None else None,
                "measured": measured and current is not None,
            },
            "measured" if measured else "commanded",
            BY_SERVER,
        )


def passthrough_canceller(publish_mode_reset: Callable[[str, str], str], audit: Callable[[str], None]):
    """The watchdog's way out: the STOP controller's own mode reset, audited."""

    def cancel(mode_topic: str) -> None:
        detail = publish_mode_reset(mode_topic, PASSTHROUGH_MODE)
        audit(f"Go to could not reach its pose; the server sent passthrough. {detail}")

    return cancel


__all__ = [
    "CONTROLLER_FACT_PARAMETERS",
    "LIVE_SAMPLE_SEC",
    "MANAGER_FACT_PARAMETERS",
    "ARRIVED_METRES",
    "ARRIVED_RADIANS",
    "GO_KEY",
    "GoToMonitor",
    "ManagerFacts",
    "passthrough_canceller",
    "read_manager_facts",
]
