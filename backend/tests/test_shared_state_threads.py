"""The rate limiter and audit log are shared by the event loop and worker threads."""

import sys
from concurrent.futures import ThreadPoolExecutor

import pytest

from libs.sessions import InMemoryRuntimeAuditLog, RuntimeAuditRecord, RuntimeCommandRateLimiter, RuntimeRateLimitError


@pytest.fixture(autouse=True)
def frequent_switches():
    previous = sys.getswitchinterval()
    sys.setswitchinterval(1e-6)
    yield
    sys.setswitchinterval(previous)


def test_rate_limiter_never_admits_more_than_its_budget_across_threads() -> None:
    limiter = RuntimeCommandRateLimiter(max_commands_per_second=500, clock=lambda: 10.0)

    def attempt(_: int) -> bool:
        try:
            limiter.ensure_allowed("/mode_request")
        except RuntimeRateLimitError:
            return False
        return True

    with ThreadPoolExecutor(8) as pool:
        admitted = sum(pool.map(attempt, range(4000)))

    assert admitted == 500


def test_audit_log_keeps_every_record_written_from_many_threads() -> None:
    audit_log = InMemoryRuntimeAuditLog(max_records=10_000)

    def write(index: int) -> None:
        audit_log.record(RuntimeAuditRecord(channel="runtime_control", status="accepted", detail=f"record {index}"))

    with ThreadPoolExecutor(8) as pool:
        list(pool.map(write, range(4000)))

    records = audit_log.list_records(10_000)
    assert len(records) == 4000
    assert len({record.detail for record in records}) == 4000
