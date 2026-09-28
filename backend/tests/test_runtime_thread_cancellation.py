"""Safety work handed to a thread runs even when the socket handler is cancelled again and again."""

from __future__ import annotations

import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor

from apps.bloom_api.routes.runtime_common import run_runtime_thread


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
