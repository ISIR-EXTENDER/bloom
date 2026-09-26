"""A runtime socket that loops on non-teleop messages is slowed down, not dropped."""

from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.routes.runtime_socket import SocketMessageBudget
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository


class CountingRepository(InMemoryConfigurationRepository):
    def __init__(self) -> None:
        super().__init__()
        self.reads = 0

    def get(self, config_id: str):
        self.reads += 1
        return super().get(config_id)


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def test_budget_allows_a_burst_then_refills_and_never_meters_ping_or_teleop() -> None:
    clock = Clock()
    budget = SocketMessageBudget(rate_per_sec=20, burst=40, clock=clock)
    subscribe = {"type": "subscribe_topic"}

    assert all(budget.allow(subscribe) for _ in range(40))
    assert budget.allow(subscribe) is False
    assert budget.allow({"type": "ping"}) is True
    assert budget.allow({"type": "teleop_cmd"}) is True

    clock.now = 0.5
    assert sum(budget.allow(subscribe) for _ in range(20)) == 10


def test_a_spamming_socket_gets_errors_and_stays_open_with_one_store_read() -> None:
    repository = CountingRepository()
    client = TestClient(create_app(Settings(environment="test"), repository))
    message = {"type": "app_context", "config_id": "sandbox", "app_id": "sandbox"}

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        replies = []
        for _ in range(60):
            websocket.send_json(message)
            replies.append(websocket.receive_json())
        websocket.send_json({"type": "ping"})
        pong = websocket.receive_json()

    codes = [reply.get("payload", {}).get("code") for reply in replies]
    assert "message_rate_limited" in codes
    assert codes.count("app_context_unknown") >= 40
    assert pong["type"] == "pong"
    assert repository.reads == 1
