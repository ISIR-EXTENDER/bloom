"""Random interleavings end with every socket showing the store, and the store equal to a reference model (ADR 0142)."""

from __future__ import annotations

import random
import tempfile
import time
from collections import Counter, deque
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters import RosPublishReceipt, RosPublishRequest
from libs.ros_adapters.parameters import RosParameterReceipt, RosParameterRequest
from libs.sessions.command_state import session_alias

pytestmark = pytest.mark.command_state

PERIOD = 0.1
SLACK = 0.25
PUBLISH = "/api/v1/ros/topics/publish"
SESSION = "X-Bloom-Runtime-Session"
MODE = "/mode_request"
SERVO = "/ui/visual_servoing/on"
GRIPPER = "/gripper_controller/commands"
DIGITAL = "/hub/digital_output"
MANAGER = "/cartesian_manager"
GAIN = "shapers.snake.gain"
TYPES = {
    MODE: "std_msgs/msg/String",
    SERVO: "std_msgs/msg/Bool",
    GRIPPER: "std_msgs/msg/Float64MultiArray",
    DIGITAL: "std_msgs/msg/Float32MultiArray",
}
MODES = (
    "geometric/both",
    "geometric/snake",
    "geometric/jaco",
    "behaviour/passthrough",
    "behaviour/joint_target/home",
    "behaviour/pose_target/ready",
)
ECHO_KEEP = ("commanded", "reset", "measured")


class RosGateway:
    """Publishes succeed unless told to fail; each one comes back later on the echo subscription."""

    def __init__(self) -> None:
        self.fail_next = False
        self.echoes: deque[RosPublishRequest] = deque()

    def publish(self, request: RosPublishRequest) -> RosPublishReceipt:
        if self.fail_next:
            self.fail_next = False
            raise RuntimeError("publisher is down")
        if request.topic in TYPES:
            self.echoes.append(request)
        return RosPublishReceipt(
            detail="ok", message_type=request.message_type, status="published", topic=request.topic
        )


class ParameterGateway:
    def set(self, request: RosParameterRequest) -> RosParameterReceipt:
        return RosParameterReceipt(
            node=request.node, name=request.name, value=request.value, status="set", detail="Parameter set."
        )

    def get(self, node: str, names: tuple[str, ...]) -> tuple:
        return ()


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


class Model:
    """What the store should hold, restated from ADR 0142 and the session manager's resets."""

    def __init__(self) -> None:
        self.entries: dict[str, tuple[Any, str, str]] = {}
        self.latched = False
        self.joint_pending: set[str] = set()
        self.shaping_pending: set[str] = set()
        self.servo_pending: set[str] = set()

    def write(self, key: str, value: Any, source: str, by: str, keep: tuple[str, ...] = ()) -> None:
        current = self.entries.get(key)
        if current is not None and current[1] in keep and current[0] == value:
            return
        self.entries[key] = (value, source, by)

    def unknown(self, keys) -> None:
        for key in list(keys):
            if key in self.entries and self.entries[key][1] != "unknown":
                self.entries[key] = (None, "unknown", "server")

    def apply(self, topic: str, data: Any, source: str, by: str, keep: tuple[str, ...] = ()) -> None:
        if topic == DIGITAL:
            for pin, state in zip(data[0::2], data[1::2], strict=True):
                self.write(f"{DIGITAL}:{int(pin)}", bool(state), source, by, keep)
            return
        if topic == GRIPPER:
            data = [float(item) for item in data]
        self.write(topic, {"data": data}, source, by, keep)
        if topic != MODE:
            return
        if data.startswith("geometric/"):
            self.write("manager:shaping", data, source, by, keep)
        elif data == "behaviour/passthrough":
            self.write("manager:behaviour", data, source, by, keep)
            self.write("manager:target", None, source, by, keep)
        elif data.startswith("behaviour/pose_target/"):
            self.write("manager:behaviour", "behaviour/pose_target", source, by, keep)
            self.write("manager:target", data, source, by, keep)
        else:
            self.write("manager:target", data, source, by, keep)
            self.write("manager:behaviour", "behaviour/passthrough", source, by, keep)

    def bloom_publish(self, session: str, topic: str, data: Any) -> None:
        self.apply(topic, data, "commanded", session_alias(session))
        if topic == MODE:
            if data == "geometric/both":
                self.shaping_pending.discard(session)
            elif data.startswith("geometric/"):
                self.shaping_pending.add(session)
            elif data == "behaviour/passthrough":
                self.joint_pending.discard(session)
            else:
                self.joint_pending.add(session)
        if topic == SERVO:
            if data:
                self.servo_pending.add(session)
            else:
                self.servo_pending.clear()

    def reset(self, topic: str, data: Any) -> None:
        self.apply(topic, data, "reset", "server")

    def stop(self) -> None:
        self.latched = True
        self.reset(MODE, "behaviour/passthrough")
        self.reset(MODE, "geometric/both")
        self.reset(SERVO, False)
        self.joint_pending.clear()
        self.shaping_pending.clear()
        self.servo_pending.clear()

    def leave(self, session: str) -> None:
        """What a leaving owner, or a displaced stale one, left set is reset in this order."""
        if session in self.joint_pending:
            self.reset(MODE, "behaviour/passthrough")
        if session in self.shaping_pending:
            self.reset(MODE, "geometric/both")
        if session in self.servo_pending:
            self.reset(SERVO, False)
        self.joint_pending.discard(session)
        self.shaping_pending.discard(session)
        self.servo_pending.discard(session)

    def manager_lost(self) -> None:
        self.unknown([key for key in self.entries if key.startswith(f"param:{MANAGER}:")])
        self.unknown(["manager:shaping", "manager:behaviour", "manager:target", MODE])


