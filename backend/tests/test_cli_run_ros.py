"""`bloom api run-ros` wires the API to one rclpy node and tears the node down after the server returns."""

from __future__ import annotations

import sys
import threading
import time
import types
from types import SimpleNamespace

import pytest
from typer.testing import CliRunner

from apps.bloom_api.settings import get_settings
from apps.bloom_cli.main import cli
from libs.ros_adapters.camera_frames import RclpyCameraFrameGateway
from libs.ros_adapters.camera_streams import RclpyCameraStreamGateway
from libs.ros_adapters.manipulability import ManipulabilityDerivingGateway
from libs.ros_adapters.parameters import RclpyRosParameterGateway
from libs.ros_adapters.rclpy_cartesian_manager import RclpyCartesianManagerGateway
from libs.ros_adapters.rclpy_publishers import RclpyRosPublisherGateway
from libs.ros_adapters.robot_model import RclpyRobotModelGateway
from libs.ros_adapters.services import RclpyRosServiceGateway
from libs.ros_adapters.topics import RclpyRosTopicCatalogGateway

POLLER_THREADS = {"teleop-target-directory", "command-state-feedback"}


class NeverAvailableClient:
    def wait_for_service(self, timeout_sec: float) -> bool:
        return False


class FakeNode:
    """The node surface the gateways and the background pollers touch while no robot is up."""

    instances: list[FakeNode] = []

    def __init__(self, name: str) -> None:
        self.name = name
        self.destroyed = False
        self.subscriptions = 0
        self.timers = 0
        FakeNode.instances.append(self)

    def create_client(self, service_cls, service: str) -> NeverAvailableClient:
        return NeverAvailableClient()

    def get_node_names_and_namespaces(self) -> list:
        return []

    def get_publishers_info_by_topic(self, topic: str) -> list:
        return []

    def count_publishers(self, topic: str) -> int:
        return 0

    def create_subscription(self, message_cls, topic, callback, qos) -> object:
        self.subscriptions += 1
        return object()

    def destroy_subscription(self, subscription) -> None:
        self.subscriptions -= 1

    def create_timer(self, period, callback) -> object:
        self.timers += 1
        return object()

    def destroy_timer(self, timer) -> None:
        self.timers -= 1

    def destroy_node(self) -> None:
        self.destroyed = True


class FakeExecutor:
    def __init__(self, log: list[str]) -> None:
        self.log = log
        self.nodes: list[FakeNode] = []
        self._stopped = threading.Event()

    def add_node(self, node: FakeNode) -> None:
        self.nodes.append(node)

    def spin(self) -> None:
        self._stopped.wait(5.0)

    def shutdown(self) -> None:
        self.log.append("executor.shutdown")
        self._stopped.set()


