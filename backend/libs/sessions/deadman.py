"""Zero a moving teleop twist its sender stopped refreshing: the legacy /teleop_cmd controller never expires one."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable

from libs.sessions.audit import RuntimeAuditLog, RuntimeAuditRecord
from libs.sessions.manager import RuntimeSessionManager, zero_of
from libs.sessions.stop import RuntimeStopController, RuntimeStoppedError
from libs.sessions.teleop import TeleopCommandGateway

logger = logging.getLogger(__name__)

#: How often the deadman looks; the browser streams every 50 ms, so a live operator is never near the timeout.
TELEOP_DEADMAN_INTERVAL_SEC = 0.1


def zero_stale_teleop(
    manager: RuntimeSessionManager,
    gateway: TeleopCommandGateway,
    stop_controller: RuntimeStopController,
    audit_log: RuntimeAuditLog,
    max_age_sec: float,
) -> int:
    stale = manager.stale_teleop_commands(max_age_sec)
    for session_id, command in stale:
        zero = zero_of(command)
        try:
            try:
                receipt = stop_controller.execute_if_running(lambda zero=zero: gateway.publish(zero))
            except RuntimeStoppedError:
                receipt = gateway.publish(zero)
        except RuntimeError as exc:
            # Kept recorded, so the next sweep tries again.
            detail, status = f"Teleop deadman could not zero a silent twist: {exc}", "rejected"
        else:
            manager.forget_teleop_command(session_id, command)
            detail = f"Teleop deadman zeroed a twist not refreshed for {max_age_sec:g} s. {receipt.detail}"
            status = "accepted"
        audit_log.record(
            RuntimeAuditRecord(
                channel="runtime_control", detail=detail, session_id=session_id, status=status, target=command.target
            )
        )
    return len(stale)


async def run_teleop_deadman(sweep: Callable[[], int], interval_sec: float = TELEOP_DEADMAN_INTERVAL_SEC) -> None:
    while True:
        await asyncio.sleep(interval_sec)
        try:
            await asyncio.to_thread(sweep)
        except Exception:
            logger.exception("Teleop deadman sweep failed.")
