from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository


def test_runtime_websocket_accepts_ping_messages() -> None:
    app = create_app(Settings(environment="test"), InMemoryConfigurationRepository())
    client = TestClient(app)

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        connected = websocket.receive_json()
        websocket.send_json({"type": "ping"})
        pong = websocket.receive_json()

    assert connected["type"] == "session_connected"
    assert connected["active_sessions"] == 1
    assert pong == {
        "type": "pong",
        "active_sessions": None,
        "detail": "Runtime session is alive.",
        "payload": {},
        "session_id": connected["session_id"],
    }
    assert app.state.runtime_session_manager.active_session_count == 0


def test_runtime_websocket_accepts_topic_subscriptions() -> None:
    client = TestClient(create_app(Settings(environment="test"), InMemoryConfigurationRepository()))

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        connected = websocket.receive_json()
        websocket.send_json(
            {
                "type": "subscribe_topic",
                "field_path": "data",
                "message_type": "std_msgs/msg/Float64",
                "topic": "/sandbox_controller/velocity_command",
            }
        )
        response = websocket.receive_json()

    assert response == {
        "type": "subscription_ack",
        "active_sessions": None,
        "detail": "Subscribed to /sandbox_controller/velocity_command.",
        "payload": {
            "field_path": "data",
            "message_type": "std_msgs/msg/Float64",
            "topic": "/sandbox_controller/velocity_command",
        },
        "session_id": connected["session_id"],
    }


def test_runtime_websocket_accepts_teleop_commands() -> None:
    client = TestClient(create_app(Settings(environment="test"), InMemoryConfigurationRepository()))

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        connected = websocket.receive_json()
        websocket.send_json(
            {
                "type": "teleop_cmd",
                "axes": {"x": 0.1, "y": -0.2, "z": 0.0},
                "mode": 4,
                "seq": 42,
            }
        )
        response = websocket.receive_json()

    assert response == {
        "type": "teleop_ack",
        "active_sessions": None,
        "detail": "Teleop command accepted by runtime session.",
        "payload": {
            "axes": {"x": 0.1, "y": -0.2, "z": 0.0},
            "mode": 4,
            "seq": 42,
        },
        "session_id": connected["session_id"],
    }


def test_runtime_websocket_reports_invalid_messages_without_closing() -> None:
    client = TestClient(create_app(Settings(environment="test"), InMemoryConfigurationRepository()))

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        connected = websocket.receive_json()
        websocket.send_json({"type": "subscribe_topic", "topic": "not/absolute"})
        error = websocket.receive_json()
        websocket.send_json({"type": "ping"})
        pong = websocket.receive_json()

    assert error["type"] == "runtime_error"
    assert error["detail"] == "Invalid runtime message."
    assert error["session_id"] == connected["session_id"]
    assert "topic must start with '/'" in error["payload"]["message"]
    assert pong["type"] == "pong"
