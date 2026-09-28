"""The runtime socket pushes the command-state store: on connect, on change, and on a fixed period (ADR 0142)."""

from __future__ import annotations

import time
from typing import Any

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.sessions.command_state import manager_key, session_alias

pytestmark = pytest.mark.command_state

PUBLISH = "/api/v1/ros/topics/publish"


def make(period: float = 0.2, rate_hz: float = 20.0, **settings: Any) -> TestClient:
    return TestClient(
        create_app(
            Settings(
                environment="test",
                command_state_push_period_sec=period,
                command_state_max_rate_hz=rate_hz,
                runtime_control_required=False,
                **settings,
            ),
            InMemoryConfigurationRepository(),
        )
    )


def next_state(websocket: Any, predicate=lambda message: True, timeout: float = 3.0) -> dict:
    """Poll the socket: other messages and older states pass by until one matches."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        message = websocket.receive_json()
        if message.get("type") == "command_state" and predicate(message):
            return message
    raise AssertionError("no matching command_state arrived")


def test_the_store_follows_session_connected_at_once() -> None:
    client = make(period=5.0)
    client.app.state.command_state_store.write("/ui/lamp", {"data": True}, "commanded", "api")

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        connected = websocket.receive_json()
        assert connected["type"] == "session_connected"
        pushed = websocket.receive_json()

    assert pushed == {
        "type": "command_state",
        "revision": 1,
        "self": session_alias(connected["session_id"]),
        "snapshot": {
            "/ui/lamp": {
                "value": {"data": True},
                "source": "commanded",
                "updated_at": pushed["snapshot"]["/ui/lamp"]["updated_at"],
                "by": "api",
                "revision": 1,
            }
        },
    }


def test_a_change_is_pushed_without_waiting_for_the_period() -> None:
    client = make(period=5.0)
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.receive_json()
        started = time.monotonic()

        response = client.post(
            PUBLISH,
            json={
                "topic": "/mode_request",
                "message_type": "std_msgs/msg/String",
                "payload": {"data": "geometric/snake"},
            },
        )
        assert response.status_code == 200
        pushed = next_state(websocket)

    assert time.monotonic() - started < 2.0
    assert pushed["snapshot"][manager_key("shaping")]["value"] == "geometric/snake"


def test_the_snapshot_is_pushed_again_on_the_period_without_changes() -> None:
    client = make(period=0.2)
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        first = websocket.receive_json()
        started = time.monotonic()
        second = next_state(websocket)
        third = next_state(websocket)

    assert first["revision"] == second["revision"] == third["revision"] == 0
    assert time.monotonic() - started < 1.5


def test_a_burst_of_changes_is_coalesced() -> None:
    client = make(period=5.0, rate_hz=5.0)
    store = client.app.state.command_state_store
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.receive_json()
        for value in range(50):
            store.write("/ui/level", value, "commanded", "api")
        pushed = [next_state(websocket)]
        while pushed[-1]["revision"] != 50:
            pushed.append(next_state(websocket))

    assert len(pushed) <= 3
    assert pushed[-1]["snapshot"]["/ui/level"]["value"] == 49


def test_observers_and_a_second_tablet_see_the_same_record() -> None:
    client = make(period=0.2, auth_enabled=True, operator_api_key="op-key", observer_api_key="obs-key")
    with (
        client.websocket_connect("/api/v1/runtime/ws", headers={"X-Bloom-API-Key": "op-key"}) as operator,
        client.websocket_connect("/api/v1/runtime/ws", headers={"X-Bloom-API-Key": "obs-key"}) as observer,
    ):
        operator.receive_json()
        observer.receive_json()
        client.app.state.command_state_store.write("/ui/lamp", {"data": True}, "commanded", "api")

        seen = [next_state(socket, lambda message: message["revision"] == 1) for socket in (operator, observer)]

    assert seen[0]["snapshot"] == seen[1]["snapshot"]


def test_topic_samples_and_replies_still_arrive_between_pushes() -> None:
    client = make(period=0.05)
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json({"type": "ping"})
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            message = websocket.receive_json()
            if message["type"] == "pong":
                break
        else:
            raise AssertionError("pong never arrived")


def test_a_closed_socket_stops_listening_to_the_store() -> None:
    client = make(period=5.0)
    store = client.app.state.command_state_store
    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.receive_json()
        assert len(store._listeners) == 1

    deadline = time.monotonic() + 2
    while store._listeners and time.monotonic() < deadline:
        time.sleep(0.01)
    assert store._listeners == []
    store.write("/ui/lamp", {"data": True}, "commanded", "api")


def test_each_socket_is_told_its_own_alias_and_sees_its_writes_by_it() -> None:
    client = make(period=5.0)

    with (
        client.websocket_connect("/api/v1/runtime/ws") as first,
        client.websocket_connect("/api/v1/runtime/ws") as second,
    ):
        first_id = first.receive_json()["session_id"]
        second_id = second.receive_json()["session_id"]
        assert next_state(first)["self"] == session_alias(first_id)
        assert next_state(second)["self"] == session_alias(second_id)
        assert session_alias(first_id) != session_alias(second_id)

        client.app.state.command_state_tracker.record_publish("/ui/lamp", "std_msgs/msg/Bool", {"data": True}, first_id)
        seen = next_state(second, lambda message: "/ui/lamp" in message["snapshot"])
        assert seen["snapshot"]["/ui/lamp"]["by"] == session_alias(first_id) != seen["self"]