class Socket:
    def __init__(self, client: TestClient) -> None:
        self.session = client.websocket_connect("/api/v1/runtime/ws")
        self.session.__enter__()
        connected = self.session.receive_json()
        assert connected["type"] == "session_connected"
        self.id = connected["session_id"]

    def close(self) -> None:
        self.session.__exit__(None, None, None)

    def claim(self) -> bool:
        """Returns once the claim's reply is out, which is after any reset the claim owed."""
        self.session.send_json({"type": "claim_control"})
        while True:
            message = self.session.receive_json()
            if message.get("type") == "control_state":
                return message["payload"]["is_owner"]

    def latest_state(self, revision: int, timeout: float) -> tuple[dict, float]:
        started = time.monotonic()
        while time.monotonic() - started < timeout:
            message = self.session.receive_json()
            if message.get("type") == "command_state" and message["revision"] >= revision:
                return message, time.monotonic() - started
        raise AssertionError(f"socket {self.id} did not reach revision {revision}")


def owner_of(client: TestClient, sockets: list[Socket]) -> Socket | None:
    manager = client.app.state.runtime_session_manager
    return next((socket for socket in sockets if manager.is_control_owner(socket.id)), None)


ACTIONS = (
    "publish",
    "publish",
    "publish",
    "refused",
    "echo_own",
    "echo_other",
    "stop",
    "resume",
    "leave",
    "stale",
    "parameter_event",
    "parameter_set",
    "restart",
    "reconnect",
)


