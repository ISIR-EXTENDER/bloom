"""Safety work handed to a thread runs even when the socket handler is cancelled again and again."""

from __future__ import annotations

import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

from apps.bloom_api.routes.runtime_common import cancel_runtime_task, run_runtime_thread


def test_a_queued_job_survives_repeated_cancellation() -> None:
    executor = ThreadPoolExecutor(max_workers=1)
    busy = threading.Event()
    ran = threading.Event()
    executor.submit(busy.wait, 5)

    async def main() -> None:
        task = asyncio.create_task(run_runtime_thread(ran.set, executor=executor))
        await asyncio.sleep(0.01)
        # anyio cancels a scope again on every await, the way a closing test socket does.
        for _ in range(3):
            task.cancel()
            await asyncio.sleep(0.01)
        busy.set()
        await asyncio.wait_for(task, 5)

    asyncio.run(main())
    executor.shutdown(wait=True)

    assert ran.is_set()


def test_the_jobs_result_and_arguments_come_back_through_the_cancellations() -> None:
    executor = ThreadPoolExecutor(max_workers=1)
    release = threading.Event()

    def neutralize(target: str, wait: threading.Event) -> str:
        wait.wait(5)
        return f"zeroed {target}"

    async def main() -> str:
        task = asyncio.create_task(run_runtime_thread(neutralize, "/joystick_cartesian_command", release))
        await asyncio.sleep(0.01)
        task.cancel()
        await asyncio.sleep(0.01)
        release.set()
        return await asyncio.wait_for(task, 5)

    try:
        assert asyncio.run(main()) == "zeroed /joystick_cartesian_command"
    finally:
        executor.shutdown(wait=True)


def test_a_failing_job_raises_its_own_error_not_a_cancellation() -> None:
    started = threading.Event()
    release = threading.Event()

    def failing() -> None:
        started.set()
        release.wait(5)
        raise RuntimeError("zero could not be published")

    async def main() -> None:
        task = asyncio.create_task(run_runtime_thread(failing))
        await asyncio.get_running_loop().run_in_executor(None, started.wait, 5)
        task.cancel()
        await asyncio.sleep(0.01)
        release.set()
        with pytest.raises(RuntimeError, match="zero could not be published"):
            await asyncio.wait_for(task, 5)

    asyncio.run(main())


def test_cancelling_a_runtime_task_waits_for_it_and_tolerates_none_or_a_finished_one() -> None:
    async def main() -> None:
        await cancel_runtime_task(None)

        finished = asyncio.create_task(asyncio.sleep(0))
        await finished
        await cancel_runtime_task(finished)
        assert finished.done() and not finished.cancelled()

        pending = asyncio.create_task(asyncio.sleep(10))
        await cancel_runtime_task(pending)
        assert pending.cancelled()

    asyncio.run(main())
