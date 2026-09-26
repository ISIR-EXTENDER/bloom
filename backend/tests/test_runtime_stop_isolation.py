"""STOP and ordinary routes stay responsive while ROS reads hang on a node that is down."""

import socket
import time
import urllib.request
from threading import Event, Lock, Thread

import uvicorn

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters.parameters import RosParameterReading

SLOW_SECONDS = 2.0
READERS = 50


class HangingParameterGateway:
    def __init__(self) -> None:
        self.release = Event()
        self.in_flight = 0
        self._lock = Lock()

    def get(self, node: str, names: tuple[str, ...]) -> tuple[RosParameterReading, ...]:
        with self._lock:
            self.in_flight += 1
        self.release.wait(10)
        return tuple(RosParameterReading(node=node, name=name, value=None) for name in names)


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def timed(url: str, method: str = "GET") -> tuple[int, float]:
    started = time.monotonic()
    request = urllib.request.Request(url, method=method, data=b"" if method == "POST" else None)
    with urllib.request.urlopen(request) as response:
        return response.status, time.monotonic() - started


def test_stop_and_sync_routes_answer_while_parameter_reads_hang() -> None:
    gateway = HangingParameterGateway()
    settings = Settings(environment="test", http_rate_limit_per_minute=0, seed_shared_applications=False)
    app = create_app(settings, InMemoryConfigurationRepository(), ros_parameter_gateway=gateway)
    port = free_port()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning", lifespan="off"))
    thread = Thread(target=server.run, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{port}/api/v1"
    readers: list[Thread] = []
    try:
        deadline = time.monotonic() + 10
        while not server.started and time.monotonic() < deadline:
            time.sleep(0.05)
        assert server.started

        # More readers than the default 40-thread pool holds.
        read_url = f"{base}/ros/parameters?node=/cartesian_manager&names=shapers.snake.gain"
        readers = [Thread(target=lambda: timed(read_url), daemon=True) for _ in range(READERS)]
        for reader in readers:
            reader.start()
        deadline = time.monotonic() + 5
        while gateway.in_flight < settings.ros_read_concurrency and time.monotonic() < deadline:
            time.sleep(0.05)
        assert gateway.in_flight == settings.ros_read_concurrency
        time.sleep(0.3)

        stop_status, stop_elapsed = timed(f"{base}/runtime/stop", "POST")
        state_status, state_elapsed = timed(f"{base}/runtime/stop")

        assert stop_status == 200
        assert state_status == 200
        assert stop_elapsed < SLOW_SECONDS / 2, f"STOP took {stop_elapsed:.2f}s behind parameter reads"
        assert state_elapsed < SLOW_SECONDS / 2, f"a sync route took {state_elapsed:.2f}s behind parameter reads"
    finally:
        gateway.release.set()
        for reader in readers:
            reader.join(10)
        server.should_exit = True
        thread.join(5)