def run(seed: int, steps: int) -> Counter[str]:
    rng = random.Random(seed)
    ros = RosGateway()
    app = create_app(
        Settings(
            environment="test",
            runtime_control_required=True,
            command_state_push_period_sec=PERIOD,
            runtime_stop_state_path=Path(tempfile.mkdtemp()) / "runtime_stop.json",
        ),
        InMemoryConfigurationRepository(),
        ros_publisher_gateway=ros,
        ros_parameter_gateway=ParameterGateway(),
    )
    clock = Clock()
    app.state.runtime_session_manager._clock = clock
    tracker = app.state.command_state_tracker
    # The run is slower than a real echo; every echo it holds back is still Bloom's own.
    tracker._own_echo_window_sec = 3600.0
    store = app.state.command_state_store
    client = TestClient(app)
    model = Model()
    sockets = [Socket(client), Socket(client)]
    assert sockets[0].claim()
    engaged_at = ""
    ran: Counter[str] = Counter()

    def deliver_own_echoes(topic: str | None = None, count: int | None = None) -> None:
        pending = [request for request in ros.echoes if topic is None or request.topic == topic]
        for request in pending[: len(pending) if count is None else count]:
            ros.echoes.remove(request)
            tracker.record_echo(request.topic, request.message_type, request.payload)

    def random_command() -> tuple[str, Any]:
        topic = rng.choice((MODE, MODE, SERVO, GRIPPER, DIGITAL))
        if topic == MODE:
            return topic, rng.choice(MODES)
        if topic == SERVO:
            return topic, rng.random() < 0.5
        if topic == GRIPPER:
            return topic, [rng.choice((0.2, 1.1))]
        return topic, [float(rng.choice((3, 5))), float(rng.choice((0, 1)))]

    for _step in range(steps):
        owner = owner_of(client, sockets)
        action = rng.choice(ACTIONS)
        if action == "publish" and owner is not None:
            topic, data = random_command()
            response = client.post(
                PUBLISH,
                headers={SESSION: owner.id},
                json={"topic": topic, "message_type": TYPES[topic], "payload": {"data": data}},
            )
            if model.latched:
                assert response.status_code == 409
            else:
                assert response.status_code == 200, response.text
                model.bloom_publish(owner.id, topic, data)
        elif action == "refused" and owner is not None:
            topic, data = random_command()
            kind = rng.choice(("topic", "mode", "gateway"))
            if kind == "topic":
                body = {"topic": "/not/allowed", "message_type": TYPES[topic], "payload": {"data": data}}
            elif kind == "mode":
                body = {"topic": MODE, "message_type": TYPES[MODE], "payload": {"data": "geometric/unknown"}}
            else:
                ros.fail_next = True
                body = {"topic": topic, "message_type": TYPES[topic], "payload": {"data": data}}
            assert client.post(PUBLISH, headers={SESSION: owner.id}, json=body).status_code >= 400
            ros.fail_next = False
        elif action == "echo_own":
            deliver_own_echoes(count=rng.randint(1, 3))
        elif action == "echo_other":
            topic, data = random_command()
            # Bloom's own echo is milliseconds behind its publish: it lands before a person's next press.
            deliver_own_echoes(topic)
            tracker.record_echo(topic, TYPES[topic], {"data": data})
            model.apply(topic, data, "commanded", "other-publisher", ECHO_KEEP)
        elif action == "stop":
            response = client.post("/api/v1/runtime/stop")
            assert response.status_code == 200
            engaged_at = response.json()["engaged_at"]
            model.stop()
        elif action == "resume" and model.latched and owner is not None:
            response = client.post(
                "/api/v1/runtime/stop/resume", headers={SESSION: owner.id}, json={"engaged_at": engaged_at}
            )
            assert response.status_code == 200
            model.latched = False
            ran["resume"] += 1
        elif action == "leave" and owner is not None:
            sockets.remove(owner)
            owner.close()
            # The server lets go of the lease after its leave resets, on its own thread.
            deadline = time.monotonic() + 2
            while client.app.state.runtime_session_manager.control_snapshot().owner_present:
                assert time.monotonic() < deadline, "the leaving owner kept the lease"
                time.sleep(0.005)
            model.leave(owner.id)
            sockets.append(Socket(client))
            assert sockets[-1].claim()
        elif action == "stale" and owner is not None:
            claimer = next(socket for socket in sockets if socket is not owner)
            clock.now += 11.0
            assert claimer.claim()
            model.leave(owner.id)
        elif action == "parameter_event":
            value = rng.choice((0.1, 0.2, 0.3))
            tracker.record_parameter(MANAGER, GAIN, value)
            model.write(f"param:{MANAGER}:{GAIN}", value, "measured", "robot", ("measured",))
        elif action == "parameter_set" and owner is not None:
            value = rng.choice((0.1, 0.2, 0.3))
            response = client.post(
                "/api/v1/ros/parameters/set",
                headers={SESSION: owner.id},
                json={"node": MANAGER, "name": GAIN, "value": value},
            )
            assert response.status_code == 200
            model.write(f"param:{MANAGER}:{GAIN}", value, "measured", session_alias(owner.id), ("measured",))
        elif action == "restart":
            tracker.mark_node_lost(MANAGER)
            tracker.mark_manager_lost()
            model.manager_lost()
        elif action == "reconnect":
            watchers = [socket for socket in sockets if socket is not owner]
            if watchers:
                leaving = rng.choice(watchers)
                sockets.remove(leaving)
                leaving.close()
            sockets.append(Socket(client))

        if action != "resume":
            ran[action] += 1
        revision, snapshot = store.snapshot()
        assert {key: (entry["value"], entry["source"], entry["by"]) for key, entry in snapshot.items()} == (
            model.entries
        ), f"seed {seed} diverged after {action}"
        for socket in sockets:
            message, waited = socket.latest_state(revision, PERIOD + SLACK)
            assert message["revision"] == revision
            assert message["snapshot"] == snapshot
            assert waited <= PERIOD + SLACK

    for socket in sockets:
        socket.close()
    return ran


@pytest.mark.parametrize("seed", [1, 7, 42, 2026])
def test_every_socket_converges_on_the_store_and_the_store_on_the_model(seed: int) -> None:
    ran = run(seed, steps=80)

    assert set(ran) == set(ACTIONS), f"seed {seed} never ran {set(ACTIONS) - set(ran)}"
