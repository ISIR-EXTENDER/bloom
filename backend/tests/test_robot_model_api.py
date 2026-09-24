"""The 3D robot view reads the running robot's description and the meshes it names."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters.parameters import RosParameterReading
from libs.ros_adapters.robot_model import RclpyRobotModelGateway, resolve_package_asset

URDF = '<robot name="explorer"><link name="base_link"/></robot>'


class FakeRobotModelGateway:
    def __init__(self, share: Path) -> None:
        self.share = share

    def description(self) -> str | None:
        return URDF

    def asset(self, package: str, relative_path: str) -> Path | None:
        return resolve_package_asset(
            package, relative_path, lambda name: self.share if name == "explorer_description" else None
        )


class FakeParameterGateway:
    def __init__(self, value: object) -> None:
        self.value = value
        self.calls: list[tuple[str, tuple[str, ...]]] = []

    def get(self, node: str, names: tuple[str, ...]) -> tuple[RosParameterReading, ...]:
        self.calls.append((node, names))
        return tuple(RosParameterReading(node=node, name=name, value=self.value) for name in names)


def make_client(gateway=None) -> TestClient:
    return TestClient(
        create_app(Settings(environment="test"), InMemoryConfigurationRepository(), robot_model_gateway=gateway)
    )


def test_without_ros_the_model_is_unavailable() -> None:
    response = make_client().get("/api/v1/ros/robot-model")
    assert response.status_code == 200
    assert response.json() == {"node": "/robot_state_publisher", "status": "unavailable", "urdf": None}


def test_the_running_description_is_served(tmp_path: Path) -> None:
    response = make_client(FakeRobotModelGateway(tmp_path)).get("/api/v1/ros/robot-model")
    assert response.json()["status"] == "ready"
    assert response.json()["urdf"] == URDF


def test_a_mesh_is_served_from_the_package_share(tmp_path: Path) -> None:
    (tmp_path / "meshes" / "visual").mkdir(parents=True)
    (tmp_path / "meshes" / "visual" / "link1.dae").write_text("<COLLADA/>")
    client = make_client(FakeRobotModelGateway(tmp_path))
    response = client.get("/api/v1/ros/robot-model/assets/explorer_description/meshes/visual/link1.dae")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("model/vnd.collada+xml")
    assert response.text == "<COLLADA/>"


def test_an_unknown_package_or_path_is_not_found(tmp_path: Path) -> None:
    client = make_client(FakeRobotModelGateway(tmp_path))
    assert client.get("/api/v1/ros/robot-model/assets/other_pkg/meshes/a.dae").status_code == 404
    assert client.get("/api/v1/ros/robot-model/assets/explorer_description/meshes/missing.dae").status_code == 404


def test_only_meshes_inside_the_share_are_resolved(tmp_path: Path) -> None:
    share = tmp_path / "share"
    share.mkdir()
    (share / "robot.stl").write_bytes(b"solid")
    (tmp_path / "secret.stl").write_bytes(b"solid")
    (share / "package.xml").write_text("<package/>")
    resolver = lambda name: share  # noqa: E731

    assert resolve_package_asset("pkg", "robot.stl", resolver) == share / "robot.stl"
    assert resolve_package_asset("pkg", "../secret.stl", resolver) is None
    assert resolve_package_asset("pkg", "meshes/../../secret.stl", resolver) is None
    # A symlink-installed workspace links each mesh into the source tree; the share vouches for it.
    (share / "linked.stl").symlink_to(tmp_path / "secret.stl")
    assert resolve_package_asset("pkg", "linked.stl", resolver) == share / "linked.stl"
    assert resolve_package_asset("pkg", "package.xml", resolver) is None
    assert resolve_package_asset("pkg", "/etc/passwd", resolver) is None


def test_the_rclpy_gateway_reads_the_parameter_once_per_call() -> None:
    parameters = FakeParameterGateway(URDF)
    gateway = RclpyRobotModelGateway(parameters, "/robot_state_publisher")
    assert gateway.description() == URDF
    assert parameters.calls == [("/robot_state_publisher", ("robot_description",))]

    assert RclpyRobotModelGateway(FakeParameterGateway(None), "/rsp").description() is None
    assert RclpyRobotModelGateway(FakeParameterGateway("   "), "/rsp").description() is None