@pytest.fixture
def fake_rclpy(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    log: list[str] = []
    rclpy = types.ModuleType("rclpy")
    rclpy.init = lambda: log.append("rclpy.init")  # type: ignore[attr-defined]
    rclpy.shutdown = lambda: log.append("rclpy.shutdown")  # type: ignore[attr-defined]
    executors = types.ModuleType("rclpy.executors")
    executors.SingleThreadedExecutor = lambda: FakeExecutor(log)  # type: ignore[attr-defined]
    rclpy.executors = executors  # type: ignore[attr-defined]
    node = types.ModuleType("rclpy.node")
    node.Node = FakeNode  # type: ignore[attr-defined]
    qos = types.ModuleType("rclpy.qos")
    qos.HistoryPolicy = SimpleNamespace(KEEP_LAST=1)  # type: ignore[attr-defined]
    qos.QoSReliabilityPolicy = SimpleNamespace(RELIABLE=1, BEST_EFFORT=2)  # type: ignore[attr-defined]
    qos.QoSDurabilityPolicy = SimpleNamespace(TRANSIENT_LOCAL=1, VOLATILE=2)  # type: ignore[attr-defined]
    qos.QoSProfile = lambda **kwargs: kwargs  # type: ignore[attr-defined]
    for name, module in (("rclpy", rclpy), ("rclpy.executors", executors), ("rclpy.node", node), ("rclpy.qos", qos)):
        monkeypatch.setitem(sys.modules, name, module)
    FakeNode.instances.clear()
    # The CLI reads the environment once; this run must not seed the default store or keep its settings.
    monkeypatch.setenv("BLOOM_SEED_SHARED_APPLICATIONS", "false")
    get_settings.cache_clear()
    yield log
    get_settings.cache_clear()


def capture_uvicorn(monkeypatch: pytest.MonkeyPatch, log: list[str], error: Exception | None = None) -> dict:
    captured: dict = {}

    def fake_run(app, host: str, port: int, reload: bool) -> None:
        captured.update(app=app, host=host, port=port, reload=reload)
        log.append("uvicorn.run")
        captured["pollers_while_serving"] = {t.name for t in threading.enumerate()} & POLLER_THREADS
        if error is not None:
            raise error

    monkeypatch.setattr("apps.bloom_cli.main.uvicorn.run", fake_run)
    return captured


def wait_for_pollers_to_exit() -> set[str]:
    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline:
        alive = {thread.name for thread in threading.enumerate()} & POLLER_THREADS
        if not alive:
            return alive
        time.sleep(0.01)
    return {thread.name for thread in threading.enumerate()} & POLLER_THREADS


def test_run_ros_serves_the_api_on_one_node_with_every_ros_gateway(monkeypatch, fake_rclpy: list[str]) -> None:
    captured = capture_uvicorn(monkeypatch, fake_rclpy)

    result = CliRunner().invoke(
        cli, ["api", "run-ros", "--host", "0.0.0.0", "--port", "9001", "--node-name", "bloom_lab"]
    )

    assert result.exit_code == 0, result.output
    assert (captured["host"], captured["port"], captured["reload"]) == ("0.0.0.0", 9001, False)
    [node] = FakeNode.instances
    assert node.name == "bloom_lab"
    state = captured["app"].state
    assert isinstance(state.ros_publisher_gateway, RclpyRosPublisherGateway)
    assert isinstance(state.ros_parameter_gateway, RclpyRosParameterGateway)
    assert isinstance(state.robot_model_gateway, RclpyRobotModelGateway)
    assert isinstance(state.ros_service_gateway, RclpyRosServiceGateway)
    assert isinstance(state.ros_topic_catalog_gateway, RclpyRosTopicCatalogGateway)
    assert isinstance(state.runtime_topic_subscription_gateway, ManipulabilityDerivingGateway)
    assert isinstance(state.camera_frame_gateway, RclpyCameraFrameGateway)
    assert isinstance(state.camera_stream_gateway, RclpyCameraStreamGateway)
    assert isinstance(state.teleop_command_gateway, RclpyCartesianManagerGateway)
    assert captured["pollers_while_serving"] == POLLER_THREADS
    assert wait_for_pollers_to_exit() == set()
    assert fake_rclpy == ["rclpy.init", "uvicorn.run", "executor.shutdown", "rclpy.shutdown"]
    assert node.destroyed
    assert (node.subscriptions, node.timers) == (0, 0)


def test_run_ros_tears_the_node_down_when_the_server_fails(monkeypatch, fake_rclpy: list[str]) -> None:
    capture_uvicorn(monkeypatch, fake_rclpy, error=OSError("address already in use"))

    result = CliRunner().invoke(cli, ["api", "run-ros"])

    assert result.exit_code != 0
    assert isinstance(result.exception, OSError)
    assert fake_rclpy == ["rclpy.init", "uvicorn.run", "executor.shutdown", "rclpy.shutdown"]
    assert FakeNode.instances[0].destroyed
    assert wait_for_pollers_to_exit() == set()


def test_run_ros_without_rclpy_says_to_source_ros(monkeypatch) -> None:
    monkeypatch.setitem(sys.modules, "rclpy", None)
    started: list[object] = []
    monkeypatch.setattr("apps.bloom_cli.main.uvicorn.run", lambda *args, **kwargs: started.append(args))

    result = CliRunner().invoke(cli, ["api", "run-ros"])

    assert result.exit_code == 1
    assert "Source a ROS environment before running this command." in result.stderr
    assert started == []
