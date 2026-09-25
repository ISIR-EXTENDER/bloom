"""STOP must answer at once, whatever else the robot-facing API is waiting on."""

import json
import socket
import time
import urllib.request
from threading import Event, Thread

import uvicorn
from fastapi.testclient import TestClient
from websockets.sync.client import connect

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters.services import RosServiceReceipt, RosServiceRequest

SLOW_SECONDS = 2.0


class SlowServiceGateway:
    def __init__(self) -> None:
        self.started = Event()
        self.calls = 0

    def call(self, request: RosServiceRequest) -> RosServiceReceipt:
        self.calls += 1
        self.started.set()
        time.sleep(SLOW_SECONDS)
        return RosServiceReceipt(
            detail="done",
            service=request.service,
            service_type=request.service_type,
            status="called",
            success=True,
        )


def settings() -> Settings:
    return Settings(environment="test", http_rate_limit_per_minute=0, seed_shared_applications=False)


def test_stop_answers_at_once_while_a_service_call_is_in_flight() -> None:
    # A fault reset can wait up to four seconds on the robot. STOP must not.
    service = SlowServiceGateway()
    client = TestClient(create_app(settings(), InMemoryConfigurationRepository(), ros_service_gateway=service))
    call = Thread(
        target=lambda: client.post(
            "/api/v1/ros/services/call",
            json={"service": "/fault_controller/reset_fault", "service_type": "std_srvs/srv/Trigger"},
        )
    )
    call.start()
    assert service.started.wait(2)

    started = time.monotonic()
    response = client.post("/api/v1/runtime/stop")
    elapsed = time.monotonic() - started
    call.join()

    assert response.status_code == 200
    assert response.json()["stopped"] is True
    assert elapsed < SLOW_SECONDS / 2, f"STOP took {elapsed:.2f}s behind a service call"


def test_a_service_call_is_still_refused_while_stopped() -> None:
    service = SlowServiceGateway()
    client = TestClient(create_app(settings(), InMemoryConfigurationRepository(), ros_service_gateway=service))
    assert client.post("/api/v1/runtime/stop").status_code == 200

    response = client.post(
        "/api/v1/ros/services/call",
        json={"service": "/fault_controller/reset_fault", "service_type": "std_srvs/srv/Trigger"},
    )

    assert response.status_code == 409
    assert service.calls == 0


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def test_a_slow_service_call_does_not_freeze_other_sockets() -> None:
    # Teleop takes the STOP gate on the event loop. While a service call held
    # that gate, one teleop message froze every socket and HTTP response on the
    # server, STOP included. The test client gives each connection its own
    # event loop, which hides this, so it runs against a real server.
    service = SlowServiceGateway()
    app = create_app(settings(), InMemoryConfigurationRepository(), ros_service_gateway=service)
    port = free_port()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning", lifespan="off"))
    thread = Thread(target=server.run, daemon=True)
    thread.start()
    try:
        deadline = time.monotonic() + 10
        while not server.started and time.monotonic() < deadline:
            time.sleep(0.05)
        assert server.started

        call = Thread(
            target=lambda: urllib.request.urlopen(
                urllib.request.Request(
                    f"http://127.0.0.1:{port}/api/v1/ros/services/call",
                    data=json.dumps(
                        {"service": "/fault_controller/reset_fault", "service_type": "std_srvs/srv/Trigger"}
                    ).encode(),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                ),
                timeout=SLOW_SECONDS * 3,
            ).read()
        )
        call.start()
        assert service.started.wait(2)

        url = f"ws://127.0.0.1:{port}/api/v1/runtime/ws"
        with connect(url) as driver, connect(url) as watcher:
            driver.recv()
            watcher.recv()
            driver.send(
                json.dumps(
                    {
                        "type": "teleop_cmd",
                        "linear": {"x": 0.2, "y": 0, "z": 0},
                        "angular": {"x": 0, "y": 0, "z": 0},
                        "seq": 1,
                        "target": "/tablet_cartesian_command",
                    }
                )
            )

            started = time.monotonic()
            watcher.send(json.dumps({"type": "ping"}))
            reply = json.loads(watcher.recv(timeout=SLOW_SECONDS * 2))
            elapsed = time.monotonic() - started

            assert reply["type"] == "pong"
            assert elapsed < SLOW_SECONDS / 2, f"a ping waited {elapsed:.2f}s behind a service call"
        call.join(SLOW_SECONDS * 3)
    finally:
        server.should_exit = True
        thread.join(5)
